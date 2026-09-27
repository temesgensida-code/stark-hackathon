import asyncio
import json
import sys
from pathlib import Path

import pytest
import websockets

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import braille_bridge as bb

brlapi = pytest.importorskip("brlapi")
CMD = brlapi.KEY_TYPE_CMD
SYM = brlapi.KEY_TYPE_SYM


@pytest.mark.parametrize(
    "code,expected",
    [
        (CMD | brlapi.KEY_CMD_ROUTE | 7, {"kind": "route", "index": 7}),
        (CMD | brlapi.KEY_CMD_FWINLT, {"kind": "pan", "dir": "left"}),
        (CMD | brlapi.KEY_CMD_FWINRTSKIP, {"kind": "pan", "dir": "right"}),
        (CMD | brlapi.KEY_CMD_LNDN, {"kind": "line", "dir": "down"}),
        (CMD | brlapi.KEY_CMD_PASSDOTS | (brlapi.DOT1 | brlapi.DOT2 | brlapi.DOT5), {"kind": "dots", "dots": 0b10011}),
        (CMD | brlapi.KEY_CMD_PASSDOTS, {"kind": "space"}),
        (SYM | brlapi.KEY_SYM_BACKSPACE, {"kind": "backspace"}),
        (SYM | brlapi.KEY_SYM_LINEFEED, {"kind": "enter"}),
        (SYM | ord("a"), {"kind": "char", "char": "a"}),
        (SYM | brlapi.KEY_SYM_UNICODE | ord("ም"), {"kind": "char", "char": "ም"}),
    ],
)
def test_decode_brlapi_key(code, expected):
    event = bb.decode_brlapi_key(code)
    assert event["type"] == "key"
    assert {k: v for k, v in event.items() if k != "type"} == expected


def test_mock_command_parser():
    assert bb.MockBackend.parse_command("dots 1-2-5")["dots"] == 0b10011
    assert bb.MockBackend.parse_command("route 3") == {"type": "key", "kind": "route", "index": 3}
    assert bb.MockBackend.parse_command("nonsense") is None


async def _run_bridge(port):
    backend = bb.MockBackend(cells=20, interactive=False)
    bridge = bb.Bridge(backend, {"https://app.example"})
    ready = asyncio.Event()
    task = asyncio.create_task(bridge.run("127.0.0.1", port, ready))
    await ready.wait()
    return backend, task


def test_bridge_end_to_end():
    async def scenario():
        backend, task = await _run_bridge(18765)
        try:
            async with websockets.connect("ws://127.0.0.1:18765", origin="https://app.example") as ws:
                hello = json.loads(await ws.recv())
                assert hello["type"] == "hello" and hello["cells"] == 20

                await ws.send(json.dumps({"type": "write", "cells": [1, 3, 9]}))
                await asyncio.sleep(0.05)
                assert backend.last_written == bytes([1, 3, 9] + [0] * 17)

                backend.press({"type": "key", "kind": "route", "index": 4})
                assert json.loads(await ws.recv()) == {"type": "key", "kind": "route", "index": 4}

            # A page from another origin must be refused.
            with pytest.raises(websockets.ConnectionClosed):
                async with websockets.connect("ws://127.0.0.1:18765", origin="https://evil.example") as ws:
                    await ws.recv()
        finally:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    asyncio.run(scenario())
