"use client";

import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLanguage } from "@/components/braille/AppBrailleProvider";
import { api, type Paper, type SearchResult } from "@/lib/api/client";
import { lastSearch, setBraillePage } from "@/lib/appBus";
import { applyTyped } from "@/lib/braille/typing";

/** One item the Braille display can step through: a search result or one of your papers. */
interface Item {
  title: string;
  detail: string;
  open(): Promise<void>;
}

const PROMPT = "Search papers: type with the Braille keys, then Enter. Enter alone lists your papers.";

function Home() {
  const router = useRouter();
  const params = useSearchParams();
  const initialQuery = params.get("q") ?? "";
  const { showInBraille } = useLanguage();

  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  // What the Braille display is stepping through, and where it is.
  const items = useRef<Item[]>([]);
  const index = useRef(0);
  const queryRef = useRef(query);
  queryRef.current = query;

  const say = useCallback(
    async (text: string, label: string) => {
      setStatus(text);
      await showInBraille(text, label);
    },
    [showInBraille],
  );

  const showItem = useCallback(
    (i: number) => {
      const list = items.current;
      if (!list.length) return;
      index.current = Math.max(0, Math.min(list.length - 1, i));
      const it = list[index.current];
      void say(`${index.current + 1} of ${list.length}. ${it.title}. ${it.detail}`, `result ${index.current + 1} of ${list.length}`);
    },
    [say],
  );

  const refresh = useCallback(() => {
    api.listPapers().then(setPapers).catch(() => setStatus("Could not reach the server. Is the API running?"));
  }, []);
  useEffect(refresh, [refresh]);

  const open = useCallback(
    async (r: SearchResult) => {
      setBusy(true);
      setStatus(`Opening ${r.title}...`);
      try {
        const { paper_id } = await api.importPaper(r.external_id);
        router.push(`/papers/${paper_id}`);
      } catch (e) {
        setStatus(`Could not open the paper: ${(e as Error).message}`);
        setBusy(false);
      }
    },
    [router],
  );

  const search = useCallback(
    async (q: string) => {
      if (q.trim().length < 2) return;
      setBusy(true);
      setStatus(`Searching for ${q}...`);
      try {
        const r = await api.search(q.trim(), 10);
        setResults(r);
        lastSearch.length = 0;
        lastSearch.push(...r.map((x) => ({ external_id: x.external_id, title: x.title })));
        items.current = r.map((x) => ({
          title: x.title,
          detail: `${x.authors.slice(0, 2).join(", ")}${x.year ? `, ${x.year}` : ""}. ${x.abstract_short}`,
          open: () => open(x),
        }));
        if (r.length) {
          setStatus(`${r.length} papers found.`);
          showItem(0);
        } else {
          void say(`No papers found for ${q}. Type a new search.`, "no results");
        }
      } catch (e) {
        setStatus(`Search failed: ${(e as Error).message}`);
      } finally {
        setBusy(false);
      }
    },
    [open, say, showItem],
  );

  const listMine = useCallback(async () => {
    const mine = await api.listPapers().catch(() => [] as Paper[]);
    setPapers(mine);
    items.current = mine.map((p) => ({
      title: p.title,
      detail: p.status === "ready" ? "Ready to read." : `Status: ${p.status}.`,
      open: async () => router.push(`/papers/${p.id}`),
    }));
    if (mine.length) showItem(0);
    else void say("You have no papers yet. Type a search, then Enter.", "no papers");
  }, [router, say, showItem]);

  // The Braille display drives this page: type a search, Enter to run it, pan or rocker to move
  // through the results, routing key to open one.
  useEffect(
    () =>
      setBraillePage({
        current: () => {
          const it = items.current[index.current];
          return it
            ? { text: `${index.current + 1} of ${items.current.length}. ${it.title}. ${it.detail}`, label: "the selected result" }
            : { text: PROMPT, label: "search" };
        },
        onTyped: (typed) => {
          if (typed.endsWith("\n")) {
            const q = (queryRef.current + typed).trim();
            setQuery(q);
            if (q) void search(q);
            else void listMine();
            return true;
          }
          const next = applyTyped(queryRef.current, queryRef.current.length, queryRef.current.length, typed).value;
          setQuery(next);
          items.current = [];
          void say(`Search: ${next}`, "your search");
          return true;
        },
        onNavigate: (dir) => {
          if (!items.current.length) return void say(PROMPT, "search");
          const last = items.current.length - 1;
          if (dir === "next" && index.current === last) return void setStatus("That was the last result.");
          if (dir === "previous" && index.current === 0) return void setStatus("That was the first result.");
          showItem(index.current + (dir === "next" ? 1 : -1));
        },
        onRoute: () => {
          const it = items.current[index.current];
          if (it) void it.open();
        },
      }),
    [listMine, say, search, showItem],
  );

  // Put the search prompt on the display when the page opens.
  useEffect(() => {
    if (!initialQuery) void showInBraille(PROMPT, "search");
    // run once on open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A voice search lands here as /?q=...; run it so the screen and display match what was spoken.
  useEffect(() => {
    if (initialQuery) {
      setQuery(initialQuery);
      void search(initialQuery);
    }
  }, [initialQuery, search]);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setStatus(`Uploading ${file.name}...`);
    try {
      const { paper_id } = await api.upload(file);
      router.push(`/papers/${paper_id}`);
    } catch (e) {
      setStatus(`Upload failed: ${(e as Error).message}`);
      setBusy(false);
    }
  };

  const remove = async (p: Paper) => {
    if (!confirm(`Delete "${p.title}" and its notes?`)) return;
    await api.deletePaper(p.id);
    setStatus(`Deleted ${p.title}.`);
    refresh();
  };

  return (
    <div className="page">
      <h1>Find and read research papers</h1>
      <p className="muted">
        Search with your Braille display, by voice (Alt+V), or with the keyboard. Every paper can be read on a Braille display or by
        screen reader.
      </p>
      <details className="card" style={{ marginTop: 12 }}>
        <summary>How to search with a Braille display</summary>
        <ul style={{ marginTop: 8, paddingLeft: 20 }}>
          <li>Type your search on the Braille keys, then press Enter (dot 8 on most displays).</li>
          <li>Enter with nothing typed lists the papers you already have.</li>
          <li>Pan or use the rocker to move between results. Each result shows on the display.</li>
          <li>Press any routing key to open the result on the display.</li>
        </ul>
      </details>

      <p role="status" aria-live="polite" className="status">
        {status}
      </p>

      <form
        role="search"
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          void search(query);
        }}
      >
        <label htmlFor="q" className="sr-only">
          Search papers
        </label>
        <input id="q" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search papers, e.g. screen readers and PDFs" />
        <button className="btn primary" disabled={busy || query.trim().length < 2}>
          Search
        </button>
      </form>

      {results.length > 0 && (
        <section aria-labelledby="results-h">
          <h2 id="results-h">Search results</h2>
          <ol className="list">
            {results.map((r) => (
              <li key={r.external_id} className="card">
                <h3>{r.title}</h3>
                <p className="muted">
                  {r.authors.slice(0, 3).join(", ")}
                  {r.authors.length > 3 ? " and others" : ""}
                  {r.year ? `, ${r.year}` : ""}
                </p>
                <p>{r.abstract_short}</p>
                <button className="btn" disabled={busy} onClick={() => void open(r)} aria-label={`Open ${r.title}`}>
                  Open
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section aria-labelledby="upload-h">
        <h2 id="upload-h">Upload a paper</h2>
        <label htmlFor="file" className="muted">
          PDF with a text layer, or a BRF Braille file (up to 25 MB)
        </label>
        <input id="file" type="file" accept=".pdf,.brf" disabled={busy} onChange={(e) => void upload(e.target.files?.[0])} />
      </section>

      <section aria-labelledby="mine-h">
        <h2 id="mine-h">Your papers</h2>
        {papers.length === 0 ? (
          <p className="muted">Nothing here yet. Search or upload to start.</p>
        ) : (
          <ul className="list">
            {papers.map((p) => (
              <li key={p.id} className="card row between">
                <div>
                  <Link href={`/papers/${p.id}`}>
                    <strong>{p.title}</strong>
                  </Link>
                  <p className="muted">
                    {p.source === "upload" ? "Uploaded" : "Scholarxiv"}
                    {p.year ? `, ${p.year}` : ""} · {p.status}
                  </p>
                </div>
                <button className="btn danger" onClick={() => void remove(p)} aria-label={`Delete ${p.title}`}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<p className="page">Loading...</p>}>
      <Home />
    </Suspense>
  );
}
