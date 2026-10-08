# Braille Talks: Braille display integration kit

This kit connects a refreshable Braille display to the Braille Talks web app. There are three ways to connect, so a user can use whichever one works with their display and computer:

| Path | Works with | Install for the user | What the app controls |
| --- | --- | --- | --- |
| **A. Direct (WebHID)** | Displays that support the USB-IF **HID Braille** standard, over USB or Bluetooth, in Chrome/Edge 89+ | Nothing | Everything: cells, routing keys, panning, Perkins typing |
| **B. Braille Talks Bridge** | Almost any display BRLTTY supports (USB, Bluetooth, serial), on Linux and Raspberry Pi | BRLTTY + a small Python bridge | Everything, same as A |
| **C. Screen reader** | Any display the user's screen reader supports (NVDA, JAWS, VoiceOver, TalkBack, Orca) | Nothing new | Text only; the screen reader does translation, panning and routing |

The app tries them in this order on page load: an approved HID display reconnects with no dialog, then a running bridge, and otherwise path C.

## Layout

```
apps/api/app/braille/   FastAPI + Liblouis
  service.py              translate / back-translate / BRF, Amharic back-translation repair
  routes.py               POST /braille/translate, /braille/back-translate, /braille/brf; GET /braille/tables

bridge/
  braille_bridge.py       BrlAPI <-> WebSocket bridge on 127.0.0.1:8765 (+ --mock mode)
apps/web/
  lib/braille/types.ts               shared BrailleDisplay interface and key events
  lib/braille/hidBrailleDisplay.ts   WebHID driver for HID Braille (usage page 0x41)
  lib/braille/bridgeDisplay.ts       WebSocket client for the bridge
  lib/braille/screenReaderDisplay.ts screen-reader fallback
  lib/braille/brailleManager.ts      windowing, panning, routing, Perkins typing
  components/BrailleDisplayConnect.tsx  <BrailleProvider>, useBraille(), connect panel
```

Copy `web/lib/braille` and `web/components/BrailleDisplayConnect.tsx` into the Next.js app. Add `@types/w3c-web-hid` as a dev dependency.

## How the app uses it

`app/layout.tsx` mounts `AppBrailleProvider` (`components/braille/AppBrailleProvider.tsx`), which wraps `BrailleProvider` and connects the display to the app. A display, real or virtual, sends the same events:

| Event | What the app does |
| --- | --- |
| `onRoute(index)` | The reader moves its caret to that text index (`caret` event on `lib/appBus.ts`) |
| `onNavigate("next" / "previous")` | The reader goes to the next or previous section (`goto` event). Panning past the end of the line also triggers it |
| `onTyped(text)` | Typed words go into the focused input or textarea (`lib/braille/typing.ts`); with nothing focused, the reader appends them to its note box |

The reader calls `manager.show(section.text, caret)` whenever the section or caret changes. Voice commands use the same bus ("show this in Braille" sends a `show-braille` event).

### Every page uses the display

A Braille bar at the bottom of every page (`components/braille/BrailleBar.tsx`) shows what is on the display, which display is connected, and opens the virtual display. "Show in Braille" announces what it put on the display, or says that no display is connected. A page can take over the display's keys with `setBraillePage` in `lib/appBus.ts`:

| Page | Typing | Enter | Pan or rocker | Routing key | "Show in Braille" |
| --- | --- | --- | --- | --- | --- |
| Home | Builds the search, shown as "Search: ..." | Runs the search; with nothing typed, lists your papers | Next or previous result, each shown on the display | Opens the result on the display | The selected result |
| Reader | Into the focused field, else the note box | New line | Next or previous section | Moves the caret | The current section |
| Notes | Into the focused field | New line | (reader default) | (reader default) | The note being written, else all notes |

### Commands (Space + letter)

Press Space together with the dots of a letter, as on Braille notetakers. Results go to the display.

| Chord | Letter dots | Does |
| --- | --- | --- |
| Space + S | 2-3-4 | Summarize the current section |
| Space + O | 1-3-5 | Overview and takeaways of the paper |
| Space + Q | 1-2-3-4-5 | Ask a question: type it, then Enter; the answer and its source sections appear |
| Space + N | 1-3-4-5 | Write a note: type it, then Enter (saved as typed by Braille) |
| Space + R | 1-2-3-5 | Back to the section text |
| Space + H | 1-2-5 | Home and search (any page) |
| Space + L | 1-2-3 | List the commands (any page) |

