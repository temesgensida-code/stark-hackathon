# Manual testing guide

Use this before a demo or a release. Automated tests cover the code (`pytest`, `npm test`, `npm run e2e`); this guide covers what only a person can judge: voice, real screen readers, real Braille, and whether it feels right.

Record each result as **Pass**, **Fail** (with what you saw) or **Skip** (with why). A tester who is blind or low-vision should run sections 5 to 7 if at all possible. Their findings outrank everything else here.

## 0. Setup

| What | How |
| --- | --- |
| Stack | Start Docker Desktop first (it is not set to start with Windows). Then from the repo root: `docker compose up -d --build`. Check `docker compose ps`: `api`, `worker`, `web`, `db`, `redis` all Up. They restart by themselves whenever Docker comes back |
| Keys | `.env` has `SCHOLARXIV_API_KEY`; the Voxide key is in `.env` (and the web container is built with it) |
| Browser | Chrome or Edge (WebHID needs Chromium). Allow the microphone for `localhost:3000` |
| Open | http://localhost:3000. API docs at http://localhost:8000/docs |
| Check | `curl localhost:8000/health` returns `{"status":"ok"}` and `python -m scripts.check_scholarxiv` (in `apps/api`) prints three OK lines |

Papers take time to prepare: an arXiv PDF can take over a minute to download. Use these for the tests:
- **Search paper:** search "screen readers" and open any result, or use `2510.14267v2` (TapNav, 30 sections).
- **Upload paper:** any PDF with a text layer, ideally two columns with numbered headings.

## 1. Smoke test (5 minutes)

| # | Do | Expect |
| --- | --- | --- |
| 1.1 | Open the home page | Heading "Find and read research papers", search box, upload, "Your papers" |
| 1.2 | Search "screen readers", press Search | "N papers found." appears; each result has title, authors, one sentence, an Open button |
| 1.3 | Press Open on a result | The reader opens and shows "Preparing the paper... N%", then the title and sections |
| 1.4 | Press Next a few times | Section changes; the status line says "Section 3 of 30: ..." |
| 1.5 | Press Overview, then Summarize section | A readable overview with takeaways; a 2 to 4 sentence summary |
| 1.6 | Ask "What problem does this paper address?" | An answer with source buttons; pressing one jumps to that section |
| 1.7 | Save a note on a section | "Note saved on ..." |
| 1.8 | Open Notes | The note is listed with its section |

If any of these fail, stop and fix before testing the rest.

## 2. Papers and uploads

| # | Do | Expect |
| --- | --- | --- |
| 2.1 | Upload a two-column PDF | Redirects to the reader; sections in the correct order (left column before right); headings like "1 Introduction" |
| 2.2 | Upload a `.docx` | Error: "Upload a .pdf or a .brf file." |
| 2.3 | Upload a text file renamed to `.pdf` | Error: "This file is not a valid PDF." |
| 2.4 | Upload a scanned PDF (images only) | "This paper could not be opened" with "No text layer found. Scanned PDFs are not supported yet." |
| 2.5 | Upload a file over 25 MB | Error about the size limit |
| 2.6 | Delete a paper from "Your papers" | It disappears; its notes are gone too |
| 2.7 | Import the same search result twice | Same paper, no duplicate |
| 2.8 | Disconnect from the internet, then search | A clear "Search failed" message; uploaded papers still open and read |

## 3. AI answers

| # | Do | Expect |
| --- | --- | --- |
| 3.1 | Ask a question the paper answers | Correct answer; every source button goes to a section that really contains it |
| 3.2 | Ask something unrelated ("What is the capital of Peru?") | Orange "not answered" card, no sources |
| 3.3 | Press Summarize section twice | The second is instant (cached) |
| 3.4 | Check a summary against the section text | No invented facts |
| 3.5 | Remove the API key, restart, ask | A clear error; reading, navigation and Braille still work |

## 4. Language: English, Amharic, Afaan Oromoo

| # | Do | Expect |
| --- | --- | --- |
| 4.1 | Header language picker: choose አማርኛ | Picker changes; settings page shows Braille code "Amharic Braille (Grade 1)" |
| 4.2 | Reload the page | The choice is remembered |
| 4.3 | Summarize a section | The summary is in Amharic script. Ask an Amharic reader to judge it |
| 4.4 | Press Show in Braille | Cells appear on the virtual display; they change when you switch the language |
| 4.5 | Switch to Afaan Oromoo and summarize | Output is Latin-script Oromo. **Known weak:** mixes English terms; have an Oromo speaker rate it |
| 4.6 | Type Amharic text into a note, send to Braille, type it back | Same text, except the letters ቋ and ቇ, which share Braille cells (known Liblouis limit) |

