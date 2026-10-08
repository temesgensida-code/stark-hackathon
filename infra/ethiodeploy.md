# Deploying on EthioDeploy

Docs: https://ethiodeploy.com/docs

The whole stack already runs locally with `docker compose up -d --build`; EthioDeploy needs the same pieces. Nothing here has been deployed yet, so treat the steps as a checklist to confirm against the EthioDeploy docs.

## Services

| Service | Root directory | Builds from | Add-ons | Command |
| --- | --- | --- | --- | --- |
| `api` | `apps/api` | `Dockerfile` (installs Liblouis) | Postgres, Redis | default (`uvicorn`, honours `$PORT`) |
| `worker` | `apps/api` | same image | same Postgres and Redis | `python -m app.worker` |
| `web` | `apps/web` | `Dockerfile` (Next.js standalone) | none | default (`node server.js`, port 3000) |

If EthioDeploy cannot run a second service from the same image, or cannot share a disk between `api` and `worker`, run only `api` with `JOB_BACKEND=inline`. Parsing then happens inside the API process, and no worker, Redis or shared uploads folder is needed.

## Variables

**api and worker** (see `.env.example`)

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Postgres add-on URL, in the form `postgresql+psycopg://user:pass@host:5432/db` |
| `REDIS_URL` | Redis add-on URL (not needed with `JOB_BACKEND=inline`) |
| `JOB_BACKEND` | `rq` with a worker, otherwise `inline` |
| `UPLOAD_DIR` | A folder the API (and worker) can write to; shared between them when using `rq` |
| `SCHOLARXIV_API_KEY` | your `sxv_` key (also used for the Router when `LLM_API_KEY` is empty) |
| `SCHOLARXIV_API_URL` | `https://www.scholarxiv.com/api/v1` (use `www`: the bare domain redirects and drops the auth header) |
| `LLM_BASE_URL` | `https://www.scholarxiv.com/api/v1/router` |
| `CORS_ORIGINS` | not needed by the browser (it only calls the web service), but set it to the web URL if the API is called directly |

**web: build arguments** (they are compiled into the build, so changing them needs a rebuild)

| Argument | Value |
| --- | --- |
| `API_INTERNAL_URL` | URL the web service uses to reach the API, for example `http://api:8000` or the API's internal address |
| `NEXT_PUBLIC_VOXIDE_PUBLIC_KEY` | your `vox_pub_` key |

## Voxide

Add the deployed web URL to the project's domain whitelist in the Voxide dashboard. Otherwise the widget says "Assistant unavailable". The free tier allows 5 sessions and 1 domain, so avoid burning sessions on testing.

## Known limits

- The browser only talks to the web service (`/api/*` is proxied to the API). Next.js rewrites do not proxy WebSockets, so the optional multi-client simulator (`/braille/simulate`) works only when the browser can reach the API directly. The default in-memory virtual display needs no WebSocket.
- Parsing a paper downloads its PDF from arXiv, which can take over a minute.
- No login yet; everyone using a deployment shares the same papers and notes.

Deploy on day one, then every push to `main` redeploys.
