"use client";

import React, { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useBraille } from "@/components/braille/BrailleDisplayConnect";
import { SectionView } from "@/components/reader/SectionView";
import { api, waitUntilReady, type NoteSource, type Answer, type Overview, type PaperDetail, type Section } from "@/lib/api/client";
import { useLanguage } from "@/components/braille/AppBrailleProvider";
import { applyTyped } from "@/lib/braille/typing";
import { commandForChord } from "@/lib/braille/commands";
import { onReaderEvent, readerState, setBraillePage, setReaderState } from "@/lib/appBus";

function isTyping(t: EventTarget | null) {
  return t instanceof HTMLElement && (t.closest("input, textarea, select, [role=textbox], [contenteditable]") !== null);
}

export default function ReaderPage({ params }: { params: Promise<{ id: string }> }) {
  const paperId = Number(use(params).id);
  const b = useBraille();
  const { language, table, showInBraille } = useLanguage();

  const [paper, setPaper] = useState<PaperDetail | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [index, setIndex] = useState(0);
  const [caret, setCaret] = useState(0);
  const [status, setStatus] = useState("Preparing the paper...");
  const [error, setError] = useState("");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [summary, setSummary] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [question, setQuestion] = useState("");
  const [noteText, setNoteText] = useState("");
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Load: wait for parsing, then fetch the sections.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await waitUntilReady(paperId, (j) => alive && setStatus(`Preparing the paper... ${j.progress}%. Downloading a paper from arXiv can take up to a minute.`));
        if (!alive) return;
        if (s.status === "failed") {
          setError(s.error ?? "The paper could not be read.");
          return;
        }
        const [detail, secs] = await Promise.all([api.getPaper(paperId), api.listSections(paperId)]);
        if (!alive) return;
        setPaper(detail);
        setSections(secs);
        setStatus(`${detail.title}. ${secs.length} sections. Press J for the next section and K for the previous one.`);
        if (s.error) setStatus((m) => `${m} Note: ${s.error}`);
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    })();
    return () => {
      alive = false;
    };
  }, [paperId]);

  const active = sections[index];

  // Tell the voice assistant where the user is.
  useEffect(() => {
    setReaderState({ paperId, title: paper?.title ?? "", sections: sections.map((s) => ({ id: s.id, heading: s.heading, text: s.text })), index });
    return () => setReaderState({ paperId: null, title: "", sections: [], index: 0 });
  }, [paperId, paper, sections, index]);

  const goto = useCallback(
    (i: number, focus = true) => {
      const n = Math.max(0, Math.min(sections.length - 1, i));
      if (!sections.length) return;
      setIndex(n);
      setCaret(0);
      setSummary("");
      setStatus(`Section ${n + 1} of ${sections.length}: ${sections[n].heading}`);
      if (focus) requestAnimationFrame(() => headingRef.current?.focus());
    },
    [sections],
  );

  // Section text goes to the Braille display; the caret follows.
  const show = useCallback(async (announce = false) => {
    if (!active?.text) return;
    const message = await showInBraille(active.text, active.heading, caret);
    if (announce) setStatus(message);
  }, [active, caret, showInBraille]);
  useEffect(() => {
    void show();
  }, [show]);

  // What the display's typing goes to when no field is focused: a note (default) or a question.
  const brailleInput = useRef<{ mode: "note" | "question"; text: string }>({ mode: "note", text: "" });

  // The display drives this page: Space + letter commands, and typing that becomes a note or a question.
  // "Show in Braille" by voice on this page means the current section.
  useEffect(
    () =>
      setBraillePage({
        current: () => (active ? { text: active.text, label: active.heading } : null),
        onTyped: (typed) => {
          const el = document.activeElement;
          if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return false; // the focused field takes it
          const input = brailleInput.current;
          const done = typed.endsWith("\n");
          input.text = applyTyped(input.text, input.text.length, input.text.length, typed.replace(/\n$/, "")).value;
          const asking = input.mode === "question";
          if (asking) setQuestion(input.text);
          else setNoteText(input.text);
          if (done) {
            const text = input.text.trim();
            input.text = "";
            if (text) void (asking ? actions.current.doAsk(text) : actions.current.doSaveNote(text, "braille"));
          } else {
            void showInBraille(`${asking ? "Question" : "Note"}: ${input.text}`, asking ? "your question" : "your note");
          }
          return true;
        },
        onCommand: (dots) => {
          const input = brailleInput.current;
          switch (commandForChord(dots)) {
            case "summarize":
              void actions.current.doSummarize();
              return true;
            case "overview":
              void actions.current.doOverview();
              return true;
            case "question":
              input.mode = "question";
              input.text = "";
              setQuestion("");
              void showInBraille("Question: type it, then Enter.", "ask a question");
              return true;
            case "note":
              input.mode = "note";
              input.text = "";
              void showInBraille("Note: type it, then Enter.", "write a note");
              return true;
            case "read":
              void actions.current.show(true);
              return true;
            default:
              return false; // home, help and unknown chords are handled app-wide
          }
        },
      }),
    [active, showInBraille],
  );

  useEffect(
    () =>
      onReaderEvent((e) => {
        if (e.type === "goto") goto(e.index, false);
        else if (e.type === "caret") setCaret(e.index);
        else if (e.type === "typed") setNoteText((v) => applyTyped(v, v.length, v.length, e.text).value);
        else void show(true);
      }),
    [goto, show],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey || document.body.dataset.brailleCapture) return;
      if (e.key === "j" || e.key === "J") goto(readerState.index + 1);
      else if (e.key === "k" || e.key === "K") goto(readerState.index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goto]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(true);
    setStatus(`${label}...`);
    try {
      await fn();
    } catch (e) {
      const message = `Something went wrong: ${(e as Error).message}`;
      setStatus(message);
      void showInBraille(message, "error");
    } finally {
      setBusy(false);
    }
  };

  // Each action puts its result on the Braille display too, so it can be used from the display alone.
  const doOverview = () =>
    run("Writing the overview", async () => {
      const o = await api.overview(paperId, language);
      setOverview(o);
      setStatus("Overview ready.");
      await showInBraille(`Overview. ${o.overview} Takeaways: ${o.takeaways.join(" ")}`, "overview");
    });

  const doSummarize = () =>
    run("Summarizing this section", async () => {
      if (!active) return;
      const r = await api.summarizeSection(active.id, language);
      setSummary(r.summary);
      setStatus("Summary ready.");
      await showInBraille(`Summary of ${active.heading}. ${r.summary}`, "summary");
    });

  const doAsk = (q: string) =>
    run("Looking for the answer", async () => {
      setQuestion(q);
      const a = await api.ask(paperId, q, language);
      setAnswer(a);
      setStatus(a.answered ? "Answer ready." : "The paper does not answer that.");
      const sources = a.citations.length ? ` Sources: ${a.citations.map((c) => c.heading).join(", ")}.` : "";
      await showInBraille(`Answer. ${a.answer}${sources}`, "the answer");
    });

  const doSaveNote = (text: string, source: NoteSource) =>
    run("Saving the note", async () => {
      if (!active) return;
      await api.createNote({ paper_id: paperId, section_id: active.id, text, source });
      setNoteText("");
      setStatus(`Note saved on ${active.heading}.`);
      await showInBraille(`Note saved on ${active.heading}.`, "note saved");
    });

  const actions = useRef({ doOverview, doSummarize, doAsk, doSaveNote, show });
  actions.current = { doOverview, doSummarize, doAsk, doSaveNote, show };

  if (error)
    return (
      <div className="page">
        <h1>This paper could not be opened</h1>
        <p role="alert">{error}</p>
        <Link href="/">Back to search</Link>
      </div>
    );

  return (
    <div className="page">
      <p role="status" aria-live="polite" className="status">
        {status}
      </p>
      {paper && (
        <header>
          <h1>{paper.title}</h1>
          <p className="muted">
            {paper.authors.slice(0, 6).join(", ")}
            {paper.year ? `, ${paper.year}` : ""} · Braille: {b.info ? b.info.name : "virtual display"} · Code: {table}
          </p>
        </header>
      )}

      {sections.length > 0 && active && (
        <>
          <div className="row" role="group" aria-label="Paper tools" style={{ marginTop: 16 }}>
            <button
              className="btn"
              disabled={busy}
              onClick={() => void doOverview()}
            >
              Overview
            </button>
            <button
              className="btn"
              disabled={busy}
              onClick={() => void doSummarize()}
            >
              Summarize section
            </button>
            <button className="btn" onClick={() => void show(true)}>
              Show in Braille
            </button>
            <button
              className="btn"
              disabled={busy}
              onClick={() =>
                run("Making the BRF file", async () => {
                  const blob = await api.brf(active.heading + "\n\n" + active.text, table);
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = (active.heading.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 40) || "section") + ".brf";
                  a.click();
                  URL.revokeObjectURL(a.href);
                  setStatus("BRF file downloaded.");
                })
              }
            >
              Download section as BRF
            </button>
            <Link className="btn" href={`/notes?paper=${paperId}`}>
              Notes
            </Link>
          </div>

          {overview && (
            <section className="card" aria-labelledby="ov-h" style={{ marginTop: 16 }}>
              <h2 id="ov-h">Overview</h2>
              <p>{overview.overview}</p>
              <ul>
                {overview.takeaways.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </section>
          )}

          <div className="reader-grid">
            <nav aria-label="Sections">
              <h2 className="muted" style={{ fontSize: "0.85rem", margin: "0 0 8px" }}>
                SECTIONS
              </h2>
              <div className="toc">
                {sections.map((s, i) => (
                  <button key={s.id} aria-current={i === index} onClick={() => goto(i)}>
                    {s.heading}
                  </button>
                ))}
              </div>
              <p className="muted" style={{ marginTop: 12 }}>
                <kbd>J</kbd> next · <kbd>K</kbd> previous
              </p>
            </nav>

            <article className="card">
              <div className="row between">
                <span className="muted">
                  Section {index + 1} of {sections.length}
                </span>
                <span className="row">
                  <button className="btn" onClick={() => goto(index - 1)} disabled={index === 0}>
                    Previous
                  </button>
                  <button className="btn" onClick={() => goto(index + 1)} disabled={index === sections.length - 1}>
                    Next
                  </button>
                </span>
              </div>
              <SectionView heading={active.heading} level={active.level} text={active.text} caret={caret} onCaret={setCaret} headingRef={headingRef} />
              {summary && (
                <aside className="card" aria-label="Section summary">
                  <strong>Summary:</strong> {summary}
                </aside>
              )}
            </article>
          </div>

          <section aria-labelledby="ask-h">
            <h2 id="ask-h">Ask about this paper</h2>
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                if (question.trim().length < 3) return;
                void doAsk(question.trim());
              }}
            >
              <label className="sr-only" htmlFor="question">
                Your question
              </label>
              <input id="question" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. What dataset did they use?" />
              <button className="btn primary" disabled={busy}>
                Ask
              </button>
            </form>
            {answer && (
              <div className={`card answer ${answer.answered ? "" : "unanswered"}`} style={{ marginTop: 12 }}>
                <p>{answer.answer}</p>
                {answer.citations.length > 0 && (
                  <p className="muted">
                    Sources:{" "}
                    {answer.citations.map((c, i) => (
                      <button
                        key={c.section_id}
                        className="btn"
                        style={{ marginRight: 6 }}
                        onClick={() => goto(sections.findIndex((s) => s.id === c.section_id))}
                        title={c.quote}
                      >
                        {c.heading}
                        <span className="sr-only"> (go to source {i + 1})</span>
                      </button>
                    ))}
                  </p>
                )}
              </div>
            )}
          </section>

          <section aria-labelledby="note-h">
            <h2 id="note-h">Add a note on this section</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!noteText.trim()) return;
                void doSaveNote(noteText.trim(), "keyboard");
              }}
            >
              <label htmlFor="note" className="sr-only">
                Note
              </label>
              <textarea id="note" rows={3} value={noteText} onChange={(e) => setNoteText(e.target.value)} />
              <button className="btn primary" disabled={busy} style={{ marginTop: 8 }}>
                Save note
              </button>
            </form>
          </section>
        </>
      )}

    </div>
  );
}
