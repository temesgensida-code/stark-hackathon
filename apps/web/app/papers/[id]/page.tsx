"use client";

import React, { use, useCallback, useEffect, useMemo, useState } from "react";
import { useBraille } from "@/components/braille/BrailleDisplayConnect";
import { BrailleHardwareSimulator } from "@/components/braille/BrailleHardwareSimulator";

interface PaperSection {
  id: string;
  title: string;
  content: string;
  citations?: { key: string; text: string }[];
}

const SAMPLE_PAPER: {
  title: string;
  authors: string;
  venue: string;
  sections: PaperSection[];
} = {
  title: "Attention Is All You Need",
  authors: "Ashish Vaswani, Noam Shazeer, Niki Parmar, Jakob Uszkoreit, Llion Jones, Aidan N. Gomez, Łukasz Kaiser, Illia Polosukhin",
  venue: "NeurIPS 2017 • arXiv:1706.03762",
  sections: [
    {
      id: "abstract",
      title: "Abstract",
      content:
        "The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and a decoder. The best performing models also connect the encoder and decoder through an attention mechanism. We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely.",
    },
    {
      id: "intro",
      title: "1. Introduction",
      content:
        "Recurrent neural networks, particularly long short-term memory [Hochreiter & Schmidhuber, 1997] and gated recurrent [Cho et al., 2014] neural networks, have been firmly established as state of the art approaches in sequence modeling and transduction problems such as language modeling and machine translation.",
    },
    {
      id: "architecture",
      title: "2. Model Architecture",
      content:
        "Most competitive neural sequence transduction models have an encoder-decoder structure. Here, the encoder maps an input sequence of symbol representations to a sequence of continuous representations. Given z, the decoder then generates an output sequence of symbols one element at a time.",
    },
    {
      id: "attention",
      title: "3. Scaled Dot-Product Attention",
      content:
        "An attention function can be described as mapping a query and a set of key-value pairs to an output, where the query, keys, values, and output are all vectors. The output is computed as a weighted sum of the values, where the weight assigned to each value is computed by a compatibility function of the query with the corresponding key.",
    },
    {
      id: "conclusion",
      title: "4. Conclusion",
      content:
        "In this work, we presented the Transformer, the first sequence transduction model based entirely on attention, replacing the recurrent layers most commonly used in encoder-decoder architectures with multi-headed self-attention.",
    },
  ],
};

