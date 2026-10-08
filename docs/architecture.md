# Architecture

Full plan: https://claude.ai/code/artifact/55edc9a7-1a12-46ec-b456-f72c4dc8c1d9

```
User (voice + keyboard + Braille display)
  -> apps/web   Next.js, Voxide widget, Braille display drivers
  -> apps/api   FastAPI: braille | papers | documents | ai | notes
       -> Scholarxiv Papers API + MCP   (paper search, full text)
       -> LLM via Scholarxiv Router     (summaries, Q&A with section citations)
       -> Liblouis                      (text <-> Braille, UEB + Amharic)
       -> Postgres + Redis worker       (papers, sections, notes; parsing jobs)
  bridge/       local BrlAPI <-> WebSocket bridge for displays without HID Braille
```

## Module status

| Module | Path | Status |
| --- | --- | --- |
| Braille translation API | `apps/api/app/braille` | Done, tested |
| Braille display drivers (WebHID, bridge, screen reader) | `apps/web/lib/braille`, `bridge/` | Done, tested with simulated displays |
| Braille connect panel | `apps/web/components/braille` | Done; provider mounted in layout, panel on `/settings/braille` |
| Scholarxiv client + paper routes | `apps/api/app/papers` | Done, tested with a fake client; verify the real API |
| PDF / BRF parsing pipeline | `apps/api/app/documents` | Done (PyMuPDF tested; Docling untested) |
| LLM summaries and Q&A | `apps/api/app/ai` | Done, tested with a fake LLM |
| Notes | Done (API and `apps/web/app/notes`) |
| Voice (Voxide) | `apps/web/components/voice` | Done: 10 actions registered; not yet tested by speaking |
| Reader UI, home, API client | `apps/web/app`, `apps/web/components/reader`, `apps/web/lib/api` | Done, rendered against the live backend |

## Why the Braille bridge is not an MCP server

The bridge carries fixed, real-time hardware I/O (routing keys, panning, cell writes) with no AI decision in the loop.
MCP is used where an AI decides what to call: Scholarxiv paper search.

Backend details: [backend-m1.md](backend-m1.md).
Frontend details: [frontend-m2.md](frontend-m2.md).
