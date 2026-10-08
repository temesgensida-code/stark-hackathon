"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBraille } from "./BrailleDisplayConnect";
import { virtualSimulatorBus, VirtualBrailleDisplay } from "@/lib/braille/virtualDisplay";
import { BrailleKeyEvent, maskToUnicode, dotsToMask } from "@/lib/braille/types";

/**
 * Standard 8-dot Braille layout:
 * Left column: dots 1, 2, 3, 7
 * Right column: dots 4, 5, 6, 8
 *
 * Bitmasks:
 * Dot 1 = 1 << 0 (1)
 * Dot 2 = 1 << 1 (2)
 * Dot 3 = 1 << 2 (4)
 * Dot 4 = 1 << 3 (8)
 * Dot 5 = 1 << 4 (16)
 * Dot 6 = 1 << 5 (32)
 * Dot 7 = 1 << 6 (64)
 * Dot 8 = 1 << 7 (128)
 */
const DOT_MASKS: Record<number, number> = {
  1: 1 << 0,
  2: 1 << 1,
  3: 1 << 2,
  4: 1 << 3,
  5: 1 << 4,
  6: 1 << 5,
  7: 1 << 6,
  8: 1 << 7,
};

const LEFT_PINS = [1, 2, 3, 7];
const RIGHT_PINS = [4, 5, 6, 8];

export interface BrailleHardwareSimulatorProps {
  /** Optional custom cell count, default 40 */
  cellsCount?: number;
  /** Whether the simulator begins expanded */
  initiallyExpanded?: boolean;
  /** Custom class name */
  className?: string;
  /** On route key callback override */
  onRoute?: (index: number) => void;
}

