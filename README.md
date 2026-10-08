# Braille Talks

An AI research assistant for blind and visually impaired researchers: search, read, take notes on and publish academic papers by voice and refreshable Braille display.

Built for the STARK Hackathon (Sep 9 - Oct 2, 2026).  All modules below are built; see docs/backend-m1.md and docs/frontend-m2.md for what is verified.

## Repository layout

```
apps/
  api/                  FastAPI backend (Python 3.12)
    app/
      main.py           entry point
      braille/          Liblouis translation, back-translation, BRF export   [done]
      papers/           Scholarxiv search and paper routes                   [done]
      documents/        PDF / BRF upload and parsing pipeline                [done]
      ai/               summaries and Q&A with section citations             [done]
      notes/            notes by keyboard, voice or Braille                  [done]
      core/             settings and database                                [done]
    tests/
    Dockerfile          installs Liblouis; used by EthioDeploy
  web/                  Next.js frontend
    app/                pages: home, papers/[id] reader, notes, settings/braille
    components/
      braille/          Braille display connect panel                        [done]
      voice/            Voxide voice assistant                               [done]
      reader/           section view, six-key Braille input                  [done]
    lib/
      braille/          WebHID, bridge and screen-reader display drivers     [done]
      api/              backend client                                       [done]
    tests/
bridge/                 local BrlAPI <-> WebSocket bridge for Braille displays [done]
docs/
  architecture.md       system overview and module status
  braille-display.md    how users connect a Braille display, key map
  manual-testing.md     what to check by hand before a demo (voice, screen reader, Braille)
  demo-script.md        the 3-minute demo, no hardware needed
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

Fastest path (Docker for Postgres, Redis, API and parse worker, then the web app):

```bash
cp .env.example .env            # add SCHOLARXIV_API_KEY; put the NEXT_PUBLIC_* lines in apps/web/.env.local too
docker compose up -d --build    # API on http://localhost:8000/docs, web on http://localhost:3000
# For web development instead of the web container: cd apps/web && npm install && npm run dev
```

Without Docker:

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
