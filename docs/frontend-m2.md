# Frontend and voice (Member 2): what was built

Scope: the `apps/web` pages, reader, notes, API client and Voxide voice layer. The Braille display code in `lib/braille`, `components/braille` and `bridge/` (Member 3) is unchanged.

## How the web app talks to the backend

The browser only calls its own origin: `/api/*`. `next.config.ts` proxies that to FastAPI (`API_INTERNAL_URL`, falling back to `NEXT_PUBLIC_API_URL`, default `http://localhost:8000`). There is no CORS to configure, and the existing Braille code (`BrailleProvider apiBase="/api"`) works unchanged because it already used `/api`.

`lib/api/client.ts` is the typed client for every backend route (search, import, upload, status polling, sections, summaries, Q&A, notes, export, back-translation). Errors surface as `ApiError` with the server's message.

## Pages

| Page | What it does |
| --- | --- |
| `/` | Search Scholarxiv (button or `?q=` from a voice search), upload a PDF or BRF, list and delete your papers. Opening a paper goes to the reader |
| `/papers/[id]` | Waits for parsing (with progress), then shows the table of contents and one section at a time. Overview, section summary, "Ask about this paper" with source buttons that jump to the cited section, "Show in Braille", and a note box for the current section |
| `/notes` | Pick a paper and section, write, edit, delete and list notes, send any note to the Braille display, export as text or BRF, and type with six keys |
| `/settings/braille` | Unchanged (Member 3) |

Keyboard: **J** and **K** move between sections (ignored while typing in a field). Moving focuses the section heading and announces "Section 3 of 30: Methods" in a live region.

## Reader and Braille

- The current section text goes to the Braille display through the existing `BrailleManager.show(text, caret)`.
- A visible caret mirrors the display. Clicking text or pressing a routing key on the virtual display moves it. `components/reader/SectionView.tsx` renders a real heading, one paragraph per `<p>`, and the caret.
- The virtual 40-cell display is a collapsible dock at the bottom of the reader.

## Voice (Voxide)

`components/voice/VoiceAssistant.tsx` registers these actions with `@voxide/react` and mounts the widget in `app/layout.tsx`:

| Say | Action |
| --- | --- |
| "Find papers on X" | `searchPapers` (reads the top 5, shows them on the home page) |
| "Open number 2" | `openPaper` (imports and opens it) |
| "Give me the overview" | `paperOverview` |
| "Next / previous section", "Go to section 5" | `nextSection`, `previousSection`, `goToSection` |
| "Read this section" | `readSection` |
| "Summarize this section" | `summarizeSection` |
| "What dataset did they use?" | `askPaper` (answers, then jumps to the first cited section) |
| "Add a note: ..." | `addNote` (saved with source `voice`) |
| "Show this in Braille" | `showInBraille` |

Handlers return short plain data because Voxide speaks what they return. The reader publishes the open paper and section through `lib/voice/readerBus.ts`, and voice commands move the reader through events on the same bus. `ai.bindState` gives the agent the open paper and section.

If `NEXT_PUBLIC_VOXIDE_PUBLIC_KEY` is missing, a small notice appears instead of the widget; the rest of the app works without it.

## Six-key input

`components/reader/SixKeyInput.tsx`: F D S are dots 1 2 3, J K L are dots 4 5 6. Press a cell's keys together and release to enter it, Space sends the word to `/braille/back-translate` and appends the text, Backspace deletes a cell. Notes typed this way are saved with source `braille`.

## Language

A picker in the header (English, Amharic, Afaan Oromoo) sets the Braille code, the language of AI summaries and answers, and the Voxide voice language at once, and is remembered in the browser. Voice questions can also name a language for one answer. Details of the Braille side are in [braille-display.md](braille-display.md).

## Push-to-talk

`Alt+V` starts and stops listening (Voxide `ui.hotkeyActivate`, a toggle), so the assistant never speaks over a screen reader unasked (FR-15). The widget title shows the shortcut.

## Accessibility

Skip link, labelled controls, `role="status"` live regions for every state change, visible focus ring, `lang` set, one `<h1>` per page, a dark theme with enough contrast, and a layout that works at narrow widths. `npm run e2e` runs axe-core (WCAG 2 A and AA, 2.1 AA, 2.2 AA) on the home, reader, notes and Braille settings pages and fails on any serious or critical violation. It found and fixed color-contrast problems on the primary button and in the display simulator. A test with a real screen reader is still to do.

## Run it

Backend first (`docker compose up -d --build` from the repo root), then:

```bash
cd apps/web
npm install
# NEXT_PUBLIC_API_URL and NEXT_PUBLIC_VOXIDE_PUBLIC_KEY go in apps/web/.env.local (gitignored)
npm run dev          # http://localhost:3000
npm run typecheck && npm run build
```

## Verified

- `tsc --noEmit` and `next build` pass; the web app also builds and runs as a Docker container (`docker compose up -d --build`).
- `npm run e2e`: 10 browser tests pass against the containerized stack: axe on four pages, a routing key moves the caret, a rocker key changes the section, a chord plus Space types into the note, the J/K guard, language persistence, and BRF download.
- Web unit tests: 17 of 21 pass on this Windows machine. The other 4 start a local Python API or bridge and need Liblouis; the same Liblouis-backed behavior is covered by the API tests in Docker.
- A headless browser rendered the pages with live data, and the `/api` proxy returns the API's JSON.

## Not verified yet

- **Voice end to end.** The widget loads and the actions are registered, but nobody has spoken to it yet.
- **Real Braille hardware.** Only the virtual display was used; WebHID and the bridge are tested with simulated displays.
- **Screen reader testing** with NVDA, JAWS or VoiceOver.
- **The EthioDeploy deploy.** The Dockerfile and variables are ready ([infra/ethiodeploy.md](../infra/ethiodeploy.md)); the deploy itself needs your account.
- **Environment.** `node_modules` was corrupted on this disk (Windows error 1392), so the old folder was renamed to `apps/web/node_modules.corrupt-1392` (gitignored) and dependencies were reinstalled. Delete it after running `chkdsk` as administrator.
