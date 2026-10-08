"use client";
// A bar at the bottom of every page that shows what is on the Braille display, which display is
// connected, and opens the virtual display. Without it, "Show in Braille" looked like it did nothing.
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useBraille } from "@/components/braille/BrailleDisplayConnect";
import { BrailleHardwareSimulator } from "@/components/braille/BrailleHardwareSimulator";
import { useLanguage } from "@/components/braille/AppBrailleProvider";
import { cellsToUnicode } from "@/lib/braille/types";

export function BrailleBar() {
  const b = useBraille();
  const { shown } = useLanguage();
  const [cells, setCells] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setCells(cellsToUnicode(b.manager.visibleCells())), 300);
    return () => clearInterval(t);
  }, [b.manager]);

  // Keep page content clear of the bar (and of the open virtual display).
  useEffect(() => {
    document.body.style.paddingBottom = open ? "62vh" : "96px";
    return () => {
      document.body.style.paddingBottom = "";
    };
  }, [open]);

  return (
    <section className="braille-bar" aria-label="Braille display">
      <div className="row between">
        <div style={{ minWidth: 0, flex: 1 }}>
          <p className="muted" style={{ fontSize: "0.8rem" }}>
            {b.info ? `Braille display: ${b.info.name}` : "No Braille display connected. "}
            {!b.info && <Link href="/settings/braille">Connect one</Link>}
            {shown ? ` · Showing: ${shown.label}` : ""}
          </p>
          <p className="braille-cells" aria-hidden="true" title="What the Braille display shows">
            {cells.replace(/⠀+$/, "") || " "}
          </p>
        </div>
        <button className="btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? "Hide virtual Braille display" : "Show virtual Braille display"}
        </button>
      </div>
      {open && (
        <div style={{ maxHeight: "50vh", overflowY: "auto", marginTop: 8 }}>
          <BrailleHardwareSimulator cellsCount={40} initiallyExpanded />
        </div>
      )}
    </section>
  );
}
