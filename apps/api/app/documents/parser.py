"""PDF and BRF parsing into ordered sections. Docling first, PyMuPDF fallback (AD-3)."""

from __future__ import annotations

import html
import re
from collections import Counter
from dataclasses import dataclass, field


@dataclass
class ParsedSection:
    heading: str
    level: int  # 1 = top level
    text: str


@dataclass
class ParsedDocument:
    title: str = ""
    sections: list[ParsedSection] = field(default_factory=list)


class ParseError(Exception):
    pass


NUMBERED_HEADING = re.compile(r"^(\d+(?:\.\d+){0,2})\.?\s+[A-Z]")
KNOWN_HEADINGS = {
    "abstract", "introduction", "background", "related work", "method", "methods", "methodology",
    "results", "discussion", "conclusion", "conclusions", "references", "acknowledgments",
    "acknowledgements", "evaluation", "experiments", "limitations",
}


def section_html(heading: str, level: int, text: str) -> str:
    """Semantic HTML: a real heading and one <p> per paragraph (FR-7)."""
    tag = f"h{min(max(level + 1, 2), 6)}"
    paras = "".join(f"<p>{html.escape(p)}</p>" for p in re.split(r"\n{2,}", text) if p.strip())
    return f"<section><{tag}>{html.escape(heading)}</{tag}>{paras}</section>"


def sections_from_markdown(md: str) -> ParsedDocument:
    """Group Markdown (Docling's export format) into sections, one per heading."""
    doc = ParsedDocument()
    heading, level, buf = "", 1, []

    def flush():
        paragraphs = [re.sub(r"\s+", " ", p).strip() for p in re.split(r"\n{2,}", "\n".join(buf))]
        text = "\n\n".join(p for p in paragraphs if p)
        if text or heading:
            doc.sections.append(ParsedSection(heading or "Front matter", level, text))

    for line in md.splitlines():
        m = re.match(r"^(#{1,6})\s+(.*)$", line)
        if m:
            flush()
            buf = []
            depth, heading = len(m.group(1)), m.group(2).strip()
            if depth == 1 and not doc.title:
                doc.title = heading
            level = max(depth - 1, 1)
        else:
            buf.append(line)
    flush()
    doc.sections = [s for s in doc.sections if s.text]
    return doc


def _parse_docling(path: str) -> ParsedDocument:
    from docling.document_converter import DocumentConverter  # heavy and optional

    result = DocumentConverter().convert(path)
    return sections_from_markdown(result.document.export_to_markdown())


def _page_blocks_in_reading_order(page) -> list[dict]:
    """Left column then right column; full-width blocks split the page into bands."""
    width = page.rect.width
    blocks = [b for b in page.get_text("dict")["blocks"] if b["type"] == 0]
    wide = sorted((b for b in blocks if b["bbox"][2] - b["bbox"][0] > width * 0.6), key=lambda b: b["bbox"][1])
    narrow = [b for b in blocks if b not in wide]
    edges = [-1.0] + [w["bbox"][1] for w in wide] + [1e9]
    ordered: list[dict] = []
    for i in range(len(edges) - 1):
        lo, hi = edges[i], edges[i + 1]
        if i > 0:
            ordered.append(wide[i - 1])
        band = [b for b in narrow if lo <= b["bbox"][1] < hi]
        for in_right in (False, True):
            col = [b for b in band if (b["bbox"][0] >= width * 0.5) == in_right]
            ordered += sorted(col, key=lambda b: b["bbox"][1])
    return ordered


BOLD_FONT = re.compile(r"bold|black|heavy|cmbx|(?:TB|BX|Bd)\d*$", re.I)
LONE_NUMBER = re.compile(r"^\d+(?:\.\d+){0,2}\.?$")
WATERMARK = re.compile(r"^arXiv:\d{4}\.\d{4,5}")


def _is_bold(span: dict) -> bool:
    return bool(span["flags"] & 16) or bool(BOLD_FONT.search(span.get("font", "")))


