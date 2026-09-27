from app.braille import service as svc


def test_english_round_trip(client):
    r = client.post("/braille/translate", json={"text": "Braille talks for researchers"})
    assert r.status_code == 200
    body = r.json()
    assert body["unicode"] == "⠠⠃⠗⠇⠀⠞⠁⠇⠅⠎⠀⠿⠀⠗⠑⠎⠑⠜⠡⠻⠎"
    assert body["cells"][0] == 0b100000  # capital sign = dot 6
    assert len(body["cells"]) == len(body["input_pos"])
    back = client.post("/braille/back-translate", json={"cells": body["cells"]})
    assert back.json()["text"] == "Braille talks for researchers"


def test_routing_positions_map_cells_to_text():
    t = svc.translate("the method", "en-ueb-g2")
    # "the" contracts to one cell; routing on that cell must land on "t"
    assert t.input_pos[0] == 0
    # cell after the blank must map to the "m" of "method"
    blank = t.unicode.index(svc.BLANK_CELL)
    assert "the method"[t.input_pos[blank + 1]] == "m"


def test_amharic_round_trip_is_repaired():
    for text in ["ሰላም ምርምር", "ትምህርት ቤት", "ሰላም። እንዴት ነህ፣"]:
        braille = svc.translate(text, "am-g1").unicode
        assert svc.back_translate(braille, "am-g1") == text


def test_amharic_numbers_stay_digits():
    braille = svc.translate("በ2026", "am-g1").unicode
    assert svc.back_translate(braille, "am-g1") == "በ2026"


def test_bad_inputs(client):
    assert client.post("/braille/translate", json={"text": "x", "table": "nope"}).status_code == 422
    assert client.post("/braille/back-translate", json={"cells": [300]}).status_code == 422
    assert client.post("/braille/back-translate", json={}).status_code == 422


def test_brf_export(client):
    r = client.post("/braille/brf", json={"text": "hello world", "width": 20})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/x-brf")
    assert r.content.decode("ascii").startswith("HELLO _W")


def test_tables_listed(client):
    ids = [t["id"] for t in client.get("/braille/tables").json()]
    assert {"en-ueb-g2", "am-g1", "om-g1"} <= set(ids)
