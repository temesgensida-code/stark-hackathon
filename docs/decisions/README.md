# Architecture decisions

Each entry records what we chose, what we rejected, and why. Newest first. Judges read this as part of the ideation trail.

| # | Date | Decision | Rejected alternatives | Why |
| --- | --- | --- | --- | --- |
| AD-18 | 2026-10-07 | Docker Compose runs the whole stack locally: Postgres, Redis, API, parse worker, web | Running each piece by hand; SQLite only | The same containers go to EthioDeploy. It caught real bugs (shared uploads volume, container DNS) that a local run hid. |
| AD-17 | 2026-10-07 | One language setting (English, Amharic, Afaan Oromoo) picks the Braille code, the AI answer language and the voice language | Separate settings; English-only AI | A user who reads Amharic Braille wants Amharic summaries on the display. Only English is cached; other languages cost one model call each. Afaan Oromoo has no Liblouis table, so it uses UEB Grade 1. |
| AD-16 | 2026-10-07 | No LangGraph and no MCP server of our own | Agent framework; exposing the API as MCP | Every AI feature is one model call, so a graph adds nothing. We use Scholarxiv's MCP and REST as a client only. |
| AD-15 | 2026-10-07 | No login until the demo flow is tested | Accounts from day one | Papers and notes are shared by everyone using the API for now. Per-user ownership is a small change (an owner column) and comes next. |
| AD-14 | 2026-10-07 | Full text comes from the paper's arXiv PDF, parsed by our own parser | Scholarxiv full-text endpoint; Agent API uploads | The Papers API documents no full-text endpoint. Parsing ourselves keeps reading order and headings under our control. |
| AD-13 | 2026-10-07 | Scholarxiv Papers API for search and the Router API for completions | Scholarxiv Agent API (`/api/v1/chat`) | The Agent API runs its own tools and citations, which would replace our parser and our citation check, and we need one controllable completion per feature. |
| AD-12 | 2026-09-24 | The Braille bridge stays a WebSocket interface, not an MCP server | Wrapping the bridge as an MCP server | Display I/O is fixed and real-time (routing, panning, cell writes); no AI decides anything there. MCP is used where an AI chooses tools: Scholarxiv search. |
| AD-11 | 2026-09-23 | Three Braille display paths behind one interface: WebHID, local BrlAPI bridge, screen reader | Native desktop app with vendor drivers; screen reader only | A native app can't be hosted on EthioDeploy or demoed from a URL; screen reader only gives no control of display keys. |
| AD-10 | 2026-09-23 | Repair Amharic back-translation in our API with a reverse map built from Liblouis's `ethio-g1` table | Wait for an upstream fix; English-only Braille input | Liblouis 3.29 returns sixth-order letters and Ethiopic punctuation as ASCII. The fix is small and tested. |
| AD-9 | 2026-09-23 | Liblouis for all Braille translation (UEB Grade 1/2, Ethiopic Grade 1) | Writing our own translator; cloud Braille APIs | Liblouis is the standard used by NVDA, JAWS and BRLTTY, and ships Amharic. |
| AD-8 | 2026-09-23 | Cells are bytes with bit 0 = dot 1 everywhere | Per-transport formats | Same layout as Unicode Braille, HID Braille and BrlAPI, so nothing converts in between. |
| AD-7 | 2026-09-23 | No payments; Links.et not integrated | Freemium plan | Paying would exclude the users we build for; STARK rule 5 applies only if taking payments. |
| AD-6 | 2026-09-23 | Host on EthioDeploy: `web` and `api` services with Postgres and Redis add-ons | Vercel + Render; self-hosted VPS | STARK advantage; push-to-deploy from GitHub; managed database on the same host. |
| AD-5 | 2026-09-23 | LLM through the Scholarxiv Router (OpenAI-compatible), with a direct-provider fallback | Calling one provider directly | Builds on Scholarxiv (rule 1 bonus); same client code works with any provider. |
| AD-4 | 2026-09-23 | Every AI answer cites the section it came from | Free-form answers | Blind users can't skim to check a claim, so wrong answers cost them more. |
| AD-3 | 2026-09-23 | PDF parsing with Docling, PyMuPDF as fallback; prefer arXiv HTML when available | Plain text extraction; LLM vision on page images | Docling keeps reading order across columns and handles tables and formulas; PyMuPDF keeps the deploy small. |
| AD-2 | 2026-09-23 | Voice through Voxide actions (function calling), plus keyboard shortcuts for every action | Custom speech-to-text pipeline; voice-only control | Voxide is required (rule 2) and maps speech straight to app functions; keyboard covers noisy rooms. |
| AD-1 | 2026-09-23 | Next.js frontend + FastAPI backend | Single Next.js app | Voxide's first-class SDK is React; Liblouis, BrlAPI and PDF parsing are best in Python. |
