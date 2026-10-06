import { test } from "node:test";
import assert from "node:assert/strict";
import { VirtualBrailleDisplay, virtualSimulatorBus } from "../lib/braille/virtualDisplay";
import { BrailleManager, Translator, Translation } from "../lib/braille/brailleManager";
import { BrailleKeyEvent, dotsToMask } from "../lib/braille/types";

class MockTranslator implements Translator {
  async translate(text: string): Promise<Translation> {
    const cells = Array.from(text).map((c) => c.charCodeAt(0) & 0xff);
    const input_pos = cells.map((_, i) => i);
    const output_pos = input_pos;
    return { cells, input_pos, output_pos };
  }

  async backTranslate(cells: number[]): Promise<string> {
    // If dots 1-2-5 (mask 19), return "h"
    if (cells.length === 1 && cells[0] === dotsToMask([1, 2, 5])) {
      return "h";
    }
    return cells.map((c) => String.fromCharCode(c)).join("");
  }
}

test("VirtualBrailleDisplay local mode satisfies BrailleDisplay interface", async () => {
  const display = VirtualBrailleDisplay.connectLocal(40);
  assert.equal(display.info.transport, "virtual");
  assert.equal(display.info.cells, 40);
  assert.equal(display.info.rows, 1);

  // Test cell writes to virtualSimulatorBus
  const sampleCells = new Uint8Array([1, 2, 4, 8, 16]);
  await display.write(sampleCells);
  assert.equal(virtualSimulatorBus.cells[0], 1);
  assert.equal(virtualSimulatorBus.cells[1], 2);
  assert.equal(virtualSimulatorBus.cells[2], 4);
  assert.equal(virtualSimulatorBus.cells[3], 8);
  assert.equal(virtualSimulatorBus.cells[4], 16);
  assert.equal(virtualSimulatorBus.cells[5], 0);

  // Test key dispatching
  const receivedKeys: BrailleKeyEvent[] = [];
  const unsub = display.onKey((k) => receivedKeys.push(k));

  virtualSimulatorBus.sendKey({ kind: "route", index: 12 });
  virtualSimulatorBus.sendKey({ kind: "pan", dir: "right" });
  virtualSimulatorBus.sendKey({ kind: "line", dir: "up" });
  virtualSimulatorBus.sendKey({ kind: "dots", dots: 27 });

  assert.equal(receivedKeys.length, 4);
  assert.deepEqual(receivedKeys[0], { kind: "route", index: 12 });
  assert.deepEqual(receivedKeys[1], { kind: "pan", dir: "right" });
  assert.deepEqual(receivedKeys[2], { kind: "line", dir: "up" });
  assert.deepEqual(receivedKeys[3], { kind: "dots", dots: 27 });

  unsub();
  await display.close();
});

test("VirtualBrailleDisplay works seamlessly with BrailleManager", async () => {
  const routes: number[] = [];
  const typed: string[] = [];
  const navs: string[] = [];

  const manager = new BrailleManager(new MockTranslator(), "en-ueb-g2", {
    onRoute: (i) => routes.push(i),
    onTyped: (t) => typed.push(t),
    onNavigate: (d) => navs.push(d),
  });

  const display = VirtualBrailleDisplay.connectLocal(40);
  await manager.attach(display);

  // Show text on virtual display
  await manager.show("Virtual Braille Test");
  assert.equal(virtualSimulatorBus.cells[0], "V".charCodeAt(0));
  assert.equal(virtualSimulatorBus.cells[1], "i".charCodeAt(0));

  // Route key at index 1 -> calls onRoute(1)
  virtualSimulatorBus.sendKey({ kind: "route", index: 1 });
  assert.equal(routes.length, 1);
  assert.equal(routes[0], 1);

  // Type chord dots 1-2-5 ("h") and then space
  const hMask = dotsToMask([1, 2, 5]);
  virtualSimulatorBus.sendKey({ kind: "dots", dots: hMask });
  virtualSimulatorBus.sendKey({ kind: "space" });

  await new Promise((r) => setTimeout(r, 20));

  assert.equal(typed.length, 1);
  assert.equal(typed[0], "h ");

  await manager.detach();
});

test("VirtualSimulatorBus reset and subscribers", () => {
  let writeCallCount = 0;
  const unsub = virtualSimulatorBus.onWrite(() => {
    writeCallCount++;
  });

  virtualSimulatorBus.setCells([5, 10, 15]);
  assert.equal(virtualSimulatorBus.cells[0], 5);
  assert.equal(virtualSimulatorBus.cells[1], 10);
  assert.equal(virtualSimulatorBus.cells[2], 15);

  virtualSimulatorBus.reset();
  assert.equal(virtualSimulatorBus.cells[0], 0);
  assert.equal(virtualSimulatorBus.cells[1], 0);
  assert.ok(writeCallCount >= 2);

  unsub();
});
