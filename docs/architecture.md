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
| Braille connect panel | `apps/web/components/braille` | Done, not yet mounted in layout |
| Scholarxiv client + paper routes | `apps/api/app/papers` | Placeholder |
| PDF / BRF parsing pipeline | `apps/api/app/documents` | Placeholder |
| LLM summaries and Q&A | `apps/api/app/ai` | Placeholder |
| Notes | `apps/api/app/notes`, `apps/web/app/notes` | Placeholder |
| Voice (Voxide) | `apps/web/components/voice` | Placeholder |
| Reader UI | `apps/web/app/papers/[id]`, `apps/web/components/reader` | Placeholder |

## Why the Braille bridge is not an MCP server

The bridge carries fixed, real-time hardware I/O (routing keys, panning, cell writes) with no AI decision in the loop.
MCP is used where an AI decides what to call: Scholarxiv paper search.
