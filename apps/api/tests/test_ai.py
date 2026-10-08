import pytest

from app.ai import llm


@pytest.fixture
def fake_llm(monkeypatch):
    calls = []

    def chat(system, user, json_mode=False):
        calls.append(user)
        if "Question:" in user:
            return '{"answer": "Twelve users.", "answered": true, "citations": [{"section_id": %d, "quote": "12 screen reader users"}, {"section_id": 99999, "quote": "invented"}]}' % SECTION["id"]
        if json_mode:
            return '{"overview": "A study.", "takeaways": ["One.", "Two.", "Three."]}'
        return "A short summary."

    SECTION = {"id": 0}
    monkeypatch.setattr(llm, "chat", chat)
    return calls, SECTION


def test_section_summary_is_cached(data_client, paper_id, fake_llm):
    calls, _ = fake_llm
    sid = data_client.get(f"/papers/{paper_id}/sections").json()[0]["id"]
    first = data_client.post("/ai/summarize", json={"section_id": sid}).json()
    second = data_client.post("/ai/summarize", json={"section_id": sid}).json()
    assert first["summary"] == "A short summary." and first["cached"] is False
    assert second["cached"] is True and len(calls) == 1


def test_paper_overview(data_client, paper_id, fake_llm):
    r = data_client.post("/ai/summarize", json={"paper_id": paper_id}).json()
    assert r["overview"] == "A study." and len(r["takeaways"]) == 3


def test_summarize_needs_exactly_one_target(data_client, fake_llm):
    assert data_client.post("/ai/summarize", json={}).status_code == 422
    assert data_client.post("/ai/summarize", json={"paper_id": 1, "section_id": 1}).status_code == 422


def test_ask_keeps_real_citations_only(data_client, paper_id, fake_llm):
    _, section = fake_llm
    sections = data_client.get(f"/papers/{paper_id}/sections").json()
    section["id"] = sections[1]["id"]
    r = data_client.post("/ai/ask", json={"paper_id": paper_id, "question": "How many users?"}).json()
    assert r["answered"] is True
    assert r["citations"] == [{"section_id": section["id"], "heading": "Methods", "quote": "12 screen reader users"}]


def test_ask_without_valid_citation_is_not_answered(data_client, paper_id, monkeypatch):
    monkeypatch.setattr(llm, "chat", lambda s, u, json_mode=False:
                        '{"answer": "Made up.", "answered": true, "citations": [{"section_id": 99999, "quote": "x"}]}')
    r = data_client.post("/ai/ask", json={"paper_id": paper_id, "question": "Anything?"}).json()
    assert r["answered"] is False and r["citations"] == []


def test_llm_down_returns_503(data_client, paper_id, monkeypatch):
    def boom(*a, **k):
        raise llm.LLMError("down")

    monkeypatch.setattr(llm, "chat", boom)
    assert data_client.post("/ai/ask", json={"paper_id": paper_id, "question": "Why?"}).status_code == 503
    assert data_client.get(f"/papers/{paper_id}/sections").status_code == 200  # reading still works


def test_ask_requires_ready_paper(data_client, db_session_factory):
    from app.core.db import Paper

    with db_session_factory() as db:
        p = Paper(source="upload", status="parsing")
        db.add(p)
        db.commit()
        pid = p.id
    assert data_client.post("/ai/ask", json={"paper_id": pid, "question": "Why?"}).status_code == 409


def test_language_is_passed_to_the_model_and_not_cached(data_client, paper_id, monkeypatch):
    seen = []

    def chat(system, user, json_mode=False):
        seen.append(system)
        return "ማጠቃለያ"

    monkeypatch.setattr(llm, "chat", chat)
    sid = data_client.get(f"/papers/{paper_id}/sections").json()[0]["id"]
    for _ in range(2):
        r = data_client.post("/ai/summarize", json={"section_id": sid, "lang": "am"}).json()
        assert r["summary"] == "ማጠቃለያ" and r["cached"] is False and r["lang"] == "am"
    assert len(seen) == 2 and all("Amharic" in s for s in seen)
    # English was never stored, so asking in English still calls the model once and then caches
    data_client.post("/ai/summarize", json={"section_id": sid})
    assert data_client.post("/ai/summarize", json={"section_id": sid}).json()["cached"] is True


def test_oromo_prompt_and_unanswered_message(data_client, paper_id, monkeypatch):
    seen = []

    def chat(system, user, json_mode=False):
        seen.append(system)
        return '{"answer": "x", "answered": true, "citations": []}'

    monkeypatch.setattr(llm, "chat", chat)
    r = data_client.post("/ai/ask", json={"paper_id": paper_id, "question": "Maaltu jira?", "lang": "om"}).json()
    assert "Afaan Oromoo" in seen[0]
    assert r["answered"] is False and r["answer"].startswith("Kutaan")
    assert data_client.post("/ai/ask", json={"paper_id": paper_id, "question": "Why?", "lang": "fr"}).status_code == 422
