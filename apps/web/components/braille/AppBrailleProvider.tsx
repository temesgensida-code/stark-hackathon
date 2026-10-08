"use client";
// Connects the Braille display to the app, and owns the language setting.
//  - display events: routing key -> caret, panning past the end / rocker -> next or previous section,
//    Perkins typing -> the focused field (or the reader's note box).
//  - language: one setting (English, Amharic, Afaan Oromoo) that picks the Braille code and the AI output language.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { BrailleProvider, useBraille } from "@/components/braille/BrailleDisplayConnect";
import type { ManagerCallbacks } from "@/lib/braille/brailleManager";
import { typeIntoFocused } from "@/lib/braille/typing";
import { useRouter } from "next/navigation";
import { getBraillePage, readerState, runGlobalBrailleCommand, sendReaderEvent, setBrailleOutput, setGlobalBrailleCommand } from "@/lib/appBus";
import { commandForChord, commandHelp } from "@/lib/braille/commands";

export type Language = "en" | "am" | "om";

export const LANGUAGES: { id: Language; label: string; table: string; voice: string }[] = [
  { id: "en", label: "English", table: "en-ueb-g2", voice: "en-US" },
  { id: "am", label: "አማርኛ (Amharic)", table: "am-g1", voice: "am-ET" },
  { id: "om", label: "Afaan Oromoo", table: "om-g1", voice: "om-ET" },
];

interface LanguageCtx {
  /** Show text on the Braille display and announce it. Returns the announcement. */
  showInBraille(text: string, label: string, caret?: number): Promise<string>;
  /** What the display is showing, for the on-screen Braille bar. */
  shown: { label: string; text: string } | null;
  language: Language;
  setLanguage(l: Language): void;
  /** Braille code in use; follows the language unless chosen separately on the settings page. */
  table: string;
  setTable(t: string): void;
}

const Ctx = createContext<LanguageCtx | null>(null);

export function useLanguage(): LanguageCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useLanguage must be used inside <AppBrailleProvider>");
  return c;
}

const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};

function LanguageProvider({ children }: { children: React.ReactNode }) {
  const b = useBraille();
  const [language, setLanguageState] = useState<Language>("en");
  const [table, setTableState] = useState("en-ueb-g2");
  const [shown, setShown] = useState<{ label: string; text: string } | null>(null);

  useEffect(() => {
    const l = store.get("bt:language") as Language | null;
    const t = store.get("bt:table");
    if (l && LANGUAGES.some((x) => x.id === l)) setLanguageState(l);
    if (t) setTableState(t);
  }, []);

  useEffect(() => {
    void b.manager.setTable(table);
  }, [table, b.manager]);

  const setLanguage = useCallback((l: Language) => {
    const t = LANGUAGES.find((x) => x.id === l)!.table;
    setLanguageState(l);
    setTableState(t);
    store.set("bt:language", l);
    store.set("bt:table", t);
  }, []);

  const setTable = useCallback((t: string) => {
    setTableState(t);
    store.set("bt:table", t);
  }, []);

  const showInBraille = useCallback(
    async (text: string, label: string, caret = -1) => {
      if (!text.trim()) return "There is nothing to show in Braille here.";
      await b.manager.show(text, caret);
      setShown({ label, text });
      return b.info ? `On the Braille display: ${label}.` : "No Braille display is connected. Open Braille display settings to connect one.";
    },
    [b.manager, b.info],
  );

  useEffect(() => setBrailleOutput(showInBraille), [showInBraille]);

  // Commands that work on every page. Pages handle the rest (the reader: summarize, ask, note...).
  const router = useRouter();
  useEffect(
    () =>
      setGlobalBrailleCommand((dots) => {
        const command = commandForChord(dots);
        if (command === "home") router.push("/");
        else if (command === "help") void showInBraille(commandHelp(), "commands");
        else if (command) void showInBraille("Open a paper first. Space H goes home to search.", "open a paper first");
        else void showInBraille("Unknown command. Space L lists the commands.", "unknown command");
      }),
    [router, showInBraille],
  );

  const value = useMemo(
    () => ({ language, setLanguage, table, setTable, showInBraille, shown }),
    [language, setLanguage, table, setTable, showInBraille, shown],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// A display (real or virtual) calls these when its keys are pressed. The page that owns the display
// (see setBraillePage) handles them first; otherwise they go to the reader and the focused field.
const callbacks: ManagerCallbacks = {
  onRoute: (index) => {
    const page = getBraillePage();
    if (page?.onRoute) page.onRoute(index);
    else sendReaderEvent({ type: "caret", index });
  },
  onNavigate: (dir) => {
    const page = getBraillePage();
    if (page?.onNavigate) page.onNavigate(dir);
    else sendReaderEvent({ type: "goto", index: readerState.index + (dir === "next" ? 1 : -1) });
  },
  onTyped: (text) => {
    if (getBraillePage()?.onTyped?.(text)) return;
    if (!typeIntoFocused(text)) sendReaderEvent({ type: "typed", text });
  },
  onCommand: (event) => {
    if (event.kind !== "chord") return;
    if (getBraillePage()?.onCommand?.(event.dots)) return;
    runGlobalBrailleCommand(event.dots);
  },
};

export function AppBrailleProvider({ children }: { children: React.ReactNode }) {
  return (
    <BrailleProvider apiBase="/api" callbacks={callbacks}>
      <LanguageProvider>{children}</LanguageProvider>
    </BrailleProvider>
  );
}
