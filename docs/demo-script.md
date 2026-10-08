# Demo script (no Braille hardware needed)

The app drives the virtual 40-cell display exactly as it would drive a real one, through the same events. Say so plainly in the demo: the direct hardware path is tested with simulated displays, not yet with a physical device.

## Prepare (the day before, not on stage)

1. `docker compose up -d --build`, then open http://localhost:3000 in Chrome or Edge (`localhost` works with Voxide without any setup).
2. Import two or three demo papers now. arXiv can take over a minute to serve a PDF. Keep a PDF on the desktop as a fallback upload.
3. Settings > Braille display > connect the virtual display (it connects by itself on most loads).
4. Allow the microphone for the site. Try `Alt+V` once to confirm Voxide answers.
5. Pick the language in the header: English for the main run, Amharic for the closing minute.

## Run (about 3 minutes, from SRS section 6)

| Step | Do | Expect |
| --- | --- | --- |
| 1 | On the Braille display: type "screen readers", press Enter, rocker down twice, press a routing key | Each result appears on the display; the routing key opens the paper (the main way in for our users) |
| 1b | Or press Alt+V and say "Find papers on screen readers and PDFs" | Results are read aloud and shown |
| 2 | "Open number 1", then "Give me the overview" | Overview and takeaways are spoken |
| 3 | "Summarize this section" | A 2 to 4 sentence summary |
| 4 | "How many participants were blind?" | An answer naming its source section; the reader jumps there |
| 5 | Open the display dock, press "Show in Braille", click a routing key | Cells appear; the caret in the text moves to the clicked character |
| 6 | Pan right past the end of the line | The reader moves to the next section |
| 7 | Focus the note box, press dots on the simulator (for example 1-2-5) then Space | The typed text appears in the note |
| 8 | Notes > Export as BRF | A `.brf` file downloads |
| 9 | Switch the header language to አማርኛ, press Summarize | An Amharic summary appears and goes to the display in Amharic Braille |

## Without any display at all

Windows with NVDA: Tools > Braille Viewer shows on screen what a display would show. Turn off the virtual display (Disconnect) and connect the "Screen reader" path in settings.

## If something goes wrong

- Voice does not answer: the buttons do the same things. Say so and continue.
- Slow paper: open one that was imported earlier.
- Model unavailable: reading, navigation and Braille still work; only summaries and answers fail, with a clear message.
