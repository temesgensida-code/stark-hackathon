// Shared state and events between the reader page, the Voxide voice actions and the Braille display.
// The reader publishes where the user is; voice and Braille send commands back as events.

export interface ReaderSnapshot {
  paperId: number | null;
  title: string;
  sections: { id: number; heading: string; text: string }[];
  index: number;
}

export const readerState: ReaderSnapshot = { paperId: null, title: "", sections: [], index: 0 };

export function setReaderState(next: Partial<ReaderSnapshot>) {
  Object.assign(readerState, next);
}

export type ReaderEvent =
  | { type: "goto"; index: number }
  | { type: "show-braille" }
  /** A routing key (or click) moved the caret to a text index in the current section. */
  | { type: "caret"; index: number }
  /** Text typed on a Braille keyboard with nothing editable focused; the reader appends it to its note box. */
  | { type: "typed"; text: string };

export function sendReaderEvent(e: ReaderEvent) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("bt:reader", { detail: e }));
}

export function onReaderEvent(fn: (e: ReaderEvent) => void): () => void {
  const h = (ev: Event) => fn((ev as CustomEvent<ReaderEvent>).detail);
  window.addEventListener("bt:reader", h);
  return () => window.removeEventListener("bt:reader", h);
}

/** Results of the last voice search, so "open the second one" can refer to them. */
export const lastSearch: { external_id: string; title: string }[] = [];

/**
 * The page that owns the Braille display right now. A page can take over the display's keys
 * (the home page uses them for search) and say what "show in Braille" means on it.
 * Pages that register nothing get the default: typing goes to the focused field, and
 * routing and panning go to the reader.
 */
export interface BraillePage {
  /** What "show in Braille" shows on this page, or null if there is nothing. */
  current?(): { text: string; label: string } | null;
  onRoute?(index: number): void;
  onNavigate?(dir: "previous" | "next"): void;
  /** Return true when the page used the typed text. */
  onTyped?(text: string): boolean;
  /** A Space + dots command chord. Return true when the page handled it. */
  onCommand?(dots: number): boolean;
}

let globalCommand: (dots: number) => void = () => undefined;

/** App-wide commands (home, help) that work on every page; set by the Braille provider. */
export function setGlobalBrailleCommand(fn: (dots: number) => void) {
  globalCommand = fn;
}

export function runGlobalBrailleCommand(dots: number) {
  globalCommand(dots);
}

let activePage: BraillePage | null = null;

export function setBraillePage(page: BraillePage): () => void {
  activePage = page;
  return () => {
    if (activePage === page) activePage = null;
  };
}

export function getBraillePage(): BraillePage | null {
  return activePage;
}

type Output = (text: string, label: string, caret?: number) => Promise<string>;
let output: Output = async () => "No Braille display is ready yet.";

/** Set by the Braille provider; shows text on the display and returns what was announced. */
export function setBrailleOutput(fn: Output) {
  output = fn;
}

export function showInBraille(text: string, label: string, caret?: number): Promise<string> {
  return output(text, label, caret);
}
