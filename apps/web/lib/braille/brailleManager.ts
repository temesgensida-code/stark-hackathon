/**
 * BrailleManager: one object the reader page talks to, whatever display is
 * connected.
 *
 *   show(text)      put a text segment (sentence, paragraph, summary) on the display
 *   pan / route     handled from the display's own keys
 *   typing          Perkins chords are buffered per word, back-translated by
 *                   Liblouis on the API, and delivered to onTyped()
 */

import { BrailleDisplay, BrailleKeyEvent } from "./types";

export interface Translation {
  cells: number[];
  input_pos: number[]; // braille cell -> text index
  output_pos: number[]; // text index -> braille cell
}

export interface Translator {
  translate(text: string, table: string): Promise<Translation>;
  backTranslate(cells: number[], table: string): Promise<string>;
}

/** Talks to the FastAPI /braille routes. */
export class ApiTranslator implements Translator {
  constructor(private baseUrl = "/api") {}
  async translate(text: string, table: string): Promise<Translation> {
    const r = await fetch(`${this.baseUrl}/braille/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, table }),
    });
    if (!r.ok) throw new Error(`Braille translation failed (${r.status})`);
    return r.json();
  }
  async backTranslate(cells: number[], table: string): Promise<string> {
    const r = await fetch(`${this.baseUrl}/braille/back-translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cells, table }),
    });
    if (!r.ok) throw new Error(`Braille back-translation failed (${r.status})`);
    return (await r.json()).text;
  }
}

export interface ManagerCallbacks {
  /** Routing key pressed: text index inside the current segment (move caret, open citation, etc.). */
  onRoute?(textIndex: number): void;
  /** Panned past either end, or rocker/joystick up/down: go to previous/next segment. */
  onNavigate?(dir: "previous" | "next"): void;
  /** Text typed on the braille keyboard (a word plus its trailing space, "\n", or a character). */
  onTyped?(text: string): void;
  /** Space + dots chords and unmapped keys, for app commands (e.g. space+dots 1-3-4 = menu). */
  onCommand?(event: BrailleKeyEvent): void;
  /** Short status to announce (e.g. "Start of section"). */
  onAnnounce?(message: string): void;
}

const CURSOR = 0xc0; // dots 7-8 underline

export class BrailleManager {
  private display: BrailleDisplay | null = null;
  private unsub: (() => void)[] = [];
  private text = "";
  private tr: Translation = { cells: [], input_pos: [], output_pos: [] };
  private start = 0; // first cell of the visible window
  private caret = -1; // text index to underline, -1 = none
  private typing: number[] = [];

  constructor(
    private translator: Translator,
    public table = "en-ueb-g2",
    private cb: ManagerCallbacks = {},
  ) {}

  /** Switch the Braille code and redraw the current text with it. */
  async setTable(table: string): Promise<void> {
    this.table = table;
    if (this.text) await this.show(this.text, this.caret);
  }

  get connected() {
    return this.display?.info ?? null;
  }

  async attach(display: BrailleDisplay): Promise<void> {
    await this.detach();
    this.display = display;
    this.unsub = [display.onKey((e) => void this.handleKey(e)), display.onDisconnect(() => void this.detach())];
    if (this.text) await this.show(this.text, this.caret);
  }

  async detach(): Promise<void> {
    this.unsub.forEach((u) => u());
    this.unsub = [];
    const d = this.display;
    this.display = null;
    if (d) await d.close().catch(() => undefined);
  }

  /** Show a segment of text, scrolled so `caret` (text index) is visible. */
  async show(text: string, caret = -1): Promise<void> {
    this.text = text;
    this.caret = caret;
    const d = this.display;
    if (!d) return;
    if (d.writeText) {
      await d.writeText(text);
      return;
    }
    this.tr = await this.translator.translate(text, this.table);
    const width = this.width();
    const caretCell = caret >= 0 ? this.tr.output_pos[caret] ?? 0 : 0;
    this.start = Math.floor(caretCell / width) * width;
    await this.render();
  }

  private width() {
    const d = this.display!;
    return d.info.cells * d.info.rows;
  }

  /** The cells currently on the display (exposed for tests and on-screen mirrors). */
  visibleCells(): Uint8Array {
    const width = this.display ? this.width() : 0;
    const out = new Uint8Array(width);
    const src = this.typing.length ? this.typingView(width) : this.tr.cells.slice(this.start, this.start + width);
    out.set(src.slice(0, width));
    if (!this.typing.length && this.caret >= 0) {
      const c = (this.tr.output_pos[this.caret] ?? -1) - this.start;
      if (c >= 0 && c < width) out[c] |= CURSOR;
    }
    return out;
  }

  private typingView(width: number): number[] {
    // While typing, show the word being typed, right-aligned if it overflows.
    return this.typing.slice(Math.max(0, this.typing.length - width));
  }

  private async render() {
    if (this.display && !this.display.writeText) await this.display.write(this.visibleCells());
  }

  async pan(dir: "left" | "right"): Promise<void> {
    const width = this.width();
    if (dir === "right") {
      if (this.start + width >= this.tr.cells.length) return this.cb.onNavigate?.("next");
      this.start += width;
    } else {
      if (this.start === 0) return this.cb.onNavigate?.("previous");
      this.start = Math.max(0, this.start - width);
    }
    await this.render();
  }

  private async flushWord(suffix: string) {
    const cells = this.typing;
    this.typing = [];
    const word = cells.length ? await this.translator.backTranslate(cells, this.table) : "";
    this.cb.onTyped?.(word + suffix);
    await this.render();
  }

  async handleKey(e: BrailleKeyEvent): Promise<void> {
    switch (e.kind) {
      case "route": {
        const cell = this.start + e.index;
        const idx = this.tr.input_pos[cell];
        if (idx !== undefined) this.cb.onRoute?.(idx);
        return;
      }
      case "pan":
        return this.pan(e.dir);
      case "line":
        return this.cb.onNavigate?.(e.dir === "up" ? "previous" : "next");
      case "dots":
        this.typing.push(e.dots);
        return this.render();
      case "space":
        return this.flushWord(" ");
      case "enter":
        return this.flushWord("\n");
      case "backspace":
        if (this.typing.length) {
          this.typing.pop();
          return this.render();
        }
        return this.cb.onTyped?.("\b");
      case "char":
        return this.cb.onTyped?.(e.char);
      default:
        return this.cb.onCommand?.(e);
    }
  }
}