export default function ReaderPage({ params }: { params?: Promise<{ id: string }> }) {
  // Unwrapping params if present in Next.js 15+
  const resolvedParams = params ? use(params) : { id: "attention-is-all-you-need" };
  const b = useBraille();

  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
  const [caretIndex, setCaretIndex] = useState(0);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(true);
  const [lastEventMsg, setLastEventMsg] = useState("Ready");

  const activeSection = SAMPLE_PAPER.sections[activeSectionIndex] || SAMPLE_PAPER.sections[0];

  // Push section text and caret to BrailleManager whenever section or caret changes
  useEffect(() => {
    if (activeSection?.content) {
      void b.manager.show(activeSection.content, caretIndex);
    }
  }, [activeSection, caretIndex, b.manager]);

  // Handle routing button click: moves caret in visual text
  const handleSimulatorRoute = useCallback((routedTextIndex: number) => {
    setCaretIndex(routedTextIndex);
    setLastEventMsg(`Routed caret to text character #${routedTextIndex}`);
  }, []);

  // Jump to next or previous section
  const handlePrevSection = useCallback(() => {
    setActiveSectionIndex((idx) => Math.max(0, idx - 1));
    setCaretIndex(0);
  }, []);

  const handleNextSection = useCallback(() => {
    setActiveSectionIndex((idx) => Math.min(SAMPLE_PAPER.sections.length - 1, idx + 1));
    setCaretIndex(0);
  }, []);

  // Keyboard navigation shortcuts for the reader
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        handleNextSection();
      } else if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        handlePrevSection();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleNextSection, handlePrevSection]);

  // Render visually highlighted text showing current caret position
  const renderedContent = useMemo(() => {
    const text = activeSection.content;
    if (caretIndex < 0 || caretIndex >= text.length) {
      return text;
    }
    const before = text.slice(0, caretIndex);
    const char = text[caretIndex];
    const after = text.slice(caretIndex + 1);

    return (
      <>
        {before}
        <span
          style={{
            background: "#38bdf8",
            color: "#0a0c10",
            fontWeight: 700,
            padding: "0 2px",
            borderRadius: "3px",
            boxShadow: "0 0 8px rgba(56, 189, 248, 0.8)",
          }}
          title={`Active Caret (Index ${caretIndex}): '${char}'`}
        >
          {char}
        </span>
        {after}
      </>
    );
  }, [activeSection.content, caretIndex]);

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "24px 20px 180px 20px" }}>
      {/* Paper Header */}
      <div
        style={{
          borderBottom: "1px solid #232a38",
          paddingBottom: "20px",
          marginBottom: "24px",
        }}
      >
        <span
          style={{
            background: "#1e293b",
            color: "#38bdf8",
            fontSize: "0.75rem",
            fontWeight: 700,
            padding: "4px 8px",
            borderRadius: "4px",
            letterSpacing: "1px",
          }}
        >
          ACADEMIC PAPER READER
        </span>
        <h1 style={{ fontSize: "1.8rem", margin: "12px 0 6px 0", color: "#f8fafc" }}>{SAMPLE_PAPER.title}</h1>
        <p style={{ color: "#94a3b8", fontSize: "0.9rem", marginBottom: "6px" }}>{SAMPLE_PAPER.authors}</p>
        <p style={{ color: "#64748b", fontSize: "0.8rem" }}>{SAMPLE_PAPER.venue}</p>

        {/* Braille Display Status Pill */}
        <div style={{ display: "flex", gap: "10px", alignItems: "center", marginTop: "14px" }}>
          <span
            style={{
              fontSize: "0.8rem",
              background: b.info ? "#064e3b" : "#374151",
              color: b.info ? "#a7f3d0" : "#d1d5db",
              padding: "4px 10px",
              borderRadius: "20px",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: b.info ? "#10b981" : "#9ca3af",
              }}
            />
            {b.info ? `Connected: ${b.info.name}` : "No hardware connected (Auto Virtual)"}
          </span>
          <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
            Code: <strong>{b.manager.table}</strong> • Caret: <strong>Char #{caretIndex}</strong>
          </span>
        </div>
      </div>

      {/* Main Two-Column Layout: Section List + Active Text */}
      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: "24px", marginBottom: "32px" }}>
        {/* Sections Sidebar */}
        <aside
          style={{
            background: "#11141c",
            border: "1px solid #1f2533",
            borderRadius: "12px",
            padding: "16px",
            height: "fit-content",
          }}
        >
          <h2 style={{ fontSize: "0.85rem", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "12px" }}>
            Paper Sections
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {SAMPLE_PAPER.sections.map((sec, idx) => (
              <button
                key={sec.id}
                type="button"
                onClick={() => {
                  setActiveSectionIndex(idx);
                  setCaretIndex(0);
                }}
                style={{
                  textAlign: "left",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  background: idx === activeSectionIndex ? "#1e293b" : "transparent",
                  color: idx === activeSectionIndex ? "#38bdf8" : "#cbd5e1",
                  border: idx === activeSectionIndex ? "1px solid #38bdf8" : "1px solid transparent",
                  fontSize: "0.85rem",
                  cursor: "pointer",
                  fontWeight: idx === activeSectionIndex ? 700 : 400,
                  transition: "all 0.15s ease",
                }}
              >
                {sec.title}
              </button>
            ))}
          </div>
          <div style={{ marginTop: "20px", fontSize: "0.75rem", color: "#64748b", borderTop: "1px solid #1f2533", paddingTop: "12px" }}>
            Hotkeys: <kbd style={{ background: "#1f2937", padding: "2px 4px", borderRadius: "3px" }}>J</kbd> next section •{" "}
            <kbd style={{ background: "#1f2937", padding: "2px 4px", borderRadius: "3px" }}>K</kbd> prev
          </div>
        </aside>

        {/* Section Reading Area */}
        <article
          style={{
            background: "#11141c",
            border: "1px solid #1f2533",
            borderRadius: "12px",
            padding: "24px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h2 style={{ fontSize: "1.3rem", color: "#f8fafc" }}>{activeSection.title}</h2>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                onClick={handlePrevSection}
                disabled={activeSectionIndex === 0}
                style={{
                  background: "#1e293b",
                  color: "#cbd5e1",
                  border: "1px solid #334155",
                  borderRadius: "6px",
                  padding: "6px 12px",
                  fontSize: "0.8rem",
                  cursor: activeSectionIndex === 0 ? "not-allowed" : "pointer",
                }}
              >
                ◀ Previous Section
              </button>
              <button
                type="button"
                onClick={handleNextSection}
                disabled={activeSectionIndex === SAMPLE_PAPER.sections.length - 1}
                style={{
                  background: "#1e293b",
                  color: "#cbd5e1",
                  border: "1px solid #334155",
                  borderRadius: "6px",
                  padding: "6px 12px",
                  fontSize: "0.8rem",
                  cursor: activeSectionIndex === SAMPLE_PAPER.sections.length - 1 ? "not-allowed" : "pointer",
                }}
              >
                Next Section ▶
              </button>
            </div>
          </div>

          <p
            onClick={(e) => {
              // Click anywhere on text to move visual caret and Braille display
              const selection = window.getSelection();
              if (selection && selection.anchorOffset !== undefined) {
                setCaretIndex(selection.anchorOffset);
              }
            }}
            style={{
              fontSize: "1.1rem",
              lineHeight: 1.8,
              color: "#e2e8f0",
              cursor: "text",
            }}
          >
            {renderedContent}
          </p>

          <div
            style={{
              marginTop: "24px",
              padding: "12px 16px",
              background: "#151a24",
              border: "1px solid #232a38",
              borderRadius: "8px",
              fontSize: "0.8rem",
              color: "#94a3b8",
            }}
          >
            💡 <strong>Interactive Tactile Pairing:</strong> Click any word above to position the caret, or click any
            routing microswitch button (1–40) on the virtual Braille display below to jump the caret to that character!
          </div>
        </article>
      </div>

      {/* ==================== DOCKABLE SIMULATOR DRAWER ==================== */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 40,
          background: "#0c0e14",
          borderTop: "2px solid #283040",
          boxShadow: "0 -10px 30px rgba(0,0,0,0.8)",
          transition: "transform 0.25s ease",
          transform: isSimulatorOpen ? "translateY(0)" : "translateY(calc(100% - 46px))",
        }}
      >
        {/* Drawer Header & Toggle Button */}
        <div
          onClick={() => setIsSimulatorOpen((open) => !open)}
          style={{
            background: "#141822",
            padding: "8px 24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            cursor: "pointer",
            borderBottom: isSimulatorOpen ? "1px solid #262e3d" : "none",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "1.1rem" }}>{isSimulatorOpen ? "▼" : "▲"}</span>
            <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "#f8fafc", letterSpacing: "1px" }}>
              {isSimulatorOpen ? "DOCKABLE VIRTUAL BRAILLE HARDWARE DISPLAY" : "SHOW VIRTUAL BRAILLE DISPLAY (40 CELLS)"}
            </span>
            <span
              style={{
                fontSize: "0.75rem",
                background: "#0369a1",
                color: "#e0f2fe",
                padding: "2px 8px",
                borderRadius: "12px",
              }}
            >
              Interactive Hardware Simulator
            </span>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsSimulatorOpen((open) => !open);
            }}
            style={{
              background: "#1e293b",
              border: "1px solid #334155",
              color: "#cbd5e1",
              borderRadius: "6px",
              padding: "4px 12px",
              fontSize: "0.75rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {isSimulatorOpen ? "Minimize Tray" : "Expand Tray"}
          </button>
        </div>

        {/* Drawer Content: Full Interactive Hardware Component */}
        {isSimulatorOpen && (
          <div style={{ maxHeight: "65vh", overflowY: "auto", padding: "14px 20px" }}>
            <BrailleHardwareSimulator
              cellsCount={40}
              initiallyExpanded={true}
              onRoute={handleSimulatorRoute}
            />
          </div>
        )}
      </div>
    </div>
  );
}
