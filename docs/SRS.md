# Software Requirements Specification — Braille Talks

Version 0.1 (idea submission) · 2026-09-27 · STARK Hackathon

## 1. Introduction

### 1.1 Purpose
This document states what Braille Talks must do and how well it must do it. It is the reference for the three-person team building the final submission and for judges reviewing the idea.

### 1.2 Product scope
Braille Talks is a web-based research assistant for blind and visually impaired researchers. It lets them find, read, understand, take notes on and write about academic papers using voice and refreshable Braille displays, without relying on a sighted helper.

### 1.3 Definitions
| Term | Meaning |
| --- | --- |
| Refreshable Braille display | Hardware with a row of cells whose pins rise to show Braille; most have routing keys, panning keys and Perkins-style typing keys |
| Liblouis | Open-source Braille translator and back-translator |
| UEB | Unified English Braille; Grade 2 is contracted, Grade 1 is not |
| BRF | Braille Ready Format, an ASCII Braille file for embossers and notetakers |
| HID Braille | USB-IF standard (usage page 0x41) that lets software drive displays without vendor drivers |
| BrlAPI / BRLTTY | Linux Braille display daemon and its client API |
| Voxide | Voice AI SDK required by STARK rule 2 |
| Scholarxiv | Research platform whose Papers API and MCP server STARK encourages |

## 2. Overall description

### 2.1 Users
| User | Needs |
| --- | --- |
| Blind researcher or student (primary) | Search papers, hear or read structured summaries, navigate sections, ask questions, take notes in Braille or by voice |
| Low-vision researcher | Same, plus large-text visual mode |
| Sighted advisor or teammate (secondary) | See what the user is reading (visual Braille mirror), share papers |

### 2.2 Operating environment
- Web app in current Chrome, Edge, Firefox and Safari; direct Braille display control needs Chrome or Edge (WebHID).
- Works with NVDA, JAWS, VoiceOver, TalkBack and Orca.
- Optional local bridge on Linux or Raspberry Pi for displays without HID Braille.
- Hosted on EthioDeploy.

### 2.3 Constraints
- Build window Sep 9 – Oct 2, 2026; all code written during the window (STARK rule 4).
- Voice through Voxide (rule 2); ideation documented on Scholarxiv (rule 1).
- Voxide free tier: 5 sessions, 1 whitelisted domain.
- Scholarxiv full-text access requires a paid plan.

### 2.4 Assumptions
- Users have a screen reader and headphones; some own a Braille display.
- Most target papers are digital PDFs or arXiv papers with text layers, not scanned images.

## 3. Functional requirements

Priority: **M** = must have for the final submission, **S** = should have, **C** = could have (roadmap).

### 3.1 Paper discovery
| ID | Requirement | Priority |
| --- | --- | --- |
| FR-1 | Search papers by voice or keyboard through the Scholarxiv Papers API; results read as title, authors, year and one-sentence abstract | M |
| FR-2 | Upload a PDF paper | M |
| FR-3 | Upload a BRF Braille file and convert it to text | S |
| FR-4 | Save papers to a Scholarxiv collection | C |

### 3.2 Reading and navigation
| ID | Requirement | Priority |
| --- | --- | --- |
| FR-5 | Parse a paper into ordered sections with headings, preserving reading order across columns | M |
| FR-6 | Move between sections by voice ("next section") and keyboard (J / K) | M |
| FR-7 | Render every section as semantic HTML (real headings, table headers, landmarks) | M |
| FR-8 | Describe tables and figures in words | S |
| FR-9 | Read equations aloud in words | S |

### 3.3 AI understanding
| ID | Requirement | Priority |
| --- | --- | --- |
| FR-10 | Generate a 2–4 sentence summary per section and a paper overview with 3–5 key takeaways | M |
| FR-11 | Answer questions about a paper, citing the section each claim came from, with a jump to that section | M |
| FR-12 | Say plainly when the paper does not answer the question | M |
| FR-13 | Look up a cited reference ("who is Smith 2019?") without losing the reading position | S |

