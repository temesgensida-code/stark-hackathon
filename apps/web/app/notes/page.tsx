"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useBraille } from "@/components/braille/BrailleDisplayConnect";
import { useLanguage } from "@/components/braille/AppBrailleProvider";
import { SixKeyInput } from "@/components/reader/SixKeyInput";
import { setBraillePage } from "@/lib/appBus";
import { api, type Note, type NoteSource, type Paper, type SectionOutline } from "@/lib/api/client";

function NotesHub() {
  const b = useBraille();
  const { table, showInBraille } = useLanguage();
  const params = useSearchParams();

  const [papers, setPapers] = useState<Paper[]>([]);
  const [paperId, setPaperId] = useState<number | null>(params.get("paper") ? Number(params.get("paper")) : null);
  const [sections, setSections] = useState<SectionOutline[]>([]);
  const [sectionId, setSectionId] = useState<number | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [text, setText] = useState("");
  const [source, setSource] = useState<NoteSource>("keyboard");
  const [editing, setEditing] = useState<Note | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    api.listPapers().then((p) => {
      setPapers(p);
      if (paperId === null && p.length) setPaperId(p[0].id);
    }).catch(() => setStatus("Could not reach the server."));
  }, [paperId]);

  const load = useCallback(async () => {
    if (paperId === null) return;
    const [n, d] = await Promise.all([api.listNotes(paperId), api.getPaper(paperId)]);
    setNotes(n);
    setSections(d.sections);
  }, [paperId]);
  useEffect(() => {
    void load().catch(() => setStatus("Could not load notes."));
    setSectionId(null);
  }, [load]);

  const heading = (id: number | null) => sections.find((s) => s.id === id)?.heading;

  const braille = async (body: string, label: string) => setStatus(await showInBraille(body, label));

  // "Show in Braille" by voice on this page: the note being written, otherwise all saved notes.
  useEffect(
    () =>
      setBraillePage({
        current: () =>
          text.trim()
            ? { text, label: "the note you are writing" }
            : notes.length
              ? { text: notes.map((n, i) => `${i + 1}. ${n.text}`).join(" "), label: `${notes.length} saved notes` }
              : null,
      }),
    [text, notes],
  );

  const save = async () => {
    if (paperId === null || !text.trim()) return;
    try {
      if (editing) {
        await api.updateNote(editing.id, text.trim());
        setStatus("Note updated.");
        setEditing(null);
      } else {
        await api.createNote({ paper_id: paperId, section_id: sectionId, text: text.trim(), source });
        setStatus("Note saved.");
      }
      setText("");
      setSource("keyboard");
      await load();
    } catch (e) {
      setStatus(`Could not save: ${(e as Error).message}`);
    }
  };

  const remove = async (n: Note) => {
    await api.deleteNote(n.id);
    setStatus("Note deleted.");
    await load();
  };

  return (
    <div className="page">
      <h1>Notes</h1>
      <p className="muted">Type, speak or Braille your notes. Each one is saved with its paper and section.</p>
      <p role="status" aria-live="polite" className="status">
        {status}
      </p>

      {papers.length === 0 ? (
        <p>Open a paper first, then come back to take notes.</p>
      ) : (
        <>
          <div className="row">
            <label htmlFor="paper">Paper</label>
            <select id="paper" value={paperId ?? ""} onChange={(e) => setPaperId(Number(e.target.value))}>
              {papers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
            <label htmlFor="section">Section</label>
            <select id="section" value={sectionId ?? ""} onChange={(e) => setSectionId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Whole paper</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.heading}
                </option>
              ))}
            </select>
          </div>

          <section aria-labelledby="new-h">
            <h2 id="new-h">{editing ? "Edit note" : "New note"}</h2>
            <label htmlFor="text" className="sr-only">
              Note text
            </label>
            <textarea
              id="text"
              rows={5}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                void b.manager.show(e.target.value);
              }}
            />
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn primary" onClick={() => void save()} disabled={!text.trim()}>
                {editing ? "Update note" : "Save note"}
              </button>
              {editing && (
                <button
                  className="btn"
                  onClick={() => {
                    setEditing(null);
                    setText("");
                  }}
                >
                  Cancel
                </button>
              )}
              <button className="btn" onClick={() => void braille(text, "the note you are writing")}>
                Send to Braille display
              </button>
            </div>
            <details style={{ marginTop: 16 }}>
              <summary>Type with six Braille keys on this keyboard</summary>
              <SixKeyInput
                table={table}
                onText={(t) => {
                  setText((x) => x + t);
                  setSource("braille");
                }}
              />
            </details>
          </section>

          <section aria-labelledby="list-h">
            <h2 id="list-h">Saved notes ({notes.length})</h2>
            <ul className="list">
              {notes.map((n) => (
                <li key={n.id} className="card">
                  <p>{n.text}</p>
                  <p className="muted">
                    {heading(n.section_id) ?? "Whole paper"} · typed by {n.source}
                  </p>
                  <div className="row">
                    <button
                      className="btn"
                      onClick={() => {
                        setEditing(n);
                        setText(n.text);
                      }}
                    >
                      Edit
                    </button>
                    <button className="btn" onClick={() => void braille(n.text, `note: ${n.text.slice(0, 40)}`)}>
                      Show in Braille
                    </button>
                    <button className="btn danger" onClick={() => void remove(n)}>
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {paperId !== null && notes.length > 0 && (
              <p className="row">
                <a className="btn" href={api.exportUrl(paperId, "txt")} download="notes.txt">
                  Export as text
                </a>
                <a className="btn" href={api.exportUrl(paperId, "brf")} download="notes.brf">
                  Export as BRF
                </a>
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default function NotesPage() {
  return (
    <Suspense fallback={<p className="page">Loading...</p>}>
      <NotesHub />
    </Suspense>
  );
}
