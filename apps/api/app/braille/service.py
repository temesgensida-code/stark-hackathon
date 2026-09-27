"""Braille translation service for Braille Talks.

Wraps Liblouis so every Braille output in the app (web view, WebHID display,
local BrlAPI bridge, .brf download) comes from one place.

Cells are exchanged as integers 0-255 where bit 0 = dot 1 ... bit 7 = dot 8.
This is the same bit layout as Unicode braille (U+2800 + cell), the HID
Braille "8 Dot Braille Cell" usage, and BrlAPI's writeDots(), so no
conversion is needed anywhere in the pipeline.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

import louis

BRAILLE_BASE = 0x2800
NUMBER_SIGN = chr(BRAILLE_BASE + 0b111100)  # dots 3456
BLANK_CELL = chr(BRAILLE_BASE)

# Table ids exposed to the frontend. "unicode.dis" makes Liblouis read and
# write Unicode braille, which maps 1:1 to cell bytes.
TABLES: dict[str, dict] = {
    "en-ueb-g2": {
        "files": ["unicode.dis", "en-ueb-g2.ctb"],
        "label": "English UEB, contracted (Grade 2)",
        "lang": "en",
    },
    "en-ueb-g1": {
        "files": ["unicode.dis", "en-ueb-g1.ctb"],
        "label": "English UEB, uncontracted (Grade 1)",
        "lang": "en",
    },
    "am-g1": {
        "files": ["unicode.dis", "ethio-g1.ctb"],
        "label": "Amharic (Ethiopic Grade 1)",
        "lang": "am",
    },
    # Afaan Oromoo is written in Latin script (Qubee). Uncontracted UEB
    # covers its letters; swap in a dedicated table if one becomes available.
    "om-g1": {
        "files": ["unicode.dis", "en-ueb-g1.ctb"],
        "label": "Afaan Oromoo (Latin, uncontracted)",
        "lang": "om",
    },
}
DEFAULT_TABLE = "en-ueb-g2"


class UnknownTable(ValueError):
    pass


def _files(table_id: str) -> list[str]:
    try:
        return TABLES[table_id]["files"]
    except KeyError as exc:
        raise UnknownTable(f"Unknown braille table '{table_id}'. Use one of: {', '.join(TABLES)}") from exc


def cells_to_unicode(cells: list[int]) -> str:
    return "".join(chr(BRAILLE_BASE + (c & 0xFF)) for c in cells)


def unicode_to_cells(text: str) -> list[int]:
    out = []
    for ch in text:
        cp = ord(ch)
        if ch == " ":
            out.append(0)
        elif BRAILLE_BASE <= cp <= BRAILLE_BASE + 0xFF:
            out.append(cp - BRAILLE_BASE)
        else:
            raise ValueError(f"Not a braille cell: {ch!r}")
    return out


@dataclass
class Translation:
    table: str
    unicode: str
    cells: list[int]
    # input_pos[i] = index in the source text that produced braille cell i.
    # Used to turn a routing-key press on cell i into a text caret position.
    input_pos: list[int]
    # output_pos[j] = braille cell index for source character j.
    # Used to scroll the display window to a text position.
    output_pos: list[int]
    cursor: int


def translate(text: str, table: str = DEFAULT_TABLE, cursor: int = 0) -> Translation:
    files = _files(table)
    if not text:
        return Translation(table, "", [], [], [], 0)
    cursor = max(0, min(cursor, len(text) - 1))
    braille, input_pos, output_pos, cur = louis.translate(files, text, cursorPos=cursor)
    return Translation(
        table=table,
        unicode=braille,
        cells=unicode_to_cells(braille),
        input_pos=list(input_pos),
        output_pos=list(output_pos),
        cursor=cur,
    )


# ---------------------------------------------------------------- Amharic fix
# Liblouis 3.29's ethio-g1 table back-translates sixth-order consonants
# (e.g. "ም") and Ethiopic punctuation (e.g. "።") to ASCII. We rebuild the
# reverse mapping from the table itself so it stays correct if the table is
# updated.


@lru_cache(maxsize=1)
def _amharic_repair_map() -> dict[str, str]:
    files = _files("am-g1")
    candidates = [chr(base + 5) for base in range(0x1200, 0x1358, 8)]  # sixth order
    candidates += [chr(cp) for cp in range(0x1361, 0x1369)]  # Ethiopic punctuation
    repair: dict[str, str] = {}
    for ch in candidates:
        try:
            back = louis.backTranslateString(files, louis.translateString(files, ch))
        except RuntimeError:
            continue
        if back != ch and len(back) == 1 and back.isascii():
            repair.setdefault(back, ch)
    return repair


def _repair_amharic_segment(braille: str, files: list[str]) -> str:
    """Back-translate one braille word, leaving number-mode runs untouched."""
    if not braille:
        return ""
    split = braille.find(NUMBER_SIGN)
    letters, numbers = (braille, "") if split < 0 else (braille[:split], braille[split:])
    repair = _amharic_repair_map()
    text = "".join(repair.get(ch, ch) for ch in louis.backTranslateString(files, letters)) if letters else ""
    if numbers:
        text += louis.backTranslateString(files, numbers)
    return text


def back_translate(braille: str | list[int], table: str = DEFAULT_TABLE) -> str:
    """Braille (Unicode string or cell list) to print text."""
    files = _files(table)
    if isinstance(braille, list):
        braille = cells_to_unicode(braille)
    braille = braille.replace(" ", BLANK_CELL)
    if not braille.strip(BLANK_CELL):
        return " " * len(braille)
    if TABLES[table]["lang"] == "am":
        return " ".join(_repair_amharic_segment(word, files) for word in braille.split(BLANK_CELL))
    return louis.backTranslateString(files, braille)


# ---------------------------------------------------------------- BRF export


def to_brf(text: str, table: str = DEFAULT_TABLE, width: int = 40, height: int = 25) -> str:
    """North American ASCII braille (.brf) for embossers and notetakers."""
    unicode_braille = translate(text, table).unicode
    ascii_map = " A1B'K2L@CIF/MSP\"E3H9O6R^DJG>NTQ,*5<-U8V.%[$+X!&;:4\\0Z7(_?W]#Y)="
    words = unicode_braille.replace(BLANK_CELL, " ").split(" ")
    lines, line = [], ""
    for word in words:
        brf_word = "".join(ascii_map[(ord(c) - BRAILLE_BASE) & 0x3F] for c in word)
        while len(brf_word) > width:  # hard-wrap very long words
            if line:
                lines.append(line)
                line = ""
            lines.append(brf_word[:width])
            brf_word = brf_word[width:]
        if len(line) + len(brf_word) + (1 if line else 0) > width:
            lines.append(line)
            line = brf_word
        else:
            line = f"{line} {brf_word}" if line else brf_word
    if line:
        lines.append(line)
    pages = [lines[i : i + height] for i in range(0, len(lines), height)] or [[]]
    return "\f".join("\r\n".join(p) + "\r\n" for p in pages)
