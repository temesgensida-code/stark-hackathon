# Backend (Member 1): what was built

Scope: the `papers`, `documents`, `ai`, `notes` and `core` modules of `apps/api`, which were placeholders. The `braille` module (Member 3) is unchanged.

## Stack

| Concern | Choice |
| --- | --- |
| API | FastAPI, Pydantic v2 |
| Database | SQLAlchemy 2. Postgres in production (`DATABASE_URL`), SQLite by default for local runs and tests |
| Jobs | PDF parsing runs as a FastAPI background task (`JOB_BACKEND=inline`, default) or on a Redis + RQ worker (`JOB_BACKEND=rq`, what `docker-compose` uses) |
| PDF parsing | Docling if installed, otherwise PyMuPDF (AD-3) |
| Paper search | Scholarxiv Papers API (`https://www.scholarxiv.com/api/v1`) over `httpx` |
| LLM | Scholarxiv Router API (`/api/v1/router/chat/completions` on `www.scholarxiv.com`, OpenAI-compatible) over `httpx`: one chat call per feature, no agent framework (AD-5). The same `sxv_` key serves both APIs |

Tables are created on startup (`init_db()` in `app/main.py`). Add Alembic once the schema starts changing after deployment.

## Data model (`app/core/db.py`)

- **Paper**: source (`scholarxiv` or `upload`), title, authors, year, abstract, `status` (`pending`, `parsing`, `ready`, `failed`), `progress`, `error`, cached `overview`.
- **Section**: `order`, `heading`, `level`, `text`, `html` (semantic HTML), cached `summary`.
- **Note**: `paper_id`, optional `section_id`, `text`, `source` (`keyboard`, `voice`, `braille`).

Deleting a paper deletes its sections and notes.

## Endpoints

| Method | Path | What it does |
| --- | --- | --- |
| GET | `/papers/search?q=&limit=` | Scholarxiv search. Returns `external_id, title, authors, year, abstract_short` (first sentence, for reading aloud) |
| POST | `/papers/import` `{external_id}` | Fetch metadata (arXiv id such as `2401.01234v1`), then download the arXiv PDF and parse it with our parser. Returns `{paper_id, job_id}` (202). Importing the same paper twice reuses it |
| GET | `/papers` | List papers |
| GET | `/papers/{id}` | Metadata plus the section outline (no text) |
| GET | `/papers/{id}/sections` | All sections with `text` and `html` |
| GET | `/papers/{id}/sections/{sid}` | One section plus `has_previous` / `has_next` for "next section" |
| DELETE | `/papers/{id}` | Delete a paper with its sections and notes |
| POST | `/documents` | Multipart upload of `.pdf` or `.brf`. Returns `{paper_id, job_id}` (202) |
| GET | `/documents/{paper_id}/status` | `{status, progress, error}`. The frontend polls this |
| POST | `/ai/summarize` | `{section_id}` returns a 2-4 sentence summary. `{paper_id}` returns `{overview, takeaways}`. Optional `lang`: `en` (default), `am` or `om`. English is cached; other languages cost one model call each |
| POST | `/ai/ask` | `{paper_id, question, lang?}` returns `{answer, answered, citations:[{section_id, heading, quote}]}` |
| GET/POST | `/notes` | List (filter by `paper_id`, `section_id`) and create |
| GET/PATCH/DELETE | `/notes/{id}` | Read, edit, delete |
| GET | `/notes/export?paper_id=&format=txt\|brf` | Notes with the section each one is about. BRF uses `braille.service.to_brf` |

Use `/documents/{paper_id}/status` for polling. With `JOB_BACKEND=rq` the `job_id` is the RQ job id and differs from the paper id.

## How the main flows work

**Upload a PDF.** `POST /documents` checks the extension, size (`MAX_UPLOAD_MB`, default 25) and the `%PDF` header, saves the file under `UPLOAD_DIR`, creates a `Paper` and starts the parse job. `documents/pipeline.py: run_parse` sets `parsing`, parses, stores ordered sections with semantic HTML, then sets `ready`. Any failure sets `failed` and puts a readable message in `error`, for example a scanned PDF with no text layer.

**Reading order.** The PyMuPDF fallback reads the left column, then the right column, and treats full-width blocks as dividers. It finds headings by font size, bold text, numbered headings (`2.1 Methods`) and known names (Abstract, Methods...). Docling is tried first when installed.

**Summaries.** Created on first request and stored on the row, so the second request is instant (NFR-4). Papers become readable as soon as parsing ends; nothing waits for the LLM.

