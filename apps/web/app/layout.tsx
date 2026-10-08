import "./globals.css";
import React from "react";
import Link from "next/link";
import { AppBrailleProvider } from "@/components/braille/AppBrailleProvider";
import { LanguagePicker } from "@/components/braille/LanguagePicker";
import VoiceAssistant from "@/components/voice/VoiceAssistant";
import { BrailleBar } from "@/components/braille/BrailleBar";

export const metadata = {
  title: "Braille Talks",
  description: "An AI research assistant for blind and low-vision researchers, by voice and Braille display",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <AppBrailleProvider>
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
            <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: "1.1rem" }}>
              <span aria-hidden="true" style={{ background: "linear-gradient(135deg, #38bdf8, #818cf8)", color: "#0a0c10", padding: "4px 8px", borderRadius: 6, fontWeight: 900 }}>
                ⠠⠃⠗⠇
              </span>
              <span>Braille Talks</span>
            </Link>
            <nav aria-label="Main" style={{ display: "flex", gap: 18, fontSize: "0.9rem", alignItems: "center" }}>
              <Link href="/">Papers</Link>
              <Link href="/notes">Notes</Link>
              <Link href="/settings/braille">Braille display</Link>
              <LanguagePicker />
            </nav>
          </header>
          <main id="main" tabIndex={-1} style={{ minHeight: "calc(100vh - 60px)" }}>
            {children}
          </main>
          <BrailleBar />
          <VoiceAssistant />
        </AppBrailleProvider>
      </body>
    </html>
  );
}
