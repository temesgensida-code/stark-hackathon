import { test } from "node:test";
import assert from "node:assert/strict";
import {
  USAGE,
  parseBrailleLayout,
  buildCellReport,
  decodePressed,
  gestureToEvent,
  HidCollectionLike,
} from "../lib/braille/hidBrailleDisplay";

// A 20-cell HID Braille display, described the way WebHID exposes it.
const pad = (bits: number) => ({ isConstant: true, reportSize: 1, reportCount: bits });
const display20: HidCollectionLike = {
  usagePage: 0x41,
  usage: 0x01,
  outputReports: [{ reportId: 1, items: [{ usages: [USAGE.CELL_8_DOT], reportSize: 8, reportCount: 20 }] }],
  inputReports: [
    {
      reportId: 2,
      items: [
        { isRange: true, usageMinimum: USAGE.DOT_1, usageMaximum: USAGE.DOT_1 + 7, reportSize: 1, reportCount: 8 }, // bits 0-7
        { usages: [USAGE.SPACE, USAGE.LEFT_SPACE, USAGE.RIGHT_SPACE], reportSize: 1, reportCount: 3 }, // bits 8-10
        pad(5), // bits 11-15
        { usages: [USAGE.PAN_LEFT, USAGE.PAN_RIGHT, USAGE.ROCKER_UP, USAGE.ROCKER_DOWN], reportSize: 1, reportCount: 4 }, // 16-19
        pad(4), // 20-23
      ],
    },
    {
      reportId: 3,
      items: [{ usages: Array(20).fill(USAGE.ROUTER_KEY), reportSize: 1, reportCount: 20 }, pad(4)],
    },
  ],
};

const bits = (n: number, ...set: number[]) => {
  const buf = new Uint8Array(n);
  for (const b of set) buf[b >> 3] |= 1 << (b & 7);
  return new DataView(buf.buffer);
};

test("parses cell count and output report", () => {
  const layout = parseBrailleLayout(display20)!;
  assert.equal(layout.cells, 20);
  assert.equal(layout.cellBits, 8);
  assert.deepEqual(layout.output, { reportId: 1, bytes: 20, cellBitOffset: 0, cellSize: 8 });
});

test("builds the output report from cells", () => {
  const layout = parseBrailleLayout(display20)!;
  const report = buildCellReport(layout, [1, 3, 9]);
  assert.equal(report.length, 20);
  assert.deepEqual([...report.slice(0, 4)], [1, 3, 9, 0]);
});

test("6-dot display with a leading constant byte", () => {
  const layout = parseBrailleLayout({
    usagePage: 0x41,
    usage: 1,
    outputReports: [{ reportId: 0, items: [pad(8), { usages: [USAGE.CELL_6_DOT], reportSize: 8, reportCount: 12 }] }],
  })!;
  assert.equal(layout.cellBits, 6);
  assert.equal(layout.output.cellBitOffset, 8);
  const r = buildCellReport(layout, [0xff]);
  assert.equal(r[0], 0);
  assert.equal(r[1], 0x3f); // dots 7-8 masked off
});

test("typed chord dots 1-2-5 becomes a dots event", () => {
  const layout = parseBrailleLayout(display20)!;
  const keys = decodePressed(layout, 2, bits(3, 0, 1, 4));
  assert.deepEqual(gestureToEvent(keys), { kind: "dots", dots: 0b10011 });
});

test("space alone, space + dots, dot 7 and dot 8", () => {
  const layout = parseBrailleLayout(display20)!;
  assert.deepEqual(gestureToEvent(decodePressed(layout, 2, bits(3, 8))), { kind: "space" });
  assert.deepEqual(gestureToEvent(decodePressed(layout, 2, bits(3, 9, 0, 2))), { kind: "chord", dots: 0b101 });
  assert.deepEqual(gestureToEvent(decodePressed(layout, 2, bits(3, 6))), { kind: "backspace" });
  assert.deepEqual(gestureToEvent(decodePressed(layout, 2, bits(3, 7))), { kind: "enter" });
});

test("panning and rocker keys", () => {
  const layout = parseBrailleLayout(display20)!;
  assert.deepEqual(gestureToEvent(decodePressed(layout, 2, bits(3, 17))), { kind: "pan", dir: "right" });
  assert.deepEqual(gestureToEvent(decodePressed(layout, 2, bits(3, 19))), { kind: "line", dir: "down" });
});

test("routing key over cell 7", () => {
  const layout = parseBrailleLayout(display20)!;
  assert.deepEqual(gestureToEvent(decodePressed(layout, 3, bits(3, 7))), { kind: "route", index: 7 });
});

test("array-style router field", () => {
  const layout = parseBrailleLayout({
    usagePage: 0x41,
    usage: 1,
    outputReports: [{ reportId: 1, items: [{ usages: [USAGE.CELL_8_DOT], reportSize: 8, reportCount: 40 }] }],
    inputReports: [{ reportId: 4, items: [{ isArray: true, usages: [USAGE.ROUTER_KEY], logicalMinimum: 1, reportSize: 8, reportCount: 2 }] }],
  })!;
  const data = new DataView(new Uint8Array([6, 0]).buffer); // slot value 6 -> router index 5
  assert.deepEqual(gestureToEvent(decodePressed(layout, 4, data)), { kind: "route", index: 5 });
});

test("a collection with no cells is rejected", () => {
  assert.equal(parseBrailleLayout({ usagePage: 0x41, usage: 1, outputReports: [] }), null);
});
