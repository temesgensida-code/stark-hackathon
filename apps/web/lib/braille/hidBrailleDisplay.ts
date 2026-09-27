/**
 * WebHID driver for Braille displays that follow the USB-IF HID Braille
 * standard (usage page 0x41). Works in Chrome and Edge 89+ on Windows, macOS,
 * Linux and ChromeOS, over USB or Bluetooth, with no install.
 *
 * The driver reads the device's own report descriptor (exposed by WebHID as
 * `collections`), so it adapts to any cell count and key layout instead of
 * hard-coding one model.
 */

import { BrailleDisplay, BrailleDisplayInfo, BrailleKeyEvent, Emitter } from "./types";

// ---- HID Braille usage page (0x41), from the HID Usage Tables ------------
export const BRAILLE_PAGE = 0x41;
const U = (id: number) => (BRAILLE_PAGE << 16) | id;
export const USAGE = {
  BRAILLE_DISPLAY: U(0x01),
  BRAILLE_ROW: U(0x02),
  CELL_8_DOT: U(0x03),
  CELL_6_DOT: U(0x04),
  NUMBER_OF_CELLS: U(0x05),
  ROUTER_SET_1: U(0xfa),
  ROUTER_KEY: U(0x100),
  ROW_ROUTER_KEY: U(0x101),
  DOT_1: U(0x201), // ... DOT_8 = U(0x208)
  SPACE: U(0x209),
  LEFT_SPACE: U(0x20a),
  RIGHT_SPACE: U(0x20b),
  JOYSTICK_CENTER: U(0x210),
  JOYSTICK_UP: U(0x211),
  JOYSTICK_DOWN: U(0x212),
  JOYSTICK_LEFT: U(0x213),
  JOYSTICK_RIGHT: U(0x214),
  DPAD_CENTER: U(0x215),
  DPAD_UP: U(0x216),
  DPAD_DOWN: U(0x217),
  DPAD_LEFT: U(0x218),
  DPAD_RIGHT: U(0x219),
  PAN_LEFT: U(0x21a),
  PAN_RIGHT: U(0x21b),
  ROCKER_UP: U(0x21c),
  ROCKER_DOWN: U(0x21d),
  ROCKER_PRESS: U(0x21e),
} as const;

// ---- Minimal structural types so the parser is testable without a browser -
export interface HidItemLike {
  usages?: number[];
  usageMinimum?: number;
  usageMaximum?: number;
  isRange?: boolean;
  isArray?: boolean;
  isConstant?: boolean;
  reportSize?: number;
  reportCount?: number;
  logicalMinimum?: number;
}
export interface HidReportLike {
  reportId?: number;
  items?: HidItemLike[];
}
export interface HidCollectionLike {
  usagePage?: number;
  usage?: number;
  children?: HidCollectionLike[];
  inputReports?: HidReportLike[];
  outputReports?: HidReportLike[];
}

interface Field {
  bitOffset: number;
  size: number;
  count: number;
  isArray: boolean;
  logicalMin: number;
  usageAt: (index: number) => number | undefined;
}
interface ReportLayout {
  reportId: number;
  bytes: number;
  fields: Field[];
}
export interface BrailleLayout {
  cells: number;
  cellBits: 6 | 8;
  output: { reportId: number; bytes: number; cellBitOffset: number; cellSize: number };
  inputs: Map<number, ReportLayout>;
}

function fieldFor(item: HidItemLike, bitOffset: number): Field {
  const usages = item.usages ?? [];
  const min = item.usageMinimum ?? 0;
  return {
    bitOffset,
    size: item.reportSize ?? 0,
    count: item.reportCount ?? 0,
    isArray: !!item.isArray,
    logicalMin: item.logicalMinimum ?? 0,
    usageAt: (i) =>
      item.isRange ? (min + i <= (item.usageMaximum ?? min) ? min + i : undefined) : usages[Math.min(i, usages.length - 1)],
  };
}

function reportsOf(c: HidCollectionLike, kind: "inputReports" | "outputReports"): HidReportLike[] {
  // Chromium lists items on the top-level collection; recurse anyway for safety
  // and keep the most complete copy of each report id.
  const byId = new Map<number, HidReportLike>();
  const walk = (col: HidCollectionLike) => {
    for (const r of col[kind] ?? []) {
      const id = r.reportId ?? 0;
      if ((r.items?.length ?? 0) > (byId.get(id)?.items?.length ?? -1)) byId.set(id, r);
    }
    (col.children ?? []).forEach(walk);
  };
  walk(c);
  return [...byId.values()];
}

