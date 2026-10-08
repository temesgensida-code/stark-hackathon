# STARK Hackathon requirements — how Braille Talks meets them

Source: https://hackathon.stark.et/requirements · judging: https://hackathon.stark.et/challenge

## The six rules

| # | Rule | How we meet it | Evidence | Status |
| --- | --- | --- | --- | --- |
| 1 | Prove your ideation on Scholarxiv | Public Scholarxiv collection of prior work (screen readers and PDFs, Braille displays, Amharic Braille), with a comment on each paper saying what we used or rejected. The product also builds on Scholarxiv: paper search through the Papers API / MCP and LLM calls through the Scholarxiv Router. | [Public collection of 14 papers](https://www.scholarxiv.com/collections/6ac6a53e22182abc8c85e4e1) with a comment on each; `docs/ideation.md`; `docs/decisions/` | Done |
| 2 | Voice interaction through Voxide | Voice is the main way to use the app: search, open, navigate sections, summarize, ask, take notes, send to Braille. English first, Amharic when supported. | `apps/web/components/voice/` | Built: 10 actions, Alt+V to talk, English/Amharic/Afaan Oromoo. Not yet tested by speaking |
| 3 | Host on EthioDeploy (optional, advantage) | Two services (`web`, `api`) plus Postgres and Redis add-ons. | `infra/ethiodeploy.md`; live URL | Dockerfiles and variables ready; deploy needs your account |
| 4 | Build from scratch, on the clock | Repo created during the window; per-member commits; daily STARK changelogs. | GitHub history; `docs/changelog/` | Ongoing |
| 5 | Local payments via Links.et (only if taking payments) | Not applicable: the product is free. | — | N/A |
| 6 | ALX registration (optional) | Team members register on announcement day if not already ALX members. | — | Optional |

## Required deliverables

| Deliverable | Where |
| --- | --- |
| Document trail: problem, rejected approaches, reasons for the final direction | `docs/ideation.md`, `docs/decisions/README.md`, `docs/SRS.md` |
| Repository with commit history from the event | This repo |
| Running product (not a slide deck) | EthioDeploy URL (final submission) |

## Judging criteria

| Criterion | What we show |
| --- | --- |
| Ideation | A real, specific gap: blind researchers can't read multi-column papers or use Braille displays with research tools. Prior work reviewed on Scholarxiv. |
| Implementation strategy | Clear architecture, SRS with prioritized requirements, tested Braille core already in place. |
| Teamwork | Three members with separate ownership (see below), visible in commits. |
| Creativity | Two-way Braille display integration in the browser, Amharic Braille repair, voice plus tactile reading. |
| Building under pressure | Daily changelogs; must-have scope that fits the window, with a written cut list. |

## Team ownership (3 members)

| Area | Owns |
| --- | --- |
| Member 1 — Backend and AI | `apps/api` papers, documents, ai, notes; Scholarxiv; EthioDeploy |
| Member 2 — Frontend and voice | `apps/web` pages, reader, Voxide actions, accessibility testing |
| Member 3 — Braille and hardware | `apps/api/app/braille`, `apps/web/lib/braille`, `bridge/`, display testing, docs and changelogs |
