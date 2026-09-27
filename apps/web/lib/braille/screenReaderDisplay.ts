/**
 * Zero-install fallback: the user's own screen reader drives the display.
 *
 * NVDA, JAWS, VoiceOver (macOS/iOS), TalkBack (Android) and Orca already
 * support most refreshable displays over USB and Bluetooth. We give them one
 * focusable "braille line" element holding the current text segment; the
 * screen reader translates it with its own Liblouis tables and handles
 * panning and routing keys itself.
 */

import { BrailleDisplay, BrailleDisplayInfo, BrailleKeyEvent, Emitter } from "./types";

export class ScreenReaderDisplay implements BrailleDisplay {
  readonly info: BrailleDisplayInfo = {
    transport: "screen-reader",
    name: "Your screen reader's Braille display",
    cells: 40, // notional; the screen reader pans on its own
    rows: 1,
  };
  private keys = new Emitter<BrailleKeyEvent>();
  private gone = new Emitter<void>();

  /** `target` should be a focusable element, e.g. <div tabIndex={0} role="document" aria-label="Braille line">. */
  constructor(private target: HTMLElement) {}

  async write(): Promise<void> {
    // Cells are not used on this path; see writeText.
  }
  async writeText(text: string): Promise<void> {
    this.target.textContent = text;
  }
  onKey(l: (e: BrailleKeyEvent) => void) {
    return this.keys.on(l);
  }
  onDisconnect(l: () => void) {
    return this.gone.on(l);
  }
  async close(): Promise<void> {
    this.gone.emit();
  }
}