**Questions and citations (AD-4).** The model gets every section tagged with its id and must return JSON. The route then removes any citation whose section id does not exist in that paper. If the model says "answered" but no valid citation is left, the route changes the result to `answered: false` with a plain "I could not find a section that clearly answers that" message. A wrong answer with a made-up source never reaches the user.

**Degrading gracefully (NFR-6).** If Scholarxiv or the LLM is down, those routes return 503 with a message. Uploads, reading, notes and all Braille routes keep working.

## Configuration

New variables are in `.env.example`: `SCHOLARXIV_API_URL`, `JOB_BACKEND`, `UPLOAD_DIR`. Existing ones (`DATABASE_URL`, `REDIS_URL`, `SCHOLARXIV_API_KEY`, `LLM_*`) are now read by `app/core/config.py`.

## Run it

```bash
cd apps/api
pip install -r requirements.txt -r requirements-dev.txt
uvicorn app.main:app --reload        # needs no Postgres or Redis; uses SQLite and inline jobs
pytest -q
```

With Docker (recommended; it also provides Liblouis):

```bash
docker compose up -d --build          # Postgres, Redis, API on :8000, parse worker
docker compose logs -f api worker
docker compose run --rm --no-deps api sh -c "pip install -r requirements-dev.txt && python -m pytest -q"   # all 48 tests
```

The API and worker share the `uploads` volume: the API saves the PDF and the worker parses it.

## Tests

21 new tests in `apps/api/tests` (`test_notes`, `test_papers`, `test_documents`, `test_ai`). They use an in-memory database, a generated two-column PDF, and fake Scholarxiv and LLM calls, so they need no network or API keys. The `data_client` fixture builds an app from the four routers only, so these tests run without Liblouis installed.

## Verified live (2026-10-07, Docker + real Scholarxiv key)

- Postgres stores papers, sections and notes. The Redis worker parsed both an imported Scholarxiv paper (TapNav, 30 sections) and an uploaded PDF ("Attention Is All You Need": Abstract, numbered sections 1-7, References).
- Router completions: paper overview, section summary, and Q&A with section citations; an off-topic question returns `answered: false`.
- Liblouis in the container: translate and back-translate round-trip "Hello world"; notes export as BRF.
- All 48 API tests pass in the container (backend, Braille, BRF export and import round trips for English and Amharic, Afaan Oromoo round trips, and the language option).
- Amharic and Afaan Oromoo summaries and answers were generated by the real Router. Amharic reads as proper Ethiopic text and round-trips through Braille except for one letter pair (ቋ and ቇ share cells in Liblouis's table). Afaan Oromoo output is weak: it mixes in English terms and needs a native speaker's review.

## Not verified yet (read before relying on it)

- **Scholarxiv Papers API.** Checked against the public docs on 2026-10-06: base URL (use `www.`: the bare domain redirects and drops the auth header), Bearer auth, `GET /papers/search`, the `{data, pagination}` envelope and the paper fields are as documented. Still unconfirmed with a real key: the POST `id` filter used by `get_paper`, and whether the arXiv PDF download works from your server. Run `python -m scripts.check_scholarxiv` to test all three calls.
- **No full-text endpoint.** The docs list none, so full text is the paper's arXiv `pdfLink`, parsed by us. If the download or parse fails the paper opens with its abstract only and `error` says so.
- **Router API.** The docs show `POST /api/v1/router/chat/completions` (OpenAI-compatible, `model: auto`) with an `x-api-key` header; we send both `x-api-key` and `Bearer`. The docs we could read do not show the exact request schema (for example `response_format`), so the first real call may need adjusting in `app/ai/llm.py`.
- **Agent API not used.** Scholarxiv also offers `POST /api/v1/chat` (a server-side research agent with its own PDF upload and citations). We chose not to use it: it would replace our parser and our citation check, and we want one controllable completion per feature.
- **Docling** was not installed or run; only the PyMuPDF path is tested. Check Docling output on a real paper before relying on it, and note it makes the Docker image much larger.
- **BRF upload** (`parse_brf`) has no test yet (BRF *export* was checked in Docker). It should be tried with a file exported from `/braille/brf`.
- **LLM calls** are tested only with fakes. Check the real Router: the `response_format: json_object` option and `model: auto` may behave differently.
- **No authentication.** Papers and notes are shared by everyone using the API. Fine for a demo; NFR-8 (privacy per user) needs accounts or a session key.
- **Scanned PDFs** are rejected with a clear error (no OCR).
- Very long papers are cut to about 60,000 characters in a prompt. There is no retrieval step yet.