### 3.4 Voice
| ID | Requirement | Priority |
| --- | --- | --- |
| FR-14 | Voice commands through Voxide for search, open paper, next/previous section, summarize, ask, add note, show in Braille | M |
| FR-15 | Push-to-talk hotkey so voice output does not overlap screen reader speech | M |
| FR-16 | English voice interaction; Amharic when Voxide supports it | M (English) / S (Amharic) |

### 3.5 Braille
| ID | Requirement | Priority |
| --- | --- | --- |
| FR-17 | Translate text to Braille with Liblouis (UEB Grade 1/2, Amharic Ethiopic Grade 1) | M |
| FR-18 | Back-translate Braille input to text, including correct Amharic output | M |
| FR-19 | Connect a Braille display directly over USB or Bluetooth (WebHID, HID Braille) | M |
| FR-20 | Connect other displays through a local BRLTTY bridge | S |
| FR-21 | Fall back to the user's screen reader for Braille output | M |
| FR-22 | Routing keys move the reading caret; panning keys scroll and move between paragraphs | M |
| FR-23 | Type notes on the display's Perkins keys, or in six-key mode on a normal keyboard | M |
| FR-24 | Export any section or note as a BRF file | S |

### 3.6 Notes
| ID | Requirement | Priority |
| --- | --- | --- |
| FR-25 | Create, read, edit and delete notes linked to a paper and section | M |
| FR-26 | Record how each note was entered (keyboard, voice, Braille) | C |
| FR-27 | Export notes with their citations | S |

## 4. Non-functional requirements

| ID | Category | Requirement |
| --- | --- | --- |
| NFR-1 | Accessibility | Meets WCAG 2.2 AA; every feature usable by keyboard alone; zero axe-core violations on main pages |
| NFR-2 | Accessibility | Every status change announced through an ARIA live region; no audio auto-plays over the screen reader |
| NFR-3 | Latency | A Braille key press is reflected on the display within 150 ms |
| NFR-4 | Latency | Voice command acknowledged within 1.5 s; section summary within 10 s, cached afterwards |
| NFR-5 | Throughput | A 20-page paper is parsed within 60 s |
| NFR-6 | Reliability | If the LLM or Scholarxiv is unavailable, reading, navigation and Braille still work |
| NFR-7 | Security | API keys only on the server; the local bridge listens on 127.0.0.1 and accepts only the app's origin |
| NFR-8 | Privacy | Uploaded papers and notes belong to the user and are not shared |
| NFR-9 | Language | English and Amharic Braille; Afaan Oromoo via Latin-script Braille |
| NFR-10 | Maintainability | Automated tests for Braille translation, display drivers and API routes run in CI |
| NFR-11 | Traceability | Every member commits from their own account; decisions logged in `docs/decisions/` |

## 5. External interfaces

| Interface | Used for |
| --- | --- |
| Scholarxiv Papers API / MCP (`https://www.scholarxiv.com/api`, `sxv_` keys) | Paper search, metadata, full text |
| Scholarxiv Router (OpenAI-compatible) | Summaries and Q&A |
| Voxide (`@voxide/react`) | Voice interaction |
| WebHID (HID Braille, usage page 0x41) | Direct Braille display control |
| BrlAPI over WebSocket (`ws://127.0.0.1:8765`) | Displays driven by BRLTTY |
| EthioDeploy | Hosting, Postgres, Redis |

## 6. Acceptance: demo scenario

A blind tester completes this hands-free in under 3 minutes:
1. "Find papers on screen readers and PDFs" → hears the top results.
2. Opens one → hears the overview and takeaways.
3. "Summarize section 2" → hears the summary.
4. "What dataset did they use?" → hears an answer citing a section, jumps to it.
5. "Show this in Braille" → the section appears on the display; routing key moves the caret.
6. Types a note on the Perkins keys → hears it read back as text.

## 7. Out of scope for this round
Recognizing photographed physical Braille, tactile graphics, math Braille (Nemeth), payments, and mobile apps.
