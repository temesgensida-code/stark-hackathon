// Display commands: Space plus the dots of a letter, as on Braille notetakers.
// Letters use the standard six-dot alphabet (bit 0 = dot 1), so they mean the same in every Braille code.

export type BrailleCommand = "summarize" | "overview" | "question" | "note" | "read" | "home" | "help";

const dots = (...d: number[]) => d.reduce((m, x) => m | (1 << (x - 1)), 0);

export const COMMANDS: { command: BrailleCommand; letter: string; dots: number; does: string }[] = [
  { command: "summarize", letter: "s", dots: dots(2, 3, 4), does: "summarize this section" },
  { command: "overview", letter: "o", dots: dots(1, 3, 5), does: "overview of the paper" },
  { command: "question", letter: "q", dots: dots(1, 2, 3, 4, 5), does: "ask a question: type it, then Enter" },
  { command: "note", letter: "n", dots: dots(1, 3, 4, 5), does: "write a note: type it, then Enter" },
  { command: "read", letter: "r", dots: dots(1, 2, 3, 5), does: "back to the section text" },
  { command: "home", letter: "h", dots: dots(1, 2, 5), does: "home and search" },
  { command: "help", letter: "l", dots: dots(1, 2, 3), does: "list these commands" },
];

/** The command for a Space + dots chord, ignoring dots 7 and 8. */
export function commandForChord(mask: number): BrailleCommand | null {
  return COMMANDS.find((c) => c.dots === (mask & 0x3f))?.command ?? null;
}

/** One line per command, for the display and screen readers. */
export function commandHelp(): string {
  return "Commands: " + COMMANDS.map((c) => `Space ${c.letter.toUpperCase()}, ${c.does}`).join(". ") + ".";
}