/** Parse a HID Braille top-level collection. Returns null if it has no cell output. */
export function parseBrailleLayout(collection: HidCollectionLike): BrailleLayout | null {
  let output: BrailleLayout["output"] | null = null;
  let cells = 0;
  let cellBits: 6 | 8 = 8;

  for (const report of reportsOf(collection, "outputReports")) {
    let bit = 0;
    for (const item of report.items ?? []) {
      const size = (item.reportSize ?? 0) * (item.reportCount ?? 0);
      const usages = item.usages ?? [];
      const is8 = usages.includes(USAGE.CELL_8_DOT);
      const is6 = usages.includes(USAGE.CELL_6_DOT);
      if (!output && (is8 || is6)) {
        cells = item.reportCount ?? 0;
        cellBits = is6 && !is8 ? 6 : 8;
        output = { reportId: report.reportId ?? 0, bytes: 0, cellBitOffset: bit, cellSize: item.reportSize ?? 8 };
      }
      bit += size;
    }
    if (output && output.reportId === (report.reportId ?? 0)) output.bytes = Math.ceil(bit / 8);
  }
  if (!output || cells === 0) return null;

  const inputs = new Map<number, ReportLayout>();
  for (const report of reportsOf(collection, "inputReports")) {
    let bit = 0;
    const fields: Field[] = [];
    for (const item of report.items ?? []) {
      if (!item.isConstant) fields.push(fieldFor(item, bit));
      bit += (item.reportSize ?? 0) * (item.reportCount ?? 0);
    }
    inputs.set(report.reportId ?? 0, { reportId: report.reportId ?? 0, bytes: Math.ceil(bit / 8), fields });
  }
  return { cells, cellBits, output, inputs };
}

// ---- bit helpers (HID reports are little-endian, LSB first) --------------
function readBits(view: DataView, bitOffset: number, size: number): number {
  let value = 0;
  for (let i = 0; i < size; i++) {
    const b = bitOffset + i;
    const byte = b >> 3;
    if (byte >= view.byteLength) break;
    if ((view.getUint8(byte) >> (b & 7)) & 1) value |= 1 << i;
  }
  return value >>> 0;
}
function writeBits(buf: Uint8Array, bitOffset: number, size: number, value: number): void {
  for (let i = 0; i < size; i++) {
    const b = bitOffset + i;
    if ((value >> i) & 1) buf[b >> 3] |= 1 << (b & 7);
    else buf[b >> 3] &= ~(1 << (b & 7));
  }
}

/** Build the output report body (without report id) that shows `cells`. */
export function buildCellReport(layout: BrailleLayout, cells: ArrayLike<number>): Uint8Array<ArrayBuffer> {
  const buf = new Uint8Array(layout.output.bytes);
  const mask = layout.cellBits === 6 ? 0x3f : 0xff;
  for (let i = 0; i < layout.cells; i++) {
    writeBits(buf, layout.output.cellBitOffset + i * layout.output.cellSize, layout.output.cellSize, (cells[i] ?? 0) & mask);
  }
  return buf;
}

/** Decode which keys are held in one input report. Router keys become "router:<n>". */
export function decodePressed(layout: BrailleLayout, reportId: number, data: DataView): Set<string> {
  const pressed = new Set<string>();
  const report = layout.inputs.get(reportId);
  if (!report) return pressed;
  let router = 0;
  for (const f of report.fields) {
    for (let i = 0; i < f.count; i++) {
      const raw = readBits(data, f.bitOffset + i * f.size, f.size);
      if (f.isArray) {
        // Array field: each slot holds the index of a pressed usage, or 0/out of range.
        const idx = raw - f.logicalMin;
        const usage = raw === 0 ? undefined : f.usageAt(idx);
        if (usage === USAGE.ROUTER_KEY) pressed.add(`router:${idx}`);
        else if (usage !== undefined) pressed.add(`u:${usage}`);
      } else if (f.size === 1) {
        const usage = f.usageAt(i);
        if (usage === USAGE.ROUTER_KEY) {
          if (raw) pressed.add(`router:${router}`);
          router++;
        } else if (raw && usage !== undefined) pressed.add(`u:${usage}`);
      }
      // multi-bit variable fields (e.g. number of cells) are not keys
    }
  }
  return pressed;
}

const NAV: Record<number, BrailleKeyEvent> = {
  [USAGE.PAN_LEFT]: { kind: "pan", dir: "left" },
  [USAGE.PAN_RIGHT]: { kind: "pan", dir: "right" },
  [USAGE.JOYSTICK_LEFT]: { kind: "pan", dir: "left" },
  [USAGE.JOYSTICK_RIGHT]: { kind: "pan", dir: "right" },
  [USAGE.DPAD_LEFT]: { kind: "pan", dir: "left" },
  [USAGE.DPAD_RIGHT]: { kind: "pan", dir: "right" },
  [USAGE.ROCKER_UP]: { kind: "line", dir: "up" },
  [USAGE.ROCKER_DOWN]: { kind: "line", dir: "down" },
  [USAGE.JOYSTICK_UP]: { kind: "line", dir: "up" },
  [USAGE.JOYSTICK_DOWN]: { kind: "line", dir: "down" },
  [USAGE.DPAD_UP]: { kind: "line", dir: "up" },
  [USAGE.DPAD_DOWN]: { kind: "line", dir: "down" },
  [USAGE.JOYSTICK_CENTER]: { kind: "enter" },
  [USAGE.DPAD_CENTER]: { kind: "enter" },
  [USAGE.ROCKER_PRESS]: { kind: "enter" },
};

