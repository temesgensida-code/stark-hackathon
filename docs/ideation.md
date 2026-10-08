# Ideation trail (STARK rule 1)

Keep this in sync with the team's Scholarxiv collection.

## Problem
Blind and visually impaired researchers can't independently search, read, take notes on and publish academic papers.
Screen readers struggle with multi-column PDFs, tables and formulas, and research tools don't work with refreshable Braille displays.

## Prior work reviewed
Scholarxiv collection (public, 14 papers, each with a comment on what we took or rejected): https://www.scholarxiv.com/collections/6ac6a53e22182abc8c85e4e1

| Paper | What we took or rejected |
| --- | --- |
| Improving the Accessibility of Scientific Documents (arXiv 2105.00076) | Took the problem framing: only 2.4% of 11,397 sampled PDFs met accessibility criteria, and SciA11y turns PDFs into navigable HTML. We add voice, Braille display output and cited answers |
| Towards More Accessible Scientific PDFs (2503.22216) | Rejected: it needs someone to fix each PDF's tags first. We parse any text-layer PDF on the fly |
| Hammer PDF (2204.02809) | Took reading a paper as sections, not pages. Did not use its extra links |
| Refreshable Tactile Displays for Accessible Data Visualisation (2401.15836) | Took the evidence that refreshable displays are becoming practical. Graphics are out of scope |
| When Refreshable Tactile Displays Meet Conversational Agents (2408.04806) | Took the pairing of touch and speech, which matches Braille display plus Voxide |
| An Architecture to Combine Touch and Conversational AI on Refreshable Tactile Displays (2602.15280) | Took keeping device input and output separate from the AI layer |
| BrailleLLM (2510.18288) | Rejected learned Braille translation; we need exact output, so Liblouis (AD-9) |
| HaptiRead, Braille as mid-air haptics (2005.06292) | Rejected: needs special hardware |
| GeoVisA11y (2603.07446) | Took natural-language Q&A as a way in for screen-reader users |
| Attributed Question Answering (2212.08037) | Took the principle behind AD-4: every answer cites its source |
| AmQA, Amharic QA dataset (2303.03290) | Not used yet; the resource to test Amharic answers later |
| LLM-Driven Optimization of HTML Structure for Screen Readers (2502.18701) | Took the point that a real heading hierarchy matters for navigation |
| LayoutReader (2108.11591) | Took the reminder that reading order is hard; we use column heuristics, no trained model |
| Eclair (2502.04223) | Confirms what a good parser should recover; not used (OCR of images) |

## Rejected approaches
- See docs/decisions/README.md

## Ideas for later
Source-linked answers, citation lookup, sound cues and skim mode, Amharic audio summaries, Telegram bot,
Braille photo recognition, chart sonification, math Braille, writing studio.