## 5. Braille display (virtual, no hardware)

Open a paper, then press "Show virtual Braille display" at the bottom. If nothing is connected, go to Settings > Braille display and press "Connect Virtual Simulator". "Use my screen reader's display" is the screen-reader path.

| # | Do | Expect |
| --- | --- | --- |
| 5.1 | Look at the display | 40 cells with the section's Braille; the page text is not hidden behind the dock |
| 5.2 | Click a routing button above a cell | The highlighted character in the text moves to that character |
| 5.3 | Click the right pan button repeatedly | The window moves; at the end of the section it goes to the next section |
| 5.4 | Click "Line Down / Next Section" | Next section; "Line Up" goes back |
| 5.5 | Focus the note box, click dots 1, 2, 5 then Space | "h " (or the matching letter) appears in the note |
| 5.6 | Backspace on the display | Deletes the last character |
| 5.7 | Turn on "Keyboard Hotkeys (F-D-S + J-K-L)", click the page, press J | **Nothing moves the section** (J is a Braille key now). Turn it off: J moves to the next section |
| 5.8 | Reader: press "Download section as BRF" | A `.brf` file downloads; opening it shows ASCII Braille |
| 5.9 | Notes: Export as BRF | Same, with the note and its section |
| 5.10 | Upload that BRF file on the home page | It opens as a document whose text matches the original |

## 5b. Search with the Braille display only (the main way in)

Use only the display's keys (or the virtual display's buttons). No mouse, no keyboard.

| # | Do | Expect |
| --- | --- | --- |
| 5b.1 | Open the home page | The display shows "Search papers: type with the Braille keys, then Enter..." and the bar says "Showing: search" |
| 5b.2 | Type `pdf` on the Braille keys, then Space | The display and the search box show "Search: pdf" |
| 5b.3 | Press Enter (dot 8 on most displays, "↵ Enter" on the virtual one) | "Searching for pdf...", then result 1 is shown: "1 of 10. Title. Authors, year. One sentence" |
| 5b.4 | Rocker down or pan right | Result 2. Rocker up goes back. At the ends: "That was the last result." |
| 5b.5 | Press any routing key | The selected paper opens in the reader and its first section goes to the display |
| 5b.6 | Back on home, press Enter with nothing typed | Your saved papers, one at a time, same keys |
| 5b.7 | Notes page: Show in Braille on a note | The bar shows "Showing: note: ..." and the status says "On the Braille display: ..." |

## 5c. Read and work with the Braille display only

Open a paper and the virtual display. Choose the dots, then press "⌘ Space + dots" for a command (on a real display, hold Space with the dots).

| # | Do | Expect |
| --- | --- | --- |
| 5c.1 | Space + L | The list of commands appears on the display |
| 5c.2 | Space + S | "Summarizing...", then the summary is on the display |
| 5c.3 | Space + O | The overview and takeaways are on the display |
| 5c.4 | Space + Q, type a question, Enter | The answer and its source sections are on the display |
| 5c.5 | Space + N, type a note, Enter | "Note saved on ..."; the notes page lists it as typed by Braille |
| 5c.6 | Space + R | Back to the section text |
| 5c.7 | Space + H on any page | Home, with the search prompt on the display |
| 5c.8 | A chord that is not a command (for example Space + A) | "Unknown command. Space L lists the commands." |

## 6. Voice (Voxide)

Press **Alt+V** to start or stop listening (the widget title shows it). Try English first. Speak naturally; the agent decides which action to run.

