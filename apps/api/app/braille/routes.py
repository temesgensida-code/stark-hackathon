"""HTTP routes for Braille translation, back-translation and BRF export."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
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
