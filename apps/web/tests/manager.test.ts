/**
 * Integration test: BrailleManager against the real FastAPI + Liblouis API
 * and the real Python bridge (mock display), started as subprocesses.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, ChildProcess } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { ApiTranslator, BrailleManager } from "../lib/braille/brailleManager";
import { BridgeDisplay } from "../lib/braille/bridgeDisplay";
import { BrailleDisplay, BrailleKeyEvent, Emitter, cellsToUnicode, dotsToMask } from "../lib/braille/types";

const PY = process.env.PYTHON ?? "/usr/bin/python3.12";
const API = "http://127.0.0.1:8099";
const procs: ChildProcess[] = [];
let bridgeOut = "";

before(async () => {
  procs.push(
    spawn(PY, ["-m", "uvicorn", "app.main:app", "--port", "8099", "--log-level", "warning"], {
      cwd: new URL("../../api", import.meta.url).pathname,
      stdio: "inherit",
    }),
  );
  const bridge = spawn(PY, ["-u", "braille_bridge.py", "--mock", "--cells", "20", "--port", "8766"], {
    cwd: new URL("../../../bridge", import.meta.url).pathname,
  });
  bridge.stdout!.on("data", (d) => (bridgeOut += d.toString()));
  procs.push(bridge);
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${API}/braille/tables`)).ok) break;
    } catch {}
    await sleep(100);
  }
  await sleep(300);
});
after(() => procs.forEach((p) => p.kill()));

class FakeDisplay implements BrailleDisplay {
  info = { transport: "webhid" as const, name: "Fake 10", cells: 10, rows: 1 };
  written: Uint8Array[] = [];
  keys = new Emitter<BrailleKeyEvent>();
  async write(c: Uint8Array) {
    this.written.push(c);
  }
  onKey(l: (e: BrailleKeyEvent) => void) {
    return this.keys.on(l);
  }
  onDisconnect() {
    return () => {};
  }
  async close() {}
  last() {
    return cellsToUnicode(this.written.at(-1)!);
  }
}

test("show, pan, route and type with real Liblouis", async () => {
  const events: string[] = [];
  const m = new BrailleManager(new ApiTranslator(API), "en-ueb-g2", {
    onRoute: (i) => events.push(`route:${i}`),
    onNavigate: (d) => events.push(`nav:${d}`),
    onTyped: (t) => events.push(`typed:${t}`),
  });
  const d = new FakeDisplay();
  await m.attach(d);

  const text = "Braille talks for researchers";
  await m.show(text);
  assert.equal(d.last(), "⠠⠃⠗⠇⠀⠞⠁⠇⠅⠎"); // first 10 cells

  await m.handleKey({ kind: "pan", dir: "right" });
  assert.equal(d.last(), "⠀⠿⠀⠗⠑⠎⠑⠜⠡⠻");

  // Routing key over cell 3 of this window = braille cell 13 = the "r" of "researchers"
  await m.handleKey({ kind: "route", index: 3 });
  assert.equal(text[Number(events.at(-1)!.split(":")[1])], "r");

  await m.handleKey({ kind: "pan", dir: "right" });
  await m.handleKey({ kind: "pan", dir: "right" });
  assert.equal(events.at(-1), "nav:next");

  // Type "the" (one contracted cell, dots 2-3-4-6) then space
  await m.handleKey({ kind: "dots", dots: dotsToMask([2, 3, 4, 6]) });
  await m.handleKey({ kind: "space" });
  assert.equal(events.at(-1), "typed:the ");
});

test("Amharic table through the manager", async () => {
  const typed: string[] = [];
  const m = new BrailleManager(new ApiTranslator(API), "am-g1", { onTyped: (t) => typed.push(t) });
  await m.attach(new FakeDisplay());
  // ም = dots 1-3-4 (m) as a sixth-order consonant
  await m.handleKey({ kind: "dots", dots: dotsToMask([1, 3, 4]) });
  await m.handleKey({ kind: "space" });
  assert.equal(typed[0], "ም ");
});

test("bridge transport end to end (mock display)", async () => {
  const display = await BridgeDisplay.connect("ws://127.0.0.1:8766");
  assert.equal(display.info.cells, 20);
  assert.equal(display.info.transport, "bridge");
  const m = new BrailleManager(new ApiTranslator(API), "en-ueb-g2");
  await m.attach(display);
  await m.show("hello world");
  await sleep(200);
  assert.match(bridgeOut, /\|⠓⠑⠇⠇⠕⠀⠸⠺⠀+\|/); // "world" contracts to dots 456 + w in UEB Grade 2
  await m.detach();
});
