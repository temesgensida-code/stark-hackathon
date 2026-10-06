import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, ChildProcess } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { VirtualBrailleDisplay, virtualSimulatorBus } from "../lib/braille/virtualDisplay";
import { ApiTranslator, BrailleManager } from "../lib/braille/brailleManager";

const PY = process.env.PYTHON ?? "python3";
const API_PORT = "8098";
const WS_URL = `ws://127.0.0.1:${API_PORT}/braille/simulate`;
const procs: ChildProcess[] = [];

before(async () => {
  const apiProc = spawn(
    PY,
    ["-m", "uvicorn", "app.main:app", "--port", API_PORT, "--log-level", "warning"],
    {
      cwd: new URL("../../api", import.meta.url).pathname,
      stdio: "ignore",
    },
  );
  procs.push(apiProc);

  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${API_PORT}/health`)).ok) break;
    } catch {}
    await sleep(100);
  }
  await sleep(200);
});

after(() => {
  procs.forEach((p) => p.kill());
});

test("VirtualBrailleDisplay connects over WebSocket to FastAPI /braille/simulate", async () => {
  const display = await VirtualBrailleDisplay.connectWs(WS_URL);
  assert.equal(display.info.transport, "virtual");
  assert.equal(display.info.cells, 40);
  assert.equal(display.mode, "ws");

  const manager = new BrailleManager(
    new ApiTranslator(`http://127.0.0.1:${API_PORT}`),
    "en-ueb-g2",
  );
  await manager.attach(display);

  // Write text
  await manager.show("WebSocket Virtual Braille");
  await sleep(100);

  // Verify virtualSimulatorBus received the cells
  assert.ok(virtualSimulatorBus.cells[0] > 0);

  // Route key
  const routes: number[] = [];
  const m = new BrailleManager(
    new ApiTranslator(`http://127.0.0.1:${API_PORT}`),
    "en-ueb-g2",
    { onRoute: (i) => routes.push(i) },
  );
  await m.attach(display);
  await m.show("abc");
  await m.handleKey({ kind: "route", index: 0 });
  assert.equal(routes.length, 1);

  await manager.detach();
  await display.close();
});