In the reader, typing with no field focused goes to a note by default, or to the question after Space + Q. The commands are defined in `lib/braille/commands.ts`. Real displays send them as `chord` events (WebHID, and the bridge via BrlAPI's `DOTC` flag); the virtual display has a "⌘ Space + dots" button.

### Language and Braille code

One setting, in the header, sets the Braille code, the language of AI summaries and answers, and the Voxide voice language together:

| Language | Braille code | Voice |
| --- | --- | --- |
| English | `en-ueb-g2` | `en-US` |
| Amharic | `am-g1` | `am-ET` |
| Afaan Oromoo | `om-g1` | `om-ET` |

The Braille code can still be chosen separately on `/settings/braille`. The choice is remembered in the browser. Liblouis has no Afaan Oromoo table, so `om-g1` uses UEB Grade 1, which covers the Latin letters of Qubee (round trips are tested).

## Key map (all paths A and B)

| Display key | Event | Default action in Braille Talks |
| --- | --- | --- |
| Routing key over a cell | `route` | Move the reading caret there |
| Pan left / right (thumb keys) | `pan` | Scroll the line; past either end, go to the previous or next paragraph |
| Rocker or joystick up / down | `line` | Previous or next section |
| Perkins dots 1-8 | `dots` | Type into the focused field, back-translated per word by Liblouis |
| Space | `space` | End the word (sends it to Liblouis) |
| Space + dots | `chord` | Commands, see below |
| Dot 7 / dot 8 alone | `backspace` / `enter` | Delete the last cell / new line |

## Testing without hardware

1. **Virtual display (the main way).** The app connects to it by itself when no display or bridge is found. It runs in the browser and needs no server; if it ever drops, the app reconnects it on its own. (The optional WebSocket mode, for watching one display from two windows, is in the simulator's settings and depends on the API.) In the reader, open "Show virtual Braille display". Routing buttons, panning, rocker keys and the Perkins keys all send the real events. Turn on "Keyboard Hotkeys" to chord with F D S and J K L; the reader's J and K shortcuts stand down while it is on.
2. **Bridge without a display.** `python3 bridge/braille_bridge.py --mock` prints cells in the terminal and accepts typed key events.
3. **Screen reader path.** With NVDA, Tools > Braille Viewer shows what a display would show. Connect "Screen reader" in settings.
4. **Automated.** `npm run e2e` in `apps/web` drives the virtual display in a real browser: routing key moves the caret, a rocker key changes the section, a chord plus Space types into the note, and the J/K guard.

## Running locally

```bash
# API
sudo apt install liblouis-data python3-louis
pip install -r api/requirements.txt
cd api && uvicorn app:app --port 8000

# Bridge, with a real display (Linux / Raspberry Pi)
sudo apt install brltty python3-brlapi && pip install websockets
sudo usermod -aG brlapi $USER            # lets the bridge talk to BRLTTY; log out and in
python3 bridge/braille_bridge.py --allow-origin https://<your-app>.ethiodeploy.app

# Bridge without hardware (prints cells in the terminal; type "route 3", "left", "dots 1-2-5", "space")
python3 bridge/braille_bridge.py --mock
```

## Tests

```bash
docker compose run --rm --no-deps api sh -c "pip install -r requirements-dev.txt && python -m pytest -q"   # 48 API tests with real Liblouis, incl. BRF and Afaan Oromoo round trips
cd bridge && pytest -q                      # 12 tests, BrlAPI key decoding + WebSocket bridge
cd apps/web && npm install && npm test      # 21 tests: HID parsing, manager, typing helper (4 need a local Liblouis)
cd apps/web && npm run typecheck
cd apps/web && npm run e2e                  # 10 browser tests incl. axe accessibility (needs the stack running)
```

## Known limits

- WebHID works only in Chromium browsers (Chrome, Edge, Opera), not Firefox or Safari. On iPhone and iPad use path C.
- Only displays whose firmware supports **HID Braille** appear in the WebHID chooser. Check the manufacturer's firmware notes; older displays need path B or C.
- If the screen reader already has the display open, the browser may not be able to open it too. Tell users to switch the screen reader's Braille output off while using path A.
- The API and web Dockerfiles build and run locally with Docker Compose; they have not been deployed to EthioDeploy yet.
- The bridge and the WebHID driver were tested with BRLTTY's key codes and simulated displays, not yet with physical hardware.
- Amharic uses Liblouis `ethio-g1.ctb`. Its back-translation returns sixth-order letters and Ethiopic punctuation as ASCII. `braille_service.py` repairs this using a reverse map built from the table itself.
- Amharic: Liblouis gives the letters ቋ and ቇ the same cells, so reading Braille back cannot tell them apart. The mistake is in the table, not in our code.
- Afaan Oromoo uses UEB Grade 1 (no dedicated Liblouis table). Contractions are not applied.
