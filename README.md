# Braille Talks

An AI research assistant for blind and visually impaired researchers: search, read, take notes on and publish academic papers by voice and refreshable Braille display.

Built for the STARK Hackathon (Sep 9 - Oct 2, 2026). This is the idea-stage package: documents plus starter code. Modules marked [placeholder] are built for the final submission.

## Repository layout

```
apps/
  api/                  FastAPI backend (Python 3.12)
    app/
      main.py           entry point
      braille/          Liblouis translation, back-translation, BRF export   [done]
      papers/           Scholarxiv search and paper routes                   [placeholder]
      documents/        PDF / BRF upload and parsing pipeline                [placeholder]
      ai/               summaries and Q&A with section citations             [placeholder]
      notes/            notes by keyboard, voice or Braille                  [placeholder]
      core/             settings and database                                [placeholder]
    tests/
    Dockerfile          installs Liblouis; used by EthioDeploy
  web/                  Next.js frontend
    app/                pages: home, papers/[id] reader, notes, settings/braille
    components/
      braille/          Braille display connect panel                        [done]
      voice/            Voxide voice assistant                               [placeholder]
      reader/           section view, six-key Braille input                  [placeholder]
    lib/
      braille/          WebHID, bridge and screen-reader display drivers     [done]
      api/              backend client                                       [placeholder]
    tests/
bridge/                 local BrlAPI <-> WebSocket bridge for Braille displays [done]
docs/
  architecture.md       system overview and module status
  braille-display.md    how users connect a Braille display, key map
  SRS.md                software requirements specification
  STARK-requirements.md how each hackathon rule and judging criterion is met
  decisions/            architecture decisions (AD-1 to AD-12)
  ideation.md           problem, prior work, rejected approaches
  changelog/            STARK changelog template
infra/
  ethiodeploy.md        deployment steps
docker-compose.yml      local Postgres + Redis + API
.env.example            all environment variables
```

## Run locally

```bash
cp .env.example .env

# API
sudo apt install liblouis-data python3-louis
cd apps/api && pip install -r requirements.txt -r requirements-dev.txt
uvicorn app.main:app --reload            # http://localhost:8000/docs

# Web
cd apps/web && npm install && npm run dev   # http://localhost:3000

# Braille bridge (optional; --mock needs no hardware)
cd bridge && pip install -r requirements.txt && python3 braille_bridge.py --mock
```

## Tests

```bash
cd apps/api && pytest -q          # 7 tests
cd bridge && pytest -q            # 12 tests
cd apps/web && npm run typecheck && npm test   # 12 tests (starts the API and bridge)
```

## Team conventions

- Branch per feature, small PRs, every member commits from their own account.
- Record decisions in `docs/decisions/README.md`; post a STARK changelog daily from `docs/changelog/TEMPLATE.md`.
