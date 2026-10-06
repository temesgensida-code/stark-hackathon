import "./globals.css";
import React from "react";
import Link from "next/link";
import { BrailleProvider } from "@/components/braille/BrailleDisplayConnect";

export const metadata = {
  title: "Braille Talks - Refreshable Tactile Reader & Notetaker",
  description: "Accessible academic research paper reader and Braille hardware simulator",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <BrailleProvider apiBase="/api">
          <header
            style={{
              borderBottom: "1px solid #1f2533",
              background: "#0d1017",
              padding: "12px 24px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              position: "sticky",
              top: 0,
              zIndex: 50,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <Link href="/" style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, fontSize: "1.1rem" }}>
                <span
                  style={{
                    background: "linear-gradient(135deg, #38bdf8 0%, #818cf8 100%)",
                    color: "#0a0c10",
                    padding: "4px 8px",
                    borderRadius: "6px",
                    fontSize: "0.9rem",
                    fontWeight: 900,
                  }}
                >
                  ⠠⠃⠗⠇
                </span>
                <span style={{ color: "#f8fafc" }}>Braille Talks</span>
              </Link>
            </div>

            <nav style={{ display: "flex", alignItems: "center", gap: "18px", fontSize: "0.9rem" }}>
              <Link href="/papers/attention-is-all-you-need" style={{ color: "#cbd5e1" }}>
                Paper Reader
              </Link>
              <Link href="/notes" style={{ color: "#cbd5e1" }}>
                Notes Hub
              </Link>
              <Link href="/settings/braille" style={{ color: "#cbd5e1" }}>
                Display Settings
              </Link>
            </nav>
          </header>

          <main style={{ minHeight: "calc(100vh - 60px)" }}>{children}</main>
        </BrailleProvider>
      </body>
    </html>
  );
}
