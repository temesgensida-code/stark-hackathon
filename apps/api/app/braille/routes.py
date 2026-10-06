"""HTTP routes for Braille translation, back-translation and BRF export."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import Response
from pydantic import BaseModel, Field, model_validator

from app.braille import service as svc

router = APIRouter(prefix="/braille", tags=["braille"])


class TranslateIn(BaseModel):
    text: str = Field(..., max_length=20_000)
    table: str = svc.DEFAULT_TABLE
    cursor: int = 0


class TranslateOut(BaseModel):
    table: str
    unicode: str
    cells: list[int]
    input_pos: list[int]
    output_pos: list[int]
    cursor: int


class BackTranslateIn(BaseModel):
    cells: list[int] | None = None
    unicode: str | None = None
    table: str = svc.DEFAULT_TABLE

    @model_validator(mode="after")
    def one_input(self):
        if (self.cells is None) == (self.unicode is None):
            raise ValueError("Send exactly one of 'cells' or 'unicode'.")
        if self.cells is not None and any(not 0 <= c <= 255 for c in self.cells):
            raise ValueError("Cells must be integers 0-255 (bit 0 = dot 1).")
        return self


class BrfIn(BaseModel):
    text: str = Field(..., max_length=500_000)
    table: str = svc.DEFAULT_TABLE
    width: int = Field(40, ge=10, le=80)
    height: int = Field(25, ge=5, le=60)


@router.get("/tables")
def list_tables():
    return [{"id": k, "label": v["label"], "lang": v["lang"]} for k, v in svc.TABLES.items()]


@router.post("/translate", response_model=TranslateOut)
def translate(body: TranslateIn):
    try:
        return svc.translate(body.text, body.table, body.cursor).__dict__
    except svc.UnknownTable as exc:
        raise HTTPException(422, str(exc))
    except RuntimeError as exc:
        raise HTTPException(500, f"Liblouis could not translate: {exc}")


@router.post("/back-translate")
def back_translate(body: BackTranslateIn):
    try:
        braille = body.cells if body.cells is not None else body.unicode
        return {"text": svc.back_translate(braille, body.table), "table": body.table}
    except (svc.UnknownTable, ValueError) as exc:
        raise HTTPException(422, str(exc))
    except RuntimeError as exc:
        raise HTTPException(500, f"Liblouis could not back-translate: {exc}")


@router.post("/brf")
def brf(body: BrfIn):
    try:
        data = svc.to_brf(body.text, body.table, body.width, body.height)
    except svc.UnknownTable as exc:
        raise HTTPException(422, str(exc))
    return Response(
        content=data.encode("ascii"),
        media_type="application/x-brf",
        headers={"Content-Disposition": 'attachment; filename="braille-talks.brf"'},
    )


class SimulationHub:
    def __init__(self, cell_count: int = 40):
        self.cells: list[int] = [0] * cell_count
        self.listeners: list[WebSocket] = []
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        async with self._lock:
            self.listeners.append(ws)
        # Send hello handshake with 40-cell configuration
        await ws.send_json({
            "type": "hello",
            "driver": "virtual-sim",
            "model": "Virtual 40-Cell Display",
            "cells": len(self.cells),
            "rows": 1,
            "version": 1,
        })
        # Send current cell state
        await ws.send_json({"type": "write", "cells": list(self.cells)})

    async def disconnect(self, ws: WebSocket):
        async with self._lock:
            if ws in self.listeners:
                self.listeners.remove(ws)

    def update_cells(self, cells: list[int]) -> list[int]:
        size = len(self.cells)
        clean = [int(c) & 0xFF for c in cells[:size]]
        self.cells = clean + [0] * (size - len(clean))
        return self.cells

    async def broadcast(self, message: dict, sender: WebSocket | None = None):
        async with self._lock:
            targets = list(self.listeners)
        for ws in targets:
            if ws != sender:
                try:
                    await ws.send_json(message)
                except Exception:
                    pass


hub = SimulationHub()


@router.websocket("/simulate")
async def simulate_braille_ws(websocket: WebSocket):
    await hub.connect(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")
            if msg_type == "write":
                cells = data.get("cells", [])
                if isinstance(cells, list):
                    updated = hub.update_cells(cells)
                    await hub.broadcast({"type": "write", "cells": updated}, sender=websocket)
            elif msg_type == "info":
                await websocket.send_json({
                    "type": "hello",
                    "driver": "virtual-sim",
                    "model": "Virtual 40-Cell Display",
                    "cells": len(hub.cells),
                    "rows": 1,
                    "version": 1,
                })
                await websocket.send_json({"type": "write", "cells": list(hub.cells)})
            elif msg_type == "key":
                await hub.broadcast(data, sender=websocket)
            elif msg_type == "reset":
                updated = hub.update_cells([])
                await hub.broadcast({"type": "write", "cells": updated})
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        await hub.disconnect(websocket)


@router.get("/simulate/state")
def get_simulate_state():
    return {
        "cells": hub.cells,
        "listeners": len(hub.listeners),
        "model": "Virtual 40-Cell Display",
    }