export function BrailleHardwareSimulator({
  cellsCount = 40,
  initiallyExpanded = true,
  className = "",
  onRoute,
}: BrailleHardwareSimulatorProps) {
  let brailleCtx: ReturnType<typeof useBraille> | null = null;
  try {
    brailleCtx = useBraille();
  } catch {
    brailleCtx = null;
  }

  const [cells, setCells] = useState<Uint8Array>(() => {
    const init = new Uint8Array(cellsCount);
    const busCells = virtualSimulatorBus.cells;
    if (busCells) {
      init.set(busCells.slice(0, cellsCount));
    }
    return init;
  });

  const [sightedMode, setSightedMode] = useState(true);
  const [selectedCellIndex, setSelectedCellIndex] = useState<number | null>(null);
  const [hoveredCellIndex, setHoveredCellIndex] = useState<number | null>(null);
  const [pendingDots, setPendingDots] = useState<number[]>([]);
  const [keyboardCapture, setKeyboardCapture] = useState(false);
  const [connectionMode, setConnectionMode] = useState<"local" | "ws">("local");
  const [wsStatus, setWsStatus] = useState<string>("In-Memory Ready");
  const [lastAction, setLastAction] = useState<string>("Ready");
  const [isExpanded, setIsExpanded] = useState(initiallyExpanded);

  const containerRef = useRef<HTMLDivElement>(null);

  // Subscribe to cells written to the virtual simulator bus
  useEffect(() => {
    const unsub = virtualSimulatorBus.onWrite((newCells) => {
      const copy = new Uint8Array(cellsCount);
      copy.set(newCells.slice(0, cellsCount));
      setCells(copy);
    });
    return unsub;
  }, [cellsCount]);

  // Periodic poll to keep synchronized with manager's visible cells
  useEffect(() => {
    if (!brailleCtx?.manager) return;
    const interval = setInterval(() => {
      const vis = brailleCtx?.manager?.visibleCells();
      if (vis && vis.length > 0) {
        setCells((prev) => {
          let diff = false;
          for (let i = 0; i < Math.min(vis.length, cellsCount); i++) {
            if (prev[i] !== vis[i]) {
              diff = true;
              break;
            }
          }
          if (!diff) return prev;
          const copy = new Uint8Array(cellsCount);
          copy.set(vis.slice(0, cellsCount));
          return copy;
        });
      }
    }, 200);
    return () => clearInterval(interval);
  }, [brailleCtx?.manager, cellsCount]);

  // Send a hardware key event
  const dispatchKey = useCallback(
    (event: BrailleKeyEvent) => {
      virtualSimulatorBus.sendKey(event);
      // A connected virtual display already passes the key to the manager. Calling it here too
      // handled every key twice (rocker skipped a result, "pdf" typed as "ppddff").
      if (brailleCtx?.manager && brailleCtx.info?.transport !== "virtual") {
        void brailleCtx.manager.handleKey(event);
      }
      setLastAction(`Key: ${event.kind} ${"dir" in event ? event.dir : "index" in event ? event.index : "dots" in event ? event.dots : ""}`);
    },
    [brailleCtx?.manager, brailleCtx?.info?.transport],
  );

  // Handle routing button click
  const handleRoute = useCallback(
    (index: number) => {
      setSelectedCellIndex(index);
      if (onRoute) onRoute(index);
      dispatchKey({ kind: "route", index });
    },
    [dispatchKey, onRoute],
  );

  // Handle panning buttons
  const handlePan = useCallback(
    (dir: "left" | "right") => {
      dispatchKey({ kind: "pan", dir });
    },
    [dispatchKey],
  );

  // Handle line rocker navigation
  const handleLine = useCallback(
    (dir: "up" | "down") => {
      dispatchKey({ kind: "line", dir });
    },
    [dispatchKey],
  );

  // Perkins keyboard: toggle a dot in the pending chord
  const toggleDot = useCallback((dot: number) => {
    setPendingDots((prev) => (prev.includes(dot) ? prev.filter((d) => d !== dot) : [...prev, dot].sort((a, b) => a - b)));
  }, []);

  // Perkins keyboard: commit chord
  const handleCommitChord = useCallback(() => {
    if (pendingDots.length === 0) return;
    const mask = dotsToMask(pendingDots);
    dispatchKey({ kind: "dots", dots: mask });
    setPendingDots([]);
    setLastAction(`Chord typed: dots ${pendingDots.join("-")} (mask ${mask})`);
  }, [dispatchKey, pendingDots]);

  // Perkins keyboard: space key
  const handleSpace = useCallback(() => {
    if (pendingDots.length > 0) {
      const mask = dotsToMask(pendingDots);
      dispatchKey({ kind: "dots", dots: mask });
      setPendingDots([]);
    }
    dispatchKey({ kind: "space" });
    setLastAction("Space pressed (word committed)");
  }, [dispatchKey, pendingDots]);

  // Perkins keyboard: backspace key
  const handleBackspace = useCallback(() => {
    if (pendingDots.length > 0) {
      setPendingDots((prev) => prev.slice(0, -1));
      return;
    }
    dispatchKey({ kind: "backspace" });
  }, [dispatchKey, pendingDots]);

  // Perkins keyboard: enter key
  const handleEnter = useCallback(() => {
    if (pendingDots.length > 0) {
      const mask = dotsToMask(pendingDots);
      dispatchKey({ kind: "dots", dots: mask });
      setPendingDots([]);
    }
    dispatchKey({ kind: "enter" });
  }, [dispatchKey, pendingDots]);

  // Command: Space pressed together with the chosen dots (Space + S summarizes, Space + L lists commands)
  const handleCommand = useCallback(() => {
    if (pendingDots.length === 0) return;
    dispatchKey({ kind: "chord", dots: dotsToMask(pendingDots) });
    setLastAction(`Command: Space + dots ${pendingDots.join("-")}`);
    setPendingDots([]);
  }, [dispatchKey, pendingDots]);

  // Toggle connection mode (In-Memory vs WebSocket)
  const toggleConnectionMode = useCallback(async () => {
    if (connectionMode === "local") {
      try {
        setWsStatus("Connecting to /braille/simulate...");
        const d = await VirtualBrailleDisplay.connectWs();
        if (brailleCtx) {
          await brailleCtx.manager.attach(d);
        }
        setConnectionMode("ws");
        setWsStatus("Connected to WebSocket");
      } catch (e) {
        setWsStatus(`WS failed: ${(e as Error).message}`);
      }
    } else {
      const d = VirtualBrailleDisplay.connectLocal(cellsCount);
      if (brailleCtx) {
        await brailleCtx.manager.attach(d);
      }
      setConnectionMode("local");
      setWsStatus("In-Memory Mode (0ms latency)");
    }
  }, [brailleCtx, cellsCount, connectionMode]);

  // Physical keyboard hotkeys for Perkins chording
  useEffect(() => {
    if (!keyboardCapture) return;

    const keyMap: Record<string, number> = {
      f: 1,
      F: 1,
      d: 2,
      D: 2,
      s: 3,
      S: 3,
      a: 7,
      A: 7,
      j: 4,
      J: 4,
      k: 5,
      K: 5,
      l: 6,
      L: 6,
      ";": 8,
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [role=textbox], [contenteditable]")) {
        return;
      }

      if (e.key in keyMap) {
        e.preventDefault();
        toggleDot(keyMap[e.key]);
      } else if (e.code === "Space") {
        e.preventDefault();
        handleSpace();
      } else if (e.code === "Backspace") {
        e.preventDefault();
        handleBackspace();
      } else if (e.code === "Enter") {
        e.preventDefault();
        handleEnter();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        handlePan("left");
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        handlePan("right");
      } else if (e.code === "ArrowUp") {
        e.preventDefault();
        handleLine("up");
      } else if (e.code === "ArrowDown") {
        e.preventDefault();
        handleLine("down");
      }
    };

    document.body.dataset.brailleCapture = "on"; // page shortcuts such as J and K stand down while keys are chords
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      delete document.body.dataset.brailleCapture;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleBackspace, handleEnter, handleLine, handlePan, handleSpace, keyboardCapture, toggleDot]);

  // Reset simulator
  const handleReset = useCallback(() => {
    virtualSimulatorBus.reset();
    setCells(new Uint8Array(cellsCount));
    setPendingDots([]);
    setLastAction("Cells reset to blank");
  }, [cellsCount]);

  // Copy unicode braille
  const handleCopyUnicode = useCallback(() => {
    const str = Array.from(cells, maskToUnicode).join("");
    void navigator.clipboard.writeText(str);
    setLastAction("Copied Unicode Braille to clipboard");
  }, [cells]);

  // Inspect active cell
  const inspectIndex = hoveredCellIndex ?? selectedCellIndex ?? 0;
  const inspectByte = cells[inspectIndex] ?? 0;
  const inspectUnicode = maskToUnicode(inspectByte);
  const inspectDots = useMemo(() => {
    const active: number[] = [];
    for (let dot = 1; dot <= 8; dot++) {
      if ((inspectByte & DOT_MASKS[dot]) !== 0) active.push(dot);
    }
    return active;
  }, [inspectByte]);

  return (
    <div
      ref={containerRef}
      className={`braille-hardware-simulator ${className}`}
      style={{
        background: "linear-gradient(180deg, #181b22 0%, #101216 100%)",
        color: "#f1f5f9",
        borderRadius: "16px",
        border: "1px solid #2d3342",
        boxShadow: "0 20px 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08)",
        padding: "16px 20px",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        userSelect: "none",
        maxWidth: "100%",
        boxSizing: "border-box",
      }}
      role="region"
      aria-label="Virtual Braille Hardware Display Simulator"
    >
      {/* ==================== TOP CHASSIS BEZEL ==================== */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid #252b38",
          paddingBottom: "12px",
          marginBottom: "16px",
          flexWrap: "wrap",
          gap: "10px",
        }}
      >
        {/* Status Indicators (PWR, BT/NET) */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.8rem", fontWeight: 600 }}>
            <span
              style={{
                width: "9px",
                height: "9px",
                borderRadius: "50%",
                background: "#22c55e",
                boxShadow: "0 0 8px #22c55e",
                display: "inline-block",
              }}
            />
            <span style={{ color: "#94a3b8", letterSpacing: "1px" }}>PWR</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.8rem", fontWeight: 600 }}>
            <span
              style={{
                width: "9px",
                height: "9px",
                borderRadius: "50%",
                background: connectionMode === "ws" ? "#38bdf8" : "#a855f7",
                boxShadow: connectionMode === "ws" ? "0 0 8px #38bdf8" : "0 0 8px #a855f7",
                display: "inline-block",
              }}
            />
            <span style={{ color: "#94a3b8", letterSpacing: "1px" }}>{connectionMode === "ws" ? "NET WS" : "IN-MEM"}</span>
          </div>

          <button
            type="button"
            onClick={() => void toggleConnectionMode()}
            style={{
              background: "#1e2430",
              border: "1px solid #333d4e",
              borderRadius: "6px",
              color: "#cbd5e1",
              fontSize: "0.75rem",
              padding: "3px 8px",
              cursor: "pointer",
            }}
            title="Toggle between In-Memory mode and FastAPI WebSocket mode"
          >
            Switch to {connectionMode === "ws" ? "In-Memory" : "WebSocket"}
          </button>
        </div>

        {/* Chassis Model Header */}
        <div style={{ textAlign: "center" }}>
          <h2
            style={{
              margin: 0,
              fontSize: "1rem",
              letterSpacing: "3px",
              fontWeight: 800,
              textTransform: "uppercase",
              background: "linear-gradient(180deg, #f8fafc 0%, #94a3b8 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            VIRTUAL BRAILLE {cellsCount}
          </h2>
          <span style={{ fontSize: "0.7rem", color: "#94a3b8" }}>Refreshable Tactile Notetaker • 8-Pin Cells</span>
        </div>

        {/* Quick Toggles */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            type="button"
            onClick={() => setSightedMode((s) => !s)}
            style={{
              background: sightedMode ? "#0369a1" : "#1e2430",
              color: sightedMode ? "#ffffff" : "#94a3b8",
              border: "1px solid #38bdf8",
              borderRadius: "6px",
              fontSize: "0.75rem",
              padding: "4px 10px",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            👁 Sighted Mode: {sightedMode ? "ON" : "OFF"}
          </button>

          <button
            type="button"
            onClick={() => setIsExpanded((e) => !e)}
            style={{
              background: "#1e2430",
              color: "#cbd5e1",
              border: "1px solid #333d4e",
              borderRadius: "6px",
              fontSize: "0.75rem",
              padding: "4px 10px",
              cursor: "pointer",
            }}
          >
            {isExpanded ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>

      {isExpanded && (
        <>
          {/* ==================== PERKINS KEYBOARD SECTION ==================== */}
          <div
            style={{
              background: "linear-gradient(180deg, #14171f 0%, #0d0f14 100%)",
              border: "1px solid #232834",
              borderRadius: "12px",
              padding: "16px",
              marginBottom: "16px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <span style={{ fontSize: "0.75rem", color: "#94a3b8", fontWeight: 700, letterSpacing: "1px" }}>
                PERKINS 8-DOT BRAILLE CHORDER
              </span>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <label style={{ fontSize: "0.75rem", color: "#cbd5e1", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" }}>
                  <input
                    type="checkbox"
                    checked={keyboardCapture}
                    onChange={(e) => setKeyboardCapture(e.target.checked)}
                  />
                  <span>Keyboard Hotkeys (F-D-S + J-K-L)</span>
                </label>
              </div>
            </div>

            {/* Ergonomic Curved 8-Dot Perkins Layout */}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "flex-end",
                gap: "10px",
                flexWrap: "wrap",
                padding: "8px 0",
              }}
            >
              {/* Left Hand: Dot 7, Dot 3, Dot 2, Dot 1 */}
              <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
                {[
                  { dot: 7, label: "Dot 7", sub: "A", offset: 12 },
                  { dot: 3, label: "Dot 3", sub: "S", offset: 6 },
                  { dot: 2, label: "Dot 2", sub: "D", offset: 2 },
                  { dot: 1, label: "Dot 1", sub: "F", offset: 0 },
                ].map(({ dot, label, sub, offset }) => {
                  const active = pendingDots.includes(dot);
                  return (
                    <button
                      key={dot}
                      type="button"
                      onClick={() => toggleDot(dot)}
                      style={{
                        width: "48px",
                        height: "76px",
                        transform: `translateY(-${offset}px)`,
                        borderRadius: "24px 24px 8px 8px",
                        background: active
                          ? "linear-gradient(180deg, #0284c7 0%, #0369a1 100%)"
                          : "linear-gradient(180deg, #2b3240 0%, #1e2430 100%)",
                        color: active ? "#ffffff" : "#e2e8f0",
                        border: active ? "2px solid #38bdf8" : "1px solid #3e4758",
                        boxShadow: active
                          ? "0 0 12px rgba(56, 189, 248, 0.7), inset 0 2px 2px rgba(255,255,255,0.4)"
                          : "0 4px 6px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.1)",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "4px",
                        transition: "all 0.1s ease",
                      }}
                      title={`Toggle ${label} (Key: ${sub})`}
                    >
                      <span style={{ fontSize: "0.8rem", fontWeight: 700 }}>{dot}</span>
                      <span style={{ fontSize: "0.65rem", color: active ? "#e0f2fe" : "#94a3b8" }}>{sub}</span>
                    </button>
                  );
                })}
              </div>

              {/* Space Bar in Center */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", margin: "0 6px" }}>
                <button
                  type="button"
                  onClick={handleSpace}
                  style={{
                    width: "140px",
                    height: "50px",
                    borderRadius: "10px",
                    background: "linear-gradient(180deg, #333d4e 0%, #202733 100%)",
                    border: "1px solid #4a5568",
                    color: "#f8fafc",
                    fontWeight: 700,
                    fontSize: "0.85rem",
                    letterSpacing: "2px",
                    boxShadow: "0 4px 8px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.15)",
                    cursor: "pointer",
                  }}
                  title="Space / Commit Word (Spacebar)"
                >
                  SPACE
                </button>
                <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
                  <button
                    type="button"
                    onClick={handleCommitChord}
                    disabled={pendingDots.length === 0}
                    style={{
                      background: pendingDots.length > 0 ? "#059669" : "#1f2937",
                      color: pendingDots.length > 0 ? "#fff" : "#6b7280",
                      border: "1px solid #374151",
                      borderRadius: "6px",
                      fontSize: "0.7rem",
                      padding: "3px 8px",
                      cursor: pendingDots.length > 0 ? "pointer" : "not-allowed",
                      fontWeight: 600,
                    }}
                  >
                    Commit ({pendingDots.length > 0 ? pendingDots.join("") : "none"})
                  </button>
                  <button
                    type="button"
                    onClick={handleBackspace}
                    style={{
                      background: "#1e2430",
                      color: "#f87171",
                      border: "1px solid #374151",
                      borderRadius: "6px",
                      fontSize: "0.7rem",
                      padding: "3px 8px",
                      cursor: "pointer",
                    }}
                  >
                    ⌫ Del
                  </button>
                  <button
                    type="button"
                    onClick={handleEnter}
                    style={{
                      background: "#1e2430",
                      color: "#60a5fa",
                      border: "1px solid #374151",
                      borderRadius: "6px",
                      fontSize: "0.7rem",
                      padding: "3px 8px",
                      cursor: "pointer",
                    }}
                  >
                    ↵ Enter
                  </button>
                  <button
                    type="button"
                    onClick={handleCommand}
                    disabled={pendingDots.length === 0}
                    title="Command: Space pressed with the chosen dots (for example Space + S to summarize, Space + L for the list)"
                    style={{
                      background: "#1e2430",
                      color: "#fcd34d",
                      border: "1px solid #374151",
                      borderRadius: "6px",
                      fontSize: "0.7rem",
                      padding: "3px 8px",
                      cursor: pendingDots.length ? "pointer" : "not-allowed",
                    }}
                  >
                    ⌘ Space + dots
                  </button>
                </div>
              </div>

              {/* Right Hand: Dot 4, Dot 5, Dot 6, Dot 8 */}
              <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
                {[
                  { dot: 4, label: "Dot 4", sub: "J", offset: 0 },
                  { dot: 5, label: "Dot 5", sub: "K", offset: 2 },
                  { dot: 6, label: "Dot 6", sub: "L", offset: 6 },
                  { dot: 8, label: "Dot 8", sub: ";", offset: 12 },
                ].map(({ dot, label, sub, offset }) => {
                  const active = pendingDots.includes(dot);
                  return (
                    <button
                      key={dot}
                      type="button"
                      onClick={() => toggleDot(dot)}
                      style={{
                        width: "48px",
                        height: "76px",
                        transform: `translateY(-${offset}px)`,
                        borderRadius: "24px 24px 8px 8px",
                        background: active
                          ? "linear-gradient(180deg, #0284c7 0%, #0369a1 100%)"
                          : "linear-gradient(180deg, #2b3240 0%, #1e2430 100%)",
                        color: active ? "#ffffff" : "#e2e8f0",
                        border: active ? "2px solid #38bdf8" : "1px solid #3e4758",
                        boxShadow: active
                          ? "0 0 12px rgba(56, 189, 248, 0.7), inset 0 2px 2px rgba(255,255,255,0.4)"
                          : "0 4px 6px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.1)",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "4px",
                        transition: "all 0.1s ease",
                      }}
                      title={`Toggle ${label} (Key: ${sub})`}
                    >
                      <span style={{ fontSize: "0.8rem", fontWeight: 700 }}>{dot}</span>
                      <span style={{ fontSize: "0.65rem", color: active ? "#e0f2fe" : "#94a3b8" }}>{sub}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ==================== TACTILE CELLS DISPLAY SECTION ==================== */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: "#0b0d12",
              border: "2px solid #1f242e",
              borderRadius: "14px",
              padding: "14px 10px",
              boxShadow: "inset 0 4px 12px rgba(0,0,0,0.8)",
              position: "relative",
            }}
          >
            {/* Left Nav Rockers & Pan Left Key */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => handleLine("up")}
                style={{
                  width: "56px",
                  height: "30px",
                  borderRadius: "6px",
                  background: "linear-gradient(180deg, #2a313d 0%, #1b2029 100%)",
                  border: "1px solid #384252",
                  color: "#e2e8f0",
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.5)",
                }}
                title="Line Up / Previous Section"
              >
                ▲ Line
              </button>

              <button
                type="button"
                onClick={() => handlePan("left")}
                style={{
                  width: "56px",
                  height: "54px",
                  borderRadius: "8px",
                  background: "linear-gradient(180deg, #374151 0%, #1f2937 100%)",
                  border: "2px solid #4b5563",
                  color: "#67e8f9",
                  fontSize: "0.75rem",
                  fontWeight: 800,
                  cursor: "pointer",
                  boxShadow: "0 4px 6px rgba(0,0,0,0.6)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "2px",
                }}
                title="Pan Left (Thumb Key)"
              >
                <span style={{ fontSize: "1rem" }}>◀</span>
                <span>PAN</span>
              </button>

              <button
                type="button"
                onClick={() => handleLine("down")}
                style={{
                  width: "56px",
                  height: "30px",
                  borderRadius: "6px",
                  background: "linear-gradient(180deg, #2a313d 0%, #1b2029 100%)",
                  border: "1px solid #384252",
                  color: "#e2e8f0",
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.5)",
                }}
                title="Line Down / Next Section"
              >
                ▼ Line
              </button>
            </div>

            {/* Scrollable 40-Cell Tray */}
            <div
              style={{
                display: "flex",
                gap: "6px",
                overflowX: "auto",
                padding: "8px 6px",
                flexGrow: 1,
                scrollBehavior: "smooth",
              }}
              tabIndex={0}
              role="group"
              aria-label="40 Refreshable Braille Cells"
            >
              {Array.from({ length: cellsCount }).map((_, index) => {
                const byte = cells[index] ?? 0;
                const isSelected = selectedCellIndex === index;
                const isHovered = hoveredCellIndex === index;

                return (
                  <div
                    key={index}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "4px",
                      flexShrink: 0,
                    }}
                    onMouseEnter={() => setHoveredCellIndex(index)}
                    onMouseLeave={() => setHoveredCellIndex(null)}
                  >
                    {/* Routing Button (Micro-Switch above cell) */}
                    <button
                      type="button"
                      onClick={() => handleRoute(index)}
                      style={{
                        width: "22px",
                        height: "14px",
                        borderRadius: "7px",
                        background: isSelected
                          ? "#38bdf8"
                          : isHovered
                            ? "#475569"
                            : "#272e3b",
                        border: isSelected ? "1px solid #e0f2fe" : "1px solid #3a4454",
                        boxShadow: isSelected
                          ? "0 0 6px #38bdf8"
                          : "inset 0 1px 1px rgba(255,255,255,0.1)",
                        cursor: "pointer",
                        padding: 0,
                        transition: "all 0.1s ease",
                      }}
                      title={`Cursor Routing Button ${index + 1}`}
                      aria-label={`Route cursor to cell ${index + 1}`}
                    />

                    {/* 8-Pin Tactile Cell Pin Socket */}
                    <div
                      onClick={() => setSelectedCellIndex(index)}
                      style={{
                        width: "32px",
                        height: "56px",
                        borderRadius: "6px",
                        background: isSelected
                          ? "#1e293b"
                          : "#141720",
                        border: isSelected
                          ? "1.5px solid #38bdf8"
                          : "1px solid #232833",
                        boxShadow: isSelected
                          ? "0 0 8px rgba(56, 189, 248, 0.5), inset 0 1px 3px rgba(0,0,0,0.9)"
                          : "inset 0 2px 4px rgba(0,0,0,0.8)",
                        display: "flex",
                        justifyContent: "space-around",
                        padding: "5px 3px",
                        cursor: "pointer",
                        boxSizing: "border-box",
                      }}
                    >
                      {/* Left Column: Pins 1, 2, 3, 7 */}
                      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                        {LEFT_PINS.map((dotNum) => {
                          const raised = (byte & DOT_MASKS[dotNum]) !== 0;
                          return (
                            <div
                              key={dotNum}
                              style={{
                                width: "9px",
                                height: "9px",
                                borderRadius: "50%",
                                background: raised
                                  ? "radial-gradient(circle at 35% 35%, #ffffff 0%, #cbd5e1 55%, #94a3b8 100%)"
                                  : "#1c202a",
                                boxShadow: raised
                                  ? "0 0 5px rgba(255,255,255,0.9), 0 1px 2px rgba(0,0,0,0.8), inset 0 1px 1px #fff"
                                  : "inset 0 1px 2px rgba(0,0,0,0.9)",
                                border: raised ? "0.5px solid #ffffff" : "0.5px solid #141720",
                                transition: "all 0.12s ease",
                              }}
                              title={`Dot ${dotNum}: ${raised ? "Raised" : "Indented"}`}
                            />
                          );
                        })}
                      </div>

                      {/* Right Column: Pins 4, 5, 6, 8 */}
                      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                        {RIGHT_PINS.map((dotNum) => {
                          const raised = (byte & DOT_MASKS[dotNum]) !== 0;
                          return (
                            <div
                              key={dotNum}
                              style={{
                                width: "9px",
                                height: "9px",
                                borderRadius: "50%",
                                background: raised
                                  ? "radial-gradient(circle at 35% 35%, #ffffff 0%, #cbd5e1 55%, #94a3b8 100%)"
                                  : "#1c202a",
                                boxShadow: raised
                                  ? "0 0 5px rgba(255,255,255,0.9), 0 1px 2px rgba(0,0,0,0.8), inset 0 1px 1px #fff"
                                  : "inset 0 1px 2px rgba(0,0,0,0.9)",
                                border: raised ? "0.5px solid #ffffff" : "0.5px solid #141720",
                                transition: "all 0.12s ease",
                              }}
                              title={`Dot ${dotNum}: ${raised ? "Raised" : "Indented"}`}
                            />
                          );
                        })}
                      </div>
                    </div>

                    {/* Sighted Inspection Layer */}
                    {sightedMode && (
                      <div style={{ textAlign: "center", marginTop: "2px" }}>
                        <div
                          style={{
                            fontSize: "1.05rem",
                            lineHeight: "1.1",
                            color: byte > 0 ? "#38bdf8" : "#475569",
                            fontFamily: "monospace",
                          }}
                        >
                          {maskToUnicode(byte)}
                        </div>
                        <div style={{ fontSize: "0.6rem", color: "#94a3b8" }}>{index + 1}</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Right Nav Rockers & Pan Right Key */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => handleLine("up")}
                style={{
                  width: "56px",
                  height: "30px",
                  borderRadius: "6px",
                  background: "linear-gradient(180deg, #2a313d 0%, #1b2029 100%)",
                  border: "1px solid #384252",
                  color: "#e2e8f0",
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.5)",
                }}
                title="Line Up / Previous Section"
              >
                ▲ Line
              </button>

              <button
                type="button"
                onClick={() => handlePan("right")}
                style={{
                  width: "56px",
                  height: "54px",
                  borderRadius: "8px",
                  background: "linear-gradient(180deg, #374151 0%, #1f2937 100%)",
                  border: "2px solid #4b5563",
                  color: "#67e8f9",
                  fontSize: "0.75rem",
                  fontWeight: 800,
                  cursor: "pointer",
                  boxShadow: "0 4px 6px rgba(0,0,0,0.6)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "2px",
                }}
                title="Pan Right (Thumb Key)"
              >
                <span style={{ fontSize: "1rem" }}>▶</span>
                <span>PAN</span>
              </button>

              <button
                type="button"
                onClick={() => handleLine("down")}
                style={{
                  width: "56px",
                  height: "30px",
                  borderRadius: "6px",
                  background: "linear-gradient(180deg, #2a313d 0%, #1b2029 100%)",
                  border: "1px solid #384252",
                  color: "#e2e8f0",
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.5)",
                }}
                title="Line Down / Next Section"
              >
                ▼ Line
              </button>
            </div>
          </div>

          {/* ==================== SIGHTED INSPECTION BAR & ACTIONS ==================== */}
          <div
            style={{
              marginTop: "14px",
              background: "#131720",
              border: "1px solid #232a36",
              borderRadius: "10px",
              padding: "10px 14px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "10px",
              fontSize: "0.8rem",
            }}
          >
            {/* Cell Inspector Details */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              <span style={{ color: "#38bdf8", fontWeight: 700 }}>
                Cell #{inspectIndex + 1} of {cellsCount}:
              </span>
              <span style={{ color: "#cbd5e1" }}>
                Unicode: <strong style={{ fontSize: "1rem", color: "#f8fafc" }}>{inspectUnicode}</strong>
              </span>
              <span style={{ color: "#cbd5e1" }}>
                Dots: <strong>{inspectDots.length > 0 ? inspectDots.join(", ") : "None"}</strong>
              </span>
              <span style={{ color: "#94a3b8", fontFamily: "monospace" }}>
                Byte: 0b{inspectByte.toString(2).padStart(8, "0")} ({inspectByte})
              </span>
            </div>

            {/* Action Buttons */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ color: "#94a3b8", fontSize: "0.75rem", fontStyle: "italic" }}>
                Status: {lastAction}
              </span>
              <button
                type="button"
                onClick={handleCopyUnicode}
                style={{
                  background: "#1e293b",
                  border: "1px solid #334155",
                  borderRadius: "6px",
                  color: "#e2e8f0",
                  padding: "4px 8px",
                  cursor: "pointer",
                  fontSize: "0.75rem",
                }}
              >
                Copy Braille
              </button>
              <button
                type="button"
                onClick={handleReset}
                style={{
                  background: "#1e293b",
                  border: "1px solid #334155",
                  borderRadius: "6px",
                  color: "#fca5a5",
                  padding: "4px 8px",
                  cursor: "pointer",
                  fontSize: "0.75rem",
                }}
              >
                Reset Cells
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
export default BrailleHardwareSimulator;
