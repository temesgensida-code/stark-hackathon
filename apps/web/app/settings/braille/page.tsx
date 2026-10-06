"use client";

import React from "react";
import { BrailleDisplayConnect } from "@/components/braille/BrailleDisplayConnect";
import { BrailleHardwareSimulator } from "@/components/braille/BrailleHardwareSimulator";

const BRAILLE_TABLES = [
  { id: "en-ueb-g2", label: "English Unified English Braille (Grade 2 Contracted)" },
  { id: "en-ueb-g1", label: "English Unified English Braille (Grade 1 Uncontracted)" },
  { id: "am-g1", label: "Amharic Braille (Grade 1)" },
  { id: "om-g1", label: "Afaan Oromoo Braille" },
];

export default function BrailleSettingsPage() {
  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "28px 20px" }}>
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "1.8rem", color: "#f8fafc", marginBottom: "8px" }}>Braille Display Configuration</h1>
        <p style={{ color: "#94a3b8", fontSize: "0.95rem" }}>
          Connect physical displays over WebHID USB/Bluetooth, BRLTTY local bridge, screen reader, or launch the Virtual
          Hardware Simulator.
        </p>
      </div>

      <div
        style={{
          background: "#11141c",
          border: "1px solid #283042",
          borderRadius: "12px",
          padding: "20px",
          marginBottom: "32px",
        }}
      >
        <BrailleDisplayConnect tables={BRAILLE_TABLES} />
      </div>

      <div>
        <h2 style={{ fontSize: "1.2rem", color: "#f8fafc", marginBottom: "16px" }}>Virtual Hardware Simulator Window</h2>
        <BrailleHardwareSimulator cellsCount={40} />
      </div>
    </div>
  );
}