| # | Say | Expect |
| --- | --- | --- |
| 6.1 | "Find papers on screen readers and PDFs" | Results are read aloud; the home page shows them |
| 6.2 | "Open number 2" | The reader opens that paper |
| 6.3 | "Give me the overview" | Overview and takeaways are spoken |
| 6.4 | "Next section", "previous section", "go to section 5" | The reader moves; the section name is spoken |
| 6.5 | "Read this section" | The text is read |
| 6.6 | "Summarize this section" | A summary is spoken |
| 6.7 | "How many participants were there?" | An answer with the source section named; the reader jumps there |
| 6.8 | "Add a note: check the sample size" | Notes shows it with "typed by voice" |
| 6.9 | "Show this in Braille" | The display updates |
| 6.10 | Say it with background noise | It either works or says it didn't catch it; it must not run the wrong action |
| 6.11 | Switch to Amharic or Afaan Oromoo and repeat 6.3 and 6.7 | Voice recognition and reply work in that language. **Never tested yet.** Record exactly what happens |
| 6.12 | Run a screen reader at the same time | The screen reader does not talk over the assistant unless you pressed Alt+V |
| 6.13 | "Assistant unavailable" message | Add the domain to the Voxide whitelist (localhost is always allowed) |
| 6.14 | Voice quota used up | The page says "Voice is unavailable: the Voxide usage limit for this project is reached" (spoken by screen readers). Check the Voxide dashboard plan |

## 7. Accessibility with a screen reader (NVDA, JAWS, VoiceOver, Orca)

Use only the keyboard.

| # | Check | Expect |
| --- | --- | --- |
| 7.1 | Tab from the top of any page | First stop is "Skip to content"; it works |
| 7.2 | Navigate by headings | One main heading per page, sections have real headings |
| 7.3 | Search, import, summarize, ask | Each action announces its status ("Searching for...", "Section 3 of 30: Methods", "Summary ready.") without you hunting for it |
| 7.4 | Press J and K in the reader | Moves sections, announces the new section, and moves focus to its heading |
| 7.5 | Focus the "Six-key Braille input" box on the Notes page | Described by its help text; F D S J K L enter dots; Space adds the word |
| 7.6 | Every button and field | Has a name read aloud ("Delete <paper title>", "Open <paper title>"); nothing says just "button" |
| 7.7 | Zoom to 200% and 400% | No horizontal scrolling for the main content; nothing overlaps |
| 7.8 | Keyboard focus | A visible yellow outline everywhere |

NVDA without a Braille display: Tools > Braille Viewer shows what a display would show.

## 8. Real Braille display (when you have one)

Chrome or Edge, USB or Bluetooth. Settings > Braille display > "Connect display over USB or Bluetooth" (or Alt+Shift+B). Close the screen reader's own Braille output first.

| # | Do | Expect |
| --- | --- | --- |
| 8.1 | Connect | The chooser lists the display; the page says "Braille display connected: <name>" |
| 8.2 | Show in Braille | Cells appear within about a second |
| 8.3 | Routing key | The caret in the text moves to that character |
| 8.4 | Pan keys, then rocker keys | Pan scrolls; past the end or rocker goes to the next or previous section |
| 8.5 | Perkins keys in a focused note | Words appear as text |
| 8.6 | Unplug | "Braille display disconnected." and the app keeps working |
| 8.7 | Not HID-Braille capable? | Use the bridge (Linux/Raspberry Pi: `python3 bridge/braille_bridge.py`) or the screen-reader path |

Record the display make and model, firmware version, browser and OS for every run.

## 9. Failure and recovery

| # | Do | Expect |
| --- | --- | --- |
| 9.1 | `docker compose stop api`, then use the website | Errors say the server can't be reached; no blank page |
| 9.2 | `docker compose start api` | Everything works again without reloading the app data |
| 9.3 | `docker compose restart worker` during a paper import | The paper finishes, or fails with a readable reason |
| 9.4 | Import a paper while arXiv is slow | Progress shows; "can take up to a minute" hint |
| 9.5 | Reopen a paper that was abstract-only | Importing it again retries the full text |

## 10. Before you sign off

- [ ] Sections 1 to 5 pass in Chrome and Edge.
- [ ] Voice passes in English (6.1 to 6.9).
- [ ] At least one screen reader pass (section 7).
- [ ] `docker compose run --rm --no-deps api sh -c "pip install -r requirements-dev.txt && python -m pytest -q"` passes (48).
- [ ] `cd apps/web && npm run e2e` passes (10).
- [ ] Known limits are written down in the demo notes, not hidden.

## Reporting a problem

Write: what you did, what you expected, what happened, the language and Braille code selected, the browser, the paper (title or id), and the time. For voice problems, add what you said and what the assistant did. For display problems, add the display model.
