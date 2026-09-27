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

## Using it in the reader page

```tsx
// app/layout.tsx
<BrailleProvider apiBase={process.env.NEXT_PUBLIC_API_URL} callbacks={{
  onNavigate: (dir) => dir === "next" ? reader.nextParagraph() : reader.previousParagraph(),
  onRoute: (i) => reader.moveCaret(i),          // or open the citation under the finger
  onTyped: (t) => notes.insert(t),              // Perkins typing goes into the note editor
  onCommand: (e) => e.kind === "chord" && e.dots === 0b1101 && reader.openMenu(), // space + m
}}>
  {children}
  <VoxideWidget client={ai} />
</BrailleProvider>

// reader component
const { manager } = useBraille();
useEffect(() => { manager.show(currentParagraph.text); }, [currentParagraph]);
```

Register a Voxide action so voice can drive the display too, for example `show_in_braille({section})` calling `manager.show(...)`.

## Key map (all paths A and B)

| Display key | Event | Default action in Braille Talks |
| --- | --- | --- |
| Routing key over a cell | `route` | Move the reading caret there; on a citation, open it |
| Pan left / right (thumb keys) | `pan` | Scroll the line; past either end, go to the previous or next paragraph |
| Rocker or joystick up / down | `line` | Previous or next paragraph |
| Perkins dots 1-8 | `dots` | Type into the note editor, back-translated per word by Liblouis |
| Space | `space` | End the word (sends it to Liblouis) |
| Space + dots | `chord` | App commands (menu, summarize, bookmark) |
| Dot 7 / dot 8 alone | `backspace` / `enter` | Delete the last cell / new line |

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
cd api && pytest -q                         # 7 tests, real Liblouis
cd bridge && pytest -q                      # 12 tests, BrlAPI key decoding + WebSocket bridge
cd web && npm install && npm test           # 12 tests: HID parsing + manager against the real API and bridge
cd web && npm run typecheck
```

## Known limits

- WebHID works only in Chromium browsers (Chrome, Edge, Opera), not Firefox or Safari. On iPhone and iPad use path C.
- Only displays whose firmware supports **HID Braille** appear in the WebHID chooser. Check the manufacturer's firmware notes; older displays need path B or C.
- If the screen reader already has the display open, the browser may not be able to open it too. Tell users to switch the screen reader's Braille output off while using path A.
- The Dockerfile was written for EthioDeploy but not built during development. Build it once before relying on it.
- The bridge was tested with BRLTTY's key codes and a simulated display, not yet with physical hardware.
- Amharic uses Liblouis `ethio-g1.ctb`. Its back-translation returns sixth-order letters and Ethiopic punctuation as ASCII. `braille_service.py` repairs this using a reverse map built from the table itself.
