/**
 * Shared types for every Braille display transport.
 *
 * Cells are bytes where bit 0 = dot 1 ... bit 7 = dot 8, the same layout as
 * Unicode braille (U+2800 + byte), HID Braille cells and BrlAPI writeDots().
 */

export type BrailleKeyEvent =
  | { kind: "route"; index: number } // routing key above cell `index` (0-based, within the visible window)
  | { kind: "pan"; dir: "left" | "right" } // thumb/panning keys: move the window
  | { kind: "line"; dir: "up" | "down" } // rocker / joystick: previous or next line (section, paragraph)
  | { kind: "dots"; dots: number } // a braille chord typed on the Perkins keys
  | { kind: "chord"; dots: number } // space + dots, used for commands
  | { kind: "space" }
  | { kind: "enter" }
  | { kind: "backspace" }
  | { kind: "escape" }
  | { kind: "char"; char: string } // display already translated the input to a character
  | { kind: "command"; code: number }; // anything unmapped, passed through for debugging

export type BrailleTransport = "webhid" | "bridge" | "screen-reader" | "virtual";

export interface BrailleDisplayInfo {
  transport: BrailleTransport;
  /** Human-readable name announced to the user, e.g. "Orbit Reader 20, 20 cells". */
  name: string;
  cells: number;
  rows: number;
}

export interface BrailleDisplay {
  readonly info: BrailleDisplayInfo;
  /** Hardware transports: raw cells. Length is padded or truncated to info.cells * info.rows. */
  write(cells: Uint8Array): Promise<void>;
  /** Screen-reader transport: print text that the screen reader brailles itself. */
  writeText?(text: string): Promise<void>;
  onKey(listener: (event: BrailleKeyEvent) => void): () => void;
  onDisconnect(listener: () => void): () => void;
  close(): Promise<void>;
}

/** Tiny typed event helper shared by the transports. */
export class Emitter<T> {
  private listeners = new Set<(value: T) => void>();
  on(listener: (value: T) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  emit(value: T): void {
    for (const l of [...this.listeners]) l(value);
  }
}

export const dotsToMask = (dots: number[]): number => dots.reduce((m, d) => m | (1 << (d - 1)), 0);
export const maskToUnicode = (mask: number): string => String.fromCodePoint(0x2800 + (mask & 0xff));
export const cellsToUnicode = (cells: ArrayLike<number>): string => Array.from(cells, maskToUnicode).join("");
