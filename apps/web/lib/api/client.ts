// Typed fetch wrapper for the FastAPI backend. Calls go to /api/*, which next.config.ts proxies to the API.

const BASE = "/api";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${path}`, init);
  if (!r.ok) {
    let detail = r.statusText;
    try {
      const body = await r.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {}
    throw new ApiError(r.status, detail);
  }
  if (r.status === 204) return undefined as T;
  return (r.headers.get("content-type")?.includes("json") ? r.json() : r.text()) as Promise<T>;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export type Lang = "en" | "am" | "om";
export type PaperStatus = "pending" | "parsing" | "ready" | "failed";
export type NoteSource = "keyboard" | "voice" | "braille";

export interface SearchResult {
  external_id: string;
  title: string;
  authors: string[];
  year: number | null;
  abstract_short: string;
}
export interface Paper {
  id: number;
  title: string;
  authors: string[];
  year: number | null;
  status: PaperStatus;
  source: string;
  abstract: string;
}
export interface SectionOutline {
  id: number;
  order: number;
  heading: string;
  level: number;
}
export interface Section extends SectionOutline {
  text: string;
  html: string;
}
export interface PaperDetail extends Paper {
  sections: SectionOutline[];
}
export interface JobStatus {
  paper_id: number;
  status: PaperStatus;
  progress: number;
  error: string | null;
}
export interface Overview {
  paper_id: number;
  overview: string;
  takeaways: string[];
  cached: boolean;
}
export interface Citation {
  section_id: number;
  heading: string;
  quote: string;
}
export interface Answer {
  answer: string;
  answered: boolean;
  citations: Citation[];
}
export interface Note {
  id: number;
  paper_id: number;
  section_id: number | null;
  text: string;
  source: NoteSource;
  created_at: string;
  updated_at: string;
}

export const api = {
  search: (q: string, limit = 10) => request<SearchResult[]>(`/papers/search?q=${encodeURIComponent(q)}&limit=${limit}`),
  importPaper: (external_id: string) =>
    request<{ paper_id: number; job_id: string }>("/papers/import", json("POST", { external_id })),
  listPapers: () => request<Paper[]>("/papers"),
  getPaper: (id: number) => request<PaperDetail>(`/papers/${id}`),
  listSections: (id: number) => request<Section[]>(`/papers/${id}/sections`),
  deletePaper: (id: number) => request<void>(`/papers/${id}`, { method: "DELETE" }),

  upload: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ paper_id: number; job_id: string }>("/documents", { method: "POST", body: form });
  },
  status: (paperId: number) => request<JobStatus>(`/documents/${paperId}/status`),

  overview: (paper_id: number, lang: Lang = "en") => request<Overview>("/ai/summarize", json("POST", { paper_id, lang })),
  summarizeSection: (section_id: number, lang: Lang = "en") =>
    request<{ section_id: number; summary: string; cached: boolean }>("/ai/summarize", json("POST", { section_id, lang })),
  ask: (paper_id: number, question: string, lang: Lang = "en") =>
    request<Answer>("/ai/ask", json("POST", { paper_id, question, lang })),

  listNotes: (paper_id?: number) => request<Note[]>(`/notes${paper_id ? `?paper_id=${paper_id}` : ""}`),
  createNote: (n: { paper_id: number; section_id?: number | null; text: string; source: NoteSource }) =>
    request<Note>("/notes", json("POST", n)),
  updateNote: (id: number, text: string) => request<Note>(`/notes/${id}`, json("PATCH", { text })),
  deleteNote: (id: number) => request<void>(`/notes/${id}`, { method: "DELETE" }),
  exportUrl: (paper_id: number, format: "txt" | "brf") => `${BASE}/notes/export?paper_id=${paper_id}&format=${format}`,

  /** Download a piece of text as a BRF file. */
  brf: async (text: string, table: string): Promise<Blob> => {
    const r = await fetch(`${BASE}/braille/brf`, json("POST", { text, table }));
    if (!r.ok) throw new ApiError(r.status, "Could not make the BRF file.");
    return r.blob();
  },
  backTranslate: (cells: number[], table: string) =>
    request<{ text: string }>("/braille/back-translate", json("POST", { cells, table })),
};

/** Poll until a paper is parsed; resolves with the final status. */
export async function waitUntilReady(paperId: number, onTick?: (s: JobStatus) => void): Promise<JobStatus> {
  for (;;) {
    const s = await api.status(paperId);
    onTick?.(s);
    if (s.status === "ready" || s.status === "failed") return s;
    await new Promise((r) => setTimeout(r, 1500));
  }
}
