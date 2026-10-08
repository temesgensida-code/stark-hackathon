import { test } from "node:test";
import assert from "node:assert/strict";
import { applyTyped } from "../lib/braille/typing";

test("inserts a word at the caret", () => {
  assert.deepEqual(applyTyped("hello ", 6, 6, "world "), { value: "hello world ", caret: 12 });
  assert.deepEqual(applyTyped("ac", 1, 1, "b"), { value: "abc", caret: 2 });
});

test("replaces a selection", () => {
  assert.deepEqual(applyTyped("abcdef", 1, 4, "X"), { value: "aXef", caret: 2 });
});

test("backspace deletes one character or the selection", () => {
  assert.deepEqual(applyTyped("abc", 3, 3, "\b"), { value: "ab", caret: 2 });
  assert.deepEqual(applyTyped("abcdef", 1, 4, "\b"), { value: "aef", caret: 1 });
  assert.deepEqual(applyTyped("abc", 0, 0, "\b"), { value: "abc", caret: 0 });
});

test("out-of-range selections are clamped", () => {
  assert.deepEqual(applyTyped("ab", 9, 12, "c"), { value: "abc", caret: 3 });
});

test("newline and Ethiopic text pass through", () => {
  assert.deepEqual(applyTyped("", 0, 0, "ሰላም\n"), { value: "ሰላም\n", caret: 4 });
});
