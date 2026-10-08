import { test } from "node:test";
import assert from "node:assert/strict";
import { COMMANDS, commandForChord, commandHelp } from "../lib/braille/commands";

test("Space + letter dots map to commands", () => {
  assert.equal(commandForChord(0b001110), "summarize"); // s = dots 2-3-4
  assert.equal(commandForChord(0b010101), "overview"); // o = dots 1-3-5
  assert.equal(commandForChord(0b011111), "question"); // q = dots 1-2-3-4-5
  assert.equal(commandForChord(0b010011), "home"); // h = dots 1-2-5
});

test("dots 7 and 8 are ignored; unknown chords give null", () => {
  assert.equal(commandForChord(0b001110 | 0xc0), "summarize");
  assert.equal(commandForChord(0b000001), null); // a = dot 1 is not a command
});

test("every command has a distinct chord and appears in the help", () => {
  assert.equal(new Set(COMMANDS.map((c) => c.dots)).size, COMMANDS.length);
  for (const c of COMMANDS) assert.match(commandHelp(), new RegExp(`Space ${c.letter.toUpperCase()}`));
});
