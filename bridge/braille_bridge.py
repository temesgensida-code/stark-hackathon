#!/usr/bin/env python3
"""Braille Talks local bridge.

Connects a refreshable Braille display on the user's computer to the Braille
Talks web app. BRLTTY already drives 50+ display families (USB, Bluetooth,
serial); this bridge talks to BRLTTY through BrlAPI and exposes the display
to the browser over a WebSocket on 127.0.0.1.

    browser (Braille Talks)  <--ws://127.0.0.1:8765-->  bridge  <--BrlAPI-->  BRLTTY  <--USB/BT-->  display

Run:
    python3 braille_bridge.py --allow-origin https://braille-talks.ethiodeploy.app
    python3 braille_bridge.py --mock          # no hardware: simulated 40-cell display in this terminal

Protocol (JSON text frames):
    bridge -> app  {"type":"hello","driver":"...","model":"...","cells":40,"rows":1,"version":1}
    app -> bridge  {"type":"write","cells":[0-255,...]}    bit 0 = dot 1 ... bit 7 = dot 8
    app -> bridge  {"type":"info"}                          re-sends hello
    bridge -> app  {"type":"key","kind":"route","index":5}
                   {"type":"key","kind":"pan","dir":"left"|"right"}
                   {"type":"key","kind":"line","dir":"up"|"down"}
                   {"type":"key","kind":"dots","dots":27}      typed braille chord
                   {"type":"key","kind":"chord","dots":14}     space + dots: a command (Space + S = summarize)
                   {"type":"key","kind":"space"} | {"kind":"enter"} | {"kind":"backspace"} | {"kind":"escape"}
                   {"type":"key","kind":"char","char":"a"}     display typed a character
                   {"type":"key","kind":"command","code":1234} anything else
    bridge -> app  {"type":"error","message":"..."}

Security: the bridge listens on 127.0.0.1 only, and only pages whose Origin
is in --allow-origin (plus localhost dev servers) may connect, so other
websites cannot read keys from, or write to, the display.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
from typing import Callable

import websockets
from websockets.asyncio.server import ServerConnection, serve

log = logging.getLogger("braille-bridge")
PROTOCOL_VERSION = 1
DEV_ORIGINS = {"http://localhost:3000", "http://127.0.0.1:3000"}

try:  # BrlAPI ships with BRLTTY: apt install brltty python3-brlapi
    import brlapi  # type: ignore
except ImportError:  # pragma: no cover - mock mode still works
    brlapi = None


# ------------------------------------------------------------------ key decode


def decode_brlapi_key(code: int, b=None) -> dict:
    """Translate a BrlAPI key code into a bridge key event."""
    b = b or brlapi
    key_type = code & b.KEY_TYPE_MASK
    value = code & b.KEY_CODE_MASK

    if key_type == b.KEY_TYPE_SYM:
        named = {
            b.KEY_SYM_BACKSPACE: "backspace",
            b.KEY_SYM_LINEFEED: "enter",
            b.KEY_SYM_ESCAPE: "escape",
            b.KEY_SYM_TAB: "tab",
            b.KEY_SYM_UP: "up",
            b.KEY_SYM_DOWN: "down",
            b.KEY_SYM_LEFT: "left",
            b.KEY_SYM_RIGHT: "right",
        }
        masked = {k & b.KEY_CODE_MASK: v for k, v in named.items()}
        if value in masked:
            return {"type": "key", "kind": masked[value]}
        if value & b.KEY_SYM_UNICODE:
            return {"type": "key", "kind": "char", "char": chr(value & 0xFFFFFF)}
        if value < 0x100:
            ch = chr(value)
            return {"type": "key", "kind": "space"} if ch == " " else {"type": "key", "kind": "char", "char": ch}
        return {"type": "key", "kind": "command", "code": code}

    block = value & b.KEY_CMD_BLK_MASK
    arg = value & b.KEY_CMD_ARG_MASK
    if block == b.KEY_CMD_ROUTE:
        return {"type": "key", "kind": "route", "index": arg}
    if block == b.KEY_CMD_PASSDOTS:
        dots = arg & 0xFF
        if arg & getattr(b, "DOTC", 0x100) and dots:  # space held with the dots: a command chord (Space + S...)
            return {"type": "key", "kind": "chord", "dots": dots}
        return {"type": "key", "kind": "space"} if dots == 0 else {"type": "key", "kind": "dots", "dots": dots}
    if block == 0:
        simple = {
            b.KEY_CMD_FWINLT: ("pan", "left"),
            b.KEY_CMD_FWINLTSKIP: ("pan", "left"),
            b.KEY_CMD_FWINRT: ("pan", "right"),
            b.KEY_CMD_FWINRTSKIP: ("pan", "right"),
            b.KEY_CMD_LNUP: ("line", "up"),
            b.KEY_CMD_LNDN: ("line", "down"),
        }
        if arg in simple:
            kind, direction = simple[arg]
            return {"type": "key", "kind": kind, "dir": direction}
    return {"type": "key", "kind": "command", "code": code}


# -------------------------------------------------------------------- backends


class Backend:
    driver = "unknown"
    model = "unknown"
    cells = 0
    rows = 1

    def start(self, loop: asyncio.AbstractEventLoop, on_key: Callable[[dict], None]) -> None: ...
    def write(self, cells: list[int]) -> None: ...
    def close(self) -> None: ...

    def hello(self) -> dict:
        return {
            "type": "hello",
            "driver": self.driver,
            "model": self.model,
            "cells": self.cells,
            "rows": self.rows,
            "version": PROTOCOL_VERSION,
        }

    def fit(self, cells: list[int]) -> bytes:
        size = self.cells * self.rows
        data = [c & 0xFF for c in cells[:size]]
        return bytes(data + [0] * (size - len(data)))


class BrlapiBackend(Backend):
    def __init__(self, host: str | None = None, auth: str | None = None):
        if brlapi is None:
            raise RuntimeError("BrlAPI not installed. Install BRLTTY and python3-brlapi, or run with --mock.")
        self.conn = brlapi.Connection(host, auth) if host or auth else brlapi.Connection()
        self.driver = self.conn.driverName
        self.model = getattr(self.conn, "modelIdentifier", "") or self.driver
        self.cells, self.rows = self.conn.displaySize
        if self.cells == 0:
            raise RuntimeError("BRLTTY is running but no Braille display is connected.")
        try:
            self.conn.enterTtyMode()
        except (brlapi.ConnectionError, brlapi.OperationError):
            # Graphical sessions have no controlling tty: take the whole display.
            self.conn.enterTtyModeWithPath([])
        self.conn.acceptAllKeys()

    def start(self, loop, on_key):
        def readable():
            while True:
                code = self.conn.readKey(False)
                if not code:  # None/0 = no pending key
                    break
                on_key(decode_brlapi_key(code))

        loop.add_reader(self.conn.fileDescriptor, readable)

    def write(self, cells):
        self.conn.writeDots(self.fit(cells))

    def close(self):
        try:
            self.conn.leaveTtyMode()
            self.conn.closeConnection()
        except Exception:  # pragma: no cover
            pass


class MockBackend(Backend):
    """Simulated display: prints cells to the terminal, reads keys from stdin.

    stdin commands: route N | left | right | up | down | dots 1-2-5 | chord 2-3-4 | space | enter | backspace
    """

    driver = "mock"
    model = "Mock 40-cell display"

    def __init__(self, cells: int = 40, interactive: bool = True):
        self.cells = cells
        self.interactive = interactive
        self.last_written: bytes = b""
        self._on_key: Callable[[dict], None] | None = None

    @staticmethod
    def parse_command(line: str) -> dict | None:
        parts = line.strip().split()
        if not parts:
            return None
        cmd, rest = parts[0].lower(), parts[1:]
        if cmd == "route" and rest:
            return {"type": "key", "kind": "route", "index": int(rest[0])}
        if cmd in ("left", "right"):
            return {"type": "key", "kind": "pan", "dir": cmd}
        if cmd in ("up", "down"):
            return {"type": "key", "kind": "line", "dir": cmd}
        if cmd in ("dots", "chord") and rest:
            mask = 0
            for d in rest[0].replace(",", "-").split("-"):
                mask |= 1 << (int(d) - 1)
            return {"type": "key", "kind": cmd, "dots": mask}
        if cmd in ("space", "enter", "backspace", "escape"):
            return {"type": "key", "kind": cmd}
        return None

    def start(self, loop, on_key):
        self._on_key = on_key
        if self.interactive and sys.stdin.isatty():
            def readable():
                event = self.parse_command(sys.stdin.readline())
                if event:
                    on_key(event)
            loop.add_reader(sys.stdin.fileno(), readable)

    def press(self, event: dict) -> None:
        if self._on_key:
            self._on_key(event)

    def write(self, cells):
        self.last_written = self.fit(cells)
        if self.interactive:
            print("|" + "".join(chr(0x2800 + c) for c in self.last_written) + "|", flush=True)


# ---------------------------------------------------------------------- server


class Bridge:
    def __init__(self, backend: Backend, allowed_origins: set[str]):
        self.backend = backend
        self.allowed = allowed_origins | DEV_ORIGINS
        self.clients: set[ServerConnection] = set()

    def broadcast(self, event: dict) -> None:
        msg = json.dumps(event)
        for ws in list(self.clients):
            asyncio.ensure_future(ws.send(msg))

    async def handler(self, ws: ServerConnection) -> None:
        origin = ws.request.headers.get("Origin") if ws.request else None
        # Browsers always send Origin on WebSocket handshakes, so this blocks
        # other websites. Local non-browser tools (tests, websocat) send none.
        if origin is not None and origin not in self.allowed:
            log.warning("Rejected connection from origin %s", origin)
            await ws.close(4003, "origin not allowed")
            return
        self.clients.add(ws)
        log.info("App connected from %s", origin)
        try:
            await ws.send(json.dumps(self.backend.hello()))
            async for raw in ws:
                try:
                    msg = json.loads(raw)
                    if msg.get("type") == "write":
                        self.backend.write([int(c) for c in msg.get("cells", [])])
                    elif msg.get("type") == "info":
                        await ws.send(json.dumps(self.backend.hello()))
                except (ValueError, TypeError) as exc:
                    await ws.send(json.dumps({"type": "error", "message": str(exc)}))
        except websockets.ConnectionClosed:
            pass
        finally:
            self.clients.discard(ws)
            log.info("App disconnected")

    async def run(self, host: str, port: int, ready: asyncio.Event | None = None) -> None:
        loop = asyncio.get_running_loop()
        self.backend.start(loop, self.broadcast)
        async with serve(self.handler, host, port) as server:
            log.info("Braille bridge on ws://%s:%d (%s, %d cells)", host, port, self.backend.model, self.backend.cells)
            if ready:
                ready.set()
            await server.serve_forever()


def main() -> None:
    p = argparse.ArgumentParser(description="Braille Talks local Braille display bridge")
    p.add_argument("--port", type=int, default=8765)
    p.add_argument("--host", default="127.0.0.1", help="keep on 127.0.0.1; never expose to the network")
    p.add_argument("--allow-origin", action="append", default=[], help="web app origin allowed to connect (repeatable)")
    p.add_argument("--mock", action="store_true", help="simulate a display in this terminal")
    p.add_argument("--cells", type=int, default=40, help="cells for --mock")
    p.add_argument("--brlapi-host", default=None)
    p.add_argument("-v", "--verbose", action="store_true")
    args = p.parse_args()
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO, format="%(message)s")

    try:
        backend = MockBackend(args.cells) if args.mock else BrlapiBackend(args.brlapi_host)
    except Exception as exc:
        log.error("Could not open the Braille display: %s", exc)
        sys.exit(1)
    try:
        asyncio.run(Bridge(backend, set(args.allow_origin)).run(args.host, args.port))
    except KeyboardInterrupt:
        pass
    finally:
        backend.close()


if __name__ == "__main__":
    main()