def _drop_running_text(lines: list[tuple[float, bool, str]], pages: int) -> list[tuple[float, bool, str]]:
    """Remove the arXiv watermark and short lines repeated on many pages (headers, footers, page numbers)."""
    counts = Counter(text for _, _, text in lines if len(text) < 90)
    limit = max(3, pages // 3)
    return [ln for ln in lines if not WATERMARK.match(ln[2]) and counts[ln[2]] < limit]


def _heading_level(size: float, bold: bool, text: str, body: float) -> int:
    if len(text) > 100 or text.endswith((",", ";")):
        return 0
    numbered = NUMBERED_HEADING.match(text)
    known = text.lower().strip(" .0123456789") in KNOWN_HEADINGS
    if size >= body + 3:
        return 1
    if size >= body + 0.8 or (bold and (numbered or known)):
        return 3 if numbered and "." in numbered.group(1) else 2
    return 0


def _is_real_heading(text: str) -> bool:
    return bool(NUMBERED_HEADING.match(text)) or text.lower().strip(" .0123456789") in KNOWN_HEADINGS


def _join_lines(lines: list[str]) -> str:
    out = ""
    for ln in lines:
        if out.endswith("-") and ln[:1].islower():
            out = out[:-1] + ln
        else:
            out = f"{out} {ln}" if out else ln
    return re.sub(r"\s+", " ", out).strip()


def _parse_pymupdf(path: str) -> ParsedDocument:
    import pymupdf as fitz  # PyMuPDF

    pdf = fitz.open(path)
    lines: list[tuple[float, bool, str]] = []
    for page in pdf:
        for block in _page_blocks_in_reading_order(page):
            for ln in block["lines"]:
                spans = [s for s in ln["spans"] if s["text"].strip()]
                if spans:
                    text = "".join(s["text"] for s in spans).strip()
                    lines.append((max(s["size"] for s in spans), all(_is_bold(s) for s in spans), text))
    lines = _drop_running_text(lines, len(pdf))
    if not lines:
        raise ParseError("No text layer found. Scanned PDFs are not supported yet.")

    body = Counter(round(size) for size, _, _ in lines).most_common(1)[0][0]
    doc = ParsedDocument()
    title_lines: list[str] = []
    heading, level, buf = "Front matter", 1, []
    seen_heading = False

    def flush():
        text = _join_lines(buf)
        if text:
            doc.sections.append(ParsedSection(heading, level, text))

    section_no = ""
    for size, bold, text in lines:
        if section_no:  # a lone number ("2.1") on the previous line belongs to this title
            text, section_no = f"{section_no} {text}", ""
            if not NUMBERED_HEADING.match(text):  # it was a number in a table or equation, not a heading
                buf.append(text)
                continue
        elif LONE_NUMBER.match(text) and size >= body + 0.8:
            section_no = text
            continue
        lvl = _heading_level(size, bold, text, body)
        if not seen_heading and lvl == 1 and not _is_real_heading(text):
            title_lines.append(text)  # big lines before the first section make up the title
        elif lvl and (seen_heading or _is_real_heading(text)):
            flush()
            seen_heading = True
            heading, level, buf = text, lvl, []
        else:
            buf.append(text)  # author lines and an unlabeled abstract stay in "Front matter"
    flush()
    doc.title = " ".join(title_lines) or (pdf.metadata or {}).get("title") or ""
    return doc


def parse_pdf(path: str) -> ParsedDocument:
    try:
        doc = _parse_docling(path)
        if doc.sections:
            return doc
    except Exception:
        pass  # Docling missing or failed: use the lighter parser
    try:
        return _parse_pymupdf(path)
    except ParseError:
        raise
    except Exception as exc:
        raise ParseError(f"Could not read this PDF: {exc}") from exc


# North American ASCII Braille: the character's index is its dot pattern (bit 0 = dot 1).
_BRF_ASCII = ' A1B\'K2L@CIF/MSP"E3H9O6R^DJG>NTQ,*5<-U8V.%[$+X!&;:4\\0Z7(_?W]#Y)='


def parse_brf(path: str, table: str = "en-ueb-g2") -> ParsedDocument:
    """Back-translate a BRF file to text (FR-3)."""
    from app.braille import service as braille

    with open(path, "rb") as fh:
        raw = fh.read().decode("ascii", errors="ignore").replace("\r", "")
    paragraphs = []
    for block in re.split(r"\n\s*\n", raw):
        cells = "".join(chr(0x2800 + max(_BRF_ASCII.find(c.upper()), 0)) for c in block.replace("\n", " ") if c != "\f")
        if cells.strip(chr(0x2800) + " "):
            paragraphs.append(braille.back_translate(cells, table))
    if not paragraphs:
        raise ParseError("The BRF file is empty.")
    return ParsedDocument(title="Braille document", sections=[ParsedSection("Document", 1, "\n\n".join(paragraphs))])