/** Turn one completed gesture (all keys pressed before full release) into an event. */
export function gestureToEvent(keys: Set<string>): BrailleKeyEvent | null {
  const routers = [...keys].filter((k) => k.startsWith("router:")).map((k) => Number(k.slice(7)));
  if (routers.length) return { kind: "route", index: Math.min(...routers) };
  const usages = [...keys].filter((k) => k.startsWith("u:")).map((k) => Number(k.slice(2)));
  for (const u of usages) if (NAV[u]) return NAV[u];
  let dots = 0;
  let space = false;
  for (const u of usages) {
    if (u >= USAGE.DOT_1 && u <= USAGE.DOT_1 + 7) dots |= 1 << (u - USAGE.DOT_1);
    if (u === USAGE.SPACE || u === USAGE.LEFT_SPACE || u === USAGE.RIGHT_SPACE) space = true;
  }
  if (space && dots) return { kind: "chord", dots };
  if (space) return { kind: "space" };
  if (dots === 0x40) return { kind: "backspace" }; // dot 7 alone
  if (dots === 0x80) return { kind: "enter" }; // dot 8 alone
  if (dots) return { kind: "dots", dots };
  return null;
}

// ---- The display ----------------------------------------------------------

export class HidBrailleDisplay implements BrailleDisplay {
  readonly info: BrailleDisplayInfo;
  private keys = new Emitter<BrailleKeyEvent>();
  private gone = new Emitter<void>();
  private held = new Map<number, Set<string>>(); // per report id
  private gesture = new Set<string>();

  private constructor(private device: HIDDevice, private layout: BrailleLayout) {
    this.info = {
      transport: "webhid",
      name: `${device.productName || "Braille display"}, ${layout.cells} cells`,
      cells: layout.cells,
      rows: 1,
    };
    device.addEventListener("inputreport", this.onInput);
    navigator.hid.addEventListener("disconnect", this.onHidDisconnect);
  }

  static async open(device: HIDDevice): Promise<HidBrailleDisplay> {
    const top = device.collections.find((c) => c.usagePage === BRAILLE_PAGE && (c.usage ?? 0) === 0x01);
    const layout = top && parseBrailleLayout(top as HidCollectionLike);
    if (!layout) throw new Error(`${device.productName} does not expose a HID Braille cell array.`);
    if (!device.opened) await device.open();
    return new HidBrailleDisplay(device, layout);
  }

  private onInput = (e: HIDInputReportEvent) => {
    this.held.set(e.reportId, decodePressed(this.layout, e.reportId, e.data));
    const down = new Set<string>();
    this.held.forEach((s) => s.forEach((k) => down.add(k)));
    down.forEach((k) => this.gesture.add(k));
    if (down.size === 0 && this.gesture.size) {
      const event = gestureToEvent(this.gesture);
      this.gesture.clear();
      if (event) this.keys.emit(event);
    }
  };

  private onHidDisconnect = (e: HIDConnectionEvent) => {
    if (e.device === this.device) this.gone.emit();
  };

  async write(cells: Uint8Array): Promise<void> {
    await this.device.sendReport(this.layout.output.reportId, buildCellReport(this.layout, cells));
  }
  onKey(l: (e: BrailleKeyEvent) => void) {
    return this.keys.on(l);
  }
  onDisconnect(l: () => void) {
    return this.gone.on(l);
  }
  async close(): Promise<void> {
    this.device.removeEventListener("inputreport", this.onInput);
    navigator.hid.removeEventListener("disconnect", this.onHidDisconnect);
    if (this.device.opened) await this.device.close();
  }
}

export const isWebHidSupported = (): boolean => typeof navigator !== "undefined" && "hid" in navigator;

/** Shows the browser's device chooser, filtered to HID Braille displays. Must run from a click or key press. */
export async function requestHidBrailleDisplay(): Promise<HidBrailleDisplay | null> {
  const [device] = await navigator.hid.requestDevice({ filters: [{ usagePage: BRAILLE_PAGE, usage: 0x01 }] });
  return device ? HidBrailleDisplay.open(device) : null;
}

/** Reopens a display the user already approved, with no chooser. Safe to call on page load. */
export async function reconnectHidBrailleDisplay(): Promise<HidBrailleDisplay | null> {
  if (!isWebHidSupported()) return null;
  const devices = await navigator.hid.getDevices();
  const device = devices.find((d) => d.collections.some((c) => c.usagePage === BRAILLE_PAGE));
  return device ? HidBrailleDisplay.open(device) : null;
}
