"use client";
// Voxide voice layer (@voxide/react): registers what the app can do; the voice agent calls these actions.
// Handlers return short plain data because Voxide speaks what they return.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { VoxideClient, VoxideWidget } from "@voxide/react";
import { useRouter } from "next/navigation";
import { LANGUAGES, useLanguage, type Language } from "@/components/braille/AppBrailleProvider";
import { api, type Lang } from "@/lib/api/client";
import { getBraillePage, lastSearch, readerState, sendReaderEvent, showInBraille } from "@/lib/appBus";

const KEY = process.env.NEXT_PUBLIC_VOXIDE_PUBLIC_KEY ?? "";
const EXCERPT = 1200;

function current() {
  const s = readerState.sections[readerState.index];
  return s ? { s, index: readerState.index } : null;
}

function moveTo(index: number) {
  const target = readerState.sections[index];
  if (!target) return { error: index < 0 ? "This is the first section." : "This is the last section." };
  sendReaderEvent({ type: "goto", index });
  return { section: index + 1, of: readerState.sections.length, heading: target.heading, text: target.text.slice(0, EXCERPT) };
}

/** Alt+V starts or stops listening, so the assistant never talks over a screen reader unasked (FR-15). */
export const VOICE_HOTKEY = "alt+v";

const asLang = (v: unknown, fallback: Lang): Lang => (v === "en" || v === "am" || v === "om" ? v : fallback);

