# Architecture decisions

Each entry records what we chose, what we rejected, and why. Newest first. Judges read this as part of the ideation trail.

| # | Date | Decision | Rejected alternatives | Why |
| --- | --- | --- | --- | --- |
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
