"""BRF export and import round trips, and the Afaan Oromoo / Amharic tables. Need Liblouis (run in Docker)."""

import pytest

from app.braille import service as svc
from app.documents.parser import parse_brf

SAMPLES = {
    "en-ueb-g2": "Braille talks for researchers. The method used 12 users.",
    "en-ueb-g1": "Braille talks for researchers.",
    "am-g1": "ሰላም ምርምር። ትምህርት ቤት",
}


@pytest.mark.parametrize("table", list(SAMPLES))
def test_brf_export_then_import_returns_the_text(tmp_path, table):
    text = SAMPLES[table]
    path = tmp_path / "doc.brf"
    path.write_bytes(svc.to_brf(text, table).encode("ascii"))
    doc = parse_brf(str(path), table)
    assert " ".join(doc.sections[0].text.split()) == text


def test_brf_wraps_to_the_requested_width(tmp_path):
    brf = svc.to_brf("word " * 60, "en-ueb-g1", width=20)
    assert all(len(line) <= 20 for line in brf.replace("\f", "\r\n").split("\r\n"))


def test_empty_brf_is_rejected(tmp_path):
    from app.documents.parser import ParseError

    path = tmp_path / "empty.brf"
    path.write_bytes(b"\r\n\r\n")
    with pytest.raises(ParseError):
        parse_brf(str(path))


# Afaan Oromoo is written in Latin script (Qubee). Liblouis ships no Oromo table, so the app uses UEB Grade 1.
OROMO = ["Afaan Oromoo", "Barnoota ol'aanaa", "Dhaabbata qorannoo", "Waa'ee saaqaa fi bishaanii"]


@pytest.mark.parametrize("text", OROMO)
def test_oromo_round_trip(text):
    braille = svc.translate(text, "om-g1").unicode
    assert svc.back_translate(braille, "om-g1") == text


def test_every_table_is_listed_with_its_language(client):
    langs = {t["id"]: t["lang"] for t in client.get("/braille/tables").json()}
    assert langs == {"en-ueb-g2": "en", "en-ueb-g1": "en", "am-g1": "am", "om-g1": "om"}
