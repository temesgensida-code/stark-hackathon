// Applies text typed on a Braille keyboard to an editable field. Pure, so it is easy to test.
// `typed` is a word plus its trailing space or newline, a single character, or "\b" for Backspace.

export interface EditResult {
  value: string;
  caret: number;
}

export function applyTyped(value: string, selStart: number, selEnd: number, typed: string): EditResult {
  const start = Math.max(0, Math.min(selStart, value.length));
  const end = Math.max(start, Math.min(selEnd, value.length));
  if (typed === "\b") {
    if (end > start) return { value: value.slice(0, start) + value.slice(end), caret: start };
    if (start === 0) return { value, caret: 0 };
    return { value: value.slice(0, start - 1) + value.slice(end), caret: start - 1 };
  }
  return { value: value.slice(0, start) + typed + value.slice(end), caret: start + typed.length };
}

/** Types into the focused input or textarea so React sees a normal change. Returns false if nothing editable is focused. */
export function typeIntoFocused(typed: string): boolean {
  const el = document.activeElement;
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false;
  const { value, caret } = applyTyped(el.value, el.selectionStart ?? el.value.length, el.selectionEnd ?? el.value.length, typed);
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value); // bypasses React's value tracker
  el.setSelectionRange(caret, caret);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}
