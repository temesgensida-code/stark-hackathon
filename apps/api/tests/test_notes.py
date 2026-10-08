def test_notes_crud(data_client, paper_id):
    r = data_client.post("/notes", json={"paper_id": paper_id, "text": "Check dataset", "source": "voice"})
    assert r.status_code == 201
    note = r.json()
    assert note["source"] == "voice"

    assert data_client.get(f"/notes?paper_id={paper_id}").json()[0]["id"] == note["id"]
    r = data_client.patch(f"/notes/{note['id']}", json={"text": "Check dataset size"})
    assert r.json()["text"] == "Check dataset size"
    assert data_client.delete(f"/notes/{note['id']}").status_code == 204
    assert data_client.get(f"/notes/{note['id']}").status_code == 404


def test_note_validation(data_client, paper_id):
    assert data_client.post("/notes", json={"paper_id": 999, "text": "x"}).status_code == 404
    assert data_client.post("/notes", json={"paper_id": paper_id, "text": "x", "source": "telepathy"}).status_code == 422
    assert data_client.post("/notes", json={"paper_id": paper_id, "section_id": 999, "text": "x"}).status_code == 422


def test_export_txt_cites_section(data_client, paper_id):
    section_id = data_client.get(f"/papers/{paper_id}/sections").json()[1]["id"]
    data_client.post("/notes", json={"paper_id": paper_id, "section_id": section_id, "text": "Small sample"})
    text = data_client.get(f"/notes/export?paper_id={paper_id}&format=txt").text
    assert "Small sample (section: Methods)" in text
