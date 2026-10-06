import React from "react";
import Link from "next/link";

export default function Home() {
  return (
    <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "60px 20px", textAlign: "center" }}>
      <div
        style={{
          display: "inline-block",
          background: "linear-gradient(135deg, #0284c7 0%, #7c3aed 100%)",
          padding: "6px 16px",
          borderRadius: "20px",
          fontSize: "0.85rem",
          fontWeight: 700,
          color: "#f8fafc",
          marginBottom: "20px",
          letterSpacing: "1px",
        }}
      >
        HACKATHON SHOWCASE • BRAILLE HARDWARE SIMULATOR
      </div>

      <h1
        style={{
          fontSize: "3rem",
          fontWeight: 900,
          lineHeight: 1.15,
          marginBottom: "18px",
          background: "linear-gradient(180deg, #ffffff 0%, #94a3b8 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        Tactile Academic Research for the Blind & Visually Impaired
      </h1>

      <p
        style={{
          fontSize: "1.2rem",
          color: "#94a3b8",
          maxWidth: "720px",
          margin: "0 auto 36px auto",
          lineHeight: 1.6,
        }}
      >
        Braille Talks converts academic research papers into accessible refreshable Braille with full cursor routing,
        bidirectional navigation, Perkins keyboard chording, and an authentic 40-cell virtual hardware display simulator.
      </p>

      {/* Action Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "20px",
          textAlign: "left",
          marginTop: "40px",
        }}
      >
        <Link
          href="/papers/attention-is-all-you-need"
          style={{
            background: "#11141c",
            border: "1px solid #283042",
            borderRadius: "14px",
            padding: "24px",
            transition: "all 0.2s ease",
            display: "block",
          }}
        >
          <div style={{ fontSize: "2rem", marginBottom: "12px" }}>📖</div>
          <h2 style={{ fontSize: "1.2rem", color: "#f8fafc", marginBottom: "8px" }}>Research Paper Reader</h2>
          <p style={{ color: "#94a3b8", fontSize: "0.9rem", lineHeight: 1.5 }}>
            Read <em>&quot;Attention Is All You Need&quot;</em> with real-time Braille pin updates, paragraph panning, and
            dockable 40-cell simulator drawer.
          </p>
        </Link>

        <Link
          href="/notes"
          style={{
            background: "#11141c",
            border: "1px solid #283042",
            borderRadius: "14px",
            padding: "24px",
            transition: "all 0.2s ease",
            display: "block",
          }}
        >
          <div style={{ fontSize: "2rem", marginBottom: "12px" }}>⌨️</div>
          <h2 style={{ fontSize: "1.2rem", color: "#f8fafc", marginBottom: "8px" }}>Notes & Perkins Chorder</h2>
          <p style={{ color: "#94a3b8", fontSize: "0.9rem", lineHeight: 1.5 }}>
            Compose research notes using the 8-dot Perkins Braille keyboard, with Liblouis back-translation.
          </p>
        </Link>

        <Link
          href="/settings/braille"
          style={{
            background: "#11141c",
            border: "1px solid #283042",
            borderRadius: "14px",
            padding: "24px",
            transition: "all 0.2s ease",
            display: "block",
          }}
        >
          <div style={{ fontSize: "2rem", marginBottom: "12px" }}>⚙️</div>
          <h2 style={{ fontSize: "1.2rem", color: "#f8fafc", marginBottom: "8px" }}>Hardware & Simulator Settings</h2>
          <p style={{ color: "#94a3b8", fontSize: "0.9rem", lineHeight: 1.5 }}>
            Test WebHID USB/Bluetooth connection, Python BRLTTY bridge, or stand-alone in-memory and WebSocket simulators.
          </p>
        </Link>
      </div>
    </div>
  );
}
