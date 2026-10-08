"use client";
// Six-key Braille typing on a normal keyboard: F D S = dots 1 2 3, J K L = dots 4 5 6.
// Press the keys of one cell together, release to enter it. Space ends a word and sends it to the API for
// back-translation; Backspace removes the last cell. Works as a stand-in when no Perkins display is attached.
import React, { useRef, useState } from "react";
import { api } from "@/lib/api/client";

const DOT_FOR_KEY: Record<string, number> = { f: 1, d: 2, s: 3, j: 4, k: 5, l: 6 };

interface Props {
  table: string;
  onText: (text: string) => void;
}

export function SixKeyInput({ table, onText }: Props) {
  const [cells, setCells] = useState<number[]>([]);
  const [status, setStatus] = useState("");
  const down = useRef(new Set<string>());
  const chord = useRef(0);

  const flushWord = async () => {
    if (!cells.length) return onText(" ");
    try {
      const { text } = await api.backTranslate(cells, table);
      onText(text + " ");
      setStatus(`Typed: ${text}`);
    } catch (e) {
      setStatus(`Could not translate: ${(e as Error).message}`);
    }
    setCells([]);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (key in DOT_FOR_KEY) {
      e.preventDefault();
      if (!down.current.has(key)) {
        down.current.add(key);
        chord.current |= 1 << (DOT_FOR_KEY[key] - 1);
      }
    } else if (e.key === " ") {
      e.preventDefault();
      void flushWord();
    } else if (e.key === "Backspace") {
      e.preventDefault();
      setCells((c) => c.slice(0, -1));
    }
  };

  const onKeyUp = (e: React.KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (!(key in DOT_FOR_KEY)) return;
    down.current.delete(key);
    if (down.current.size === 0 && chord.current) {
      const cell = chord.current;
      chord.current = 0;
      setCells((c) => [...c, cell]);
      setStatus(`Cell ${cells.length + 1} entered`);
    }
  };

  const preview = cells.map((c) => String.fromCharCode(0x2800 + c)).join("");

  return (
    <div className="sixkey">
      <label htmlFor="sixkey-field">Six-key Braille input</label>
      <div
        id="sixkey-field"
        role="textbox"
        aria-multiline="false"
        aria-describedby="sixkey-help"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        className="sixkey-field"
      >
        {preview || <span className="muted">Focus here, then type with F D S and J K L</span>}
      </div>
      <p id="sixkey-help" className="muted">
        F D S are dots 1 2 3, J K L are dots 4 5 6. Press a cell's keys together, release, then Space to add the word.
        Backspace deletes a cell.
      </p>
      <p role="status" aria-live="polite" className="muted">
        {status}
      </p>
    </div>
  );
}