export default function VoiceAssistant() {
  const router = useRouter();
  const { language } = useLanguage();
  const langRef = useRef<Language>(language);
  langRef.current = language;
  const [voiceError, setVoiceError] = useState("");

  const client = useMemo(() => {
    if (!KEY.startsWith("vox_pub_") || KEY === "vox_pub_...") return null;
    const ai = new VoxideClient({
      publicKey: KEY,
      language: LANGUAGES.find((l) => l.id === langRef.current)?.voice,
      ui: { hotkeyActivate: VOICE_HOTKEY, theme: "dark", accentColor: "#38bdf8" },
    });
    ai.enableMultilingual({ mode: "adaptive", supported: LANGUAGES.map((l) => l.voice) });

    ai.register({
      searchPapers: {
        description: "Search academic papers by topic or title. Reads back the top results.",
        params: { query: { type: "string", required: true } },
        handler: async ({ query }) => {
          const results = await api.search(query, 5);
          lastSearch.length = 0;
          lastSearch.push(...results.map((r) => ({ external_id: r.external_id, title: r.title })));
          router.push(`/?q=${encodeURIComponent(query)}`);
          return results.map((r, i) => ({
            number: i + 1,
            title: r.title,
            authors: r.authors.slice(0, 3).join(", "),
            year: r.year,
            summary: r.abstract_short,
          }));
        },
      },
      openPaper: {
        description: "Open one of the papers from the last search, by its number (1 is the first result).",
        params: { number: { type: "number", required: true } },
        handler: async ({ number }) => {
          const pick = lastSearch[number - 1];
          if (!pick) return { error: "There is no search result with that number. Search first." };
          const { paper_id } = await api.importPaper(pick.external_id);
          router.push(`/papers/${paper_id}`);
          return { opening: pick.title, note: "It takes a few seconds to prepare the paper." };
        },
      },
      paperOverview: {
        description: "Give the overview and key takeaways of the paper that is open.",
        handler: async () => {
          if (!readerState.paperId) return { error: "No paper is open." };
          const o = await api.overview(readerState.paperId, langRef.current);
          return { overview: o.overview, takeaways: o.takeaways };
        },
      },
      nextSection: { description: "Go to the next section of the open paper.", handler: () => moveTo(readerState.index + 1) },
      previousSection: { description: "Go to the previous section of the open paper.", handler: () => moveTo(readerState.index - 1) },
      goToSection: {
        description: "Go to a section by its number in the section list.",
        params: { number: { type: "number", required: true } },
        handler: ({ number }) => moveTo(number - 1),
      },
      readSection: {
        description: "Read the current section's text aloud.",
        handler: () => {
          const c = current();
          return c ? { heading: c.s.heading, text: c.s.text.slice(0, EXCERPT) } : { error: "No section is open." };
        },
      },
      summarizeSection: {
        description: "Summarize the current section in a few sentences.",
        handler: async () => {
          const c = current();
          if (!c) return { error: "No section is open." };
          const r = await api.summarizeSection(c.s.id, langRef.current);
          return { heading: c.s.heading, summary: r.summary };
        },
      },
      askPaper: {
        description: "Answer a question about the open paper, naming the section the answer came from.",
        params: {
          question: { type: "string", required: true },
          language: { type: "string", description: "Answer language: en, am (Amharic) or om (Afaan Oromoo). Defaults to the app setting." },
        },
        handler: async ({ question, language }) => {
          if (!readerState.paperId) return { error: "No paper is open." };
          const a = await api.ask(readerState.paperId, question, asLang(language, langRef.current));
          const first = a.citations[0];
          if (first) {
            const idx = readerState.sections.findIndex((s) => s.id === first.section_id);
            if (idx >= 0) sendReaderEvent({ type: "goto", index: idx });
          }
          return { answer: a.answer, answered: a.answered, sources: a.citations.map((c) => c.heading) };
        },
      },
      addNote: {
        description: "Save a note about the current section of the open paper.",
        params: { text: { type: "string", required: true } },
        handler: async ({ text }) => {
          const c = current();
          if (!readerState.paperId || !c) return { error: "Open a paper first." };
          await api.createNote({ paper_id: readerState.paperId, section_id: c.s.id, text, source: "voice" });
          return { saved: true, section: c.s.heading };
        },
      },
      showInBraille: {
        description:
          "Show what is on this page on the Braille display: the current section in the reader, notes on the notes page, search results on the home page.",
        handler: async () => {
          const what = getBraillePage()?.current?.();
          if (!what) return { error: "There is nothing on this page to show in Braille." };
          return { result: await showInBraille(what.text, what.label) };
        },
      },
    });

    ai.bindState(() => ({
      openPaper: readerState.title || null,
      currentSection: readerState.sections[readerState.index]?.heading ?? null,
      sectionNumber: readerState.sections.length ? readerState.index + 1 : null,
      sectionCount: readerState.sections.length,
    }));
    return ai;
  }, [router]);

  // Say out loud why voice stopped; otherwise a blind user only hears silence.
  useEffect(() => {
    if (!client) return;
    const offError = client.on("error", (code: unknown) => {
      const c = String(code ?? "");
      setVoiceError(
        c === "usage_limit"
          ? "Voice is unavailable: the Voxide usage limit for this project is reached. Everything else works with the Braille display and keyboard."
          : `Voice stopped: ${c || "connection error"}. Press Alt+V to try again.`,
      );
    });
    const offStatus = client.on("status", (st: unknown) => {
      if (st === "listening") setVoiceError("");
    });
    return () => {
      offError();
      offStatus();
    };
  }, [client]);

  // Keep the voice language in step with the language picker.
  useEffect(() => {
    const voice = LANGUAGES.find((l) => l.id === language)?.voice;
    if (client && voice) client.setLanguage(voice);
  }, [client, language]);

  if (!client) {
    return (
      <p className="voice-missing" role="status">
        Voice is off: set NEXT_PUBLIC_VOXIDE_PUBLIC_KEY in apps/web/.env.local.
      </p>
    );
  }
  return (
    <>
      <p role="alert" className={voiceError ? "voice-missing" : "sr-only"}>
        {voiceError}
      </p>
      <VoxideWidget client={client} theme="dark" accentColor="#38bdf8" title={`Braille Talks voice (${VOICE_HOTKEY} to talk)`} />
    </>
  );
}
