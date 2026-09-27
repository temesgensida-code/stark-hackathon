# Deploying on EthioDeploy

Docs: https://ethiodeploy.com/docs

Create two services from this repo:

| Service | Root directory | How it builds | Add-ons |
| --- | --- | --- | --- |
| `api` | `apps/api` | Dockerfile (installs Liblouis) | Postgres, Redis |
| `web` | `apps/web` | Next.js auto-detected | none |

Set the variables from `.env.example` in each service's settings panel.
Set `CORS_ORIGINS` on the API to the web service's URL, and whitelist that URL in the Voxide dashboard.

Deploy on day one, then every push to `main` redeploys.
