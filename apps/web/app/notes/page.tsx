"use client";

import React, { useState } from "react";
import { useBraille } from "@/components/braille/BrailleDisplayConnect";
import { BrailleHardwareSimulator } from "@/components/braille/BrailleHardwareSimulator";

export default function NotesPage() {
  const b = useBraille();
  const [notes, setNotes] = useState<string>(
    "Welcome to the Braille Talks Notes Hub.\n\nYou can compose notes with your physical keyboard, voice, or the 8-dot Perkins chorder below!\n\nTry composing chords (e.g. dots 1-2-5 + Space for 'h') using the simulator below.",
  );

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "28px 20px" }}>
      <div style={{ marginBottom: "20px" }}>
        <h1 style={{ fontSize: "1.8rem", color: "#f8fafc", marginBottom: "8px" }}>Braille Notetaker & Editor</h1>
        <p style={{ color: "#94a3b8", fontSize: "0.95rem" }}>
          Notes typed by keyboard, voice, or Braille Perkins keys (six-key or eight-key chording).
        </p>
      </div>

      {/* Note Area */}
      <div style={{ marginBottom: "28px" }}>
        <textarea
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            void b.manager.show(e.target.value);
          }}
          rows={7}
          style={{
            width: "100%",
            background: "#11141c",
            border: "1px solid #283042",
            borderRadius: "10px",
            color: "#f1f5f9",
            fontSize: "1rem",
            lineHeight: 1.6,
            padding: "16px",
            fontFamily: "inherit",
            resize: "vertical",
          }}
          placeholder="Start typing your research notes..."
        />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px", fontSize: "0.8rem", color: "#64748b" }}>
          <span>Characters: {notes.length}</span>
          <button
            type="button"
            onClick={() => void b.manager.show(notes)}
            style={{
              background: "#1e293b",
              color: "#38bdf8",
              border: "1px solid #334155",
              borderRadius: "6px",
              padding: "4px 10px",
              cursor: "pointer",
            }}
          >
            Send Notes to Braille Display
          </button>
        </div>
      </div>

      {/* Embedded Hardware Simulator */}
      <div>
        <h2 style={{ fontSize: "1.1rem", color: "#e2e8f0", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
          <span>Interactive Braille Hardware Simulator</span>
          <span style={{ fontSize: "0.75rem", background: "#0284c7", color: "#fff", padding: "2px 8px", borderRadius: "10px" }}>
            40-Cell Refreshable Notetaker
          </span>
        </h2>
        <BrailleHardwareSimulator cellsCount={40} />
      </div>
    </div>
  );
}
