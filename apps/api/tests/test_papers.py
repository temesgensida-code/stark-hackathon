from app.papers import scholarxiv


def test_sections_and_navigation_flags(data_client, paper_id):
    paper = data_client.get(f"/papers/{paper_id}").json()
    assert [s["heading"] for s in paper["sections"]] == ["Abstract", "Methods", "Results"]
    assert "text" not in paper["sections"][0]

    first, last = paper["sections"][0]["id"], paper["sections"][2]["id"]
    a = data_client.get(f"/papers/{paper_id}/sections/{first}").json()
    assert a["has_previous"] is False and a["has_next"] is True and "<h2>" in a["html"]
    assert data_client.get(f"/papers/{paper_id}/sections/{last}").json()["has_next"] is False
    assert data_client.get(f"/papers/{paper_id}/sections/9999").status_code == 404


def test_search_shortens_abstract(data_client, monkeypatch):
    monkeypatch.setattr(scholarxiv, "search", lambda q, n: [
        scholarxiv.PaperMeta("a1", "Reading PDFs", ["Ada"], 2024, "We study PDFs. We found more.")])
    r = data_client.get("/papers/search?q=pdf").json()
    assert r[0]["abstract_short"] == "We study PDFs."


def test_search_degrades_when_scholarxiv_is_down(data_client, monkeypatch):
    def boom(q, n):
        raise scholarxiv.ScholarxivError("down")

    monkeypatch.setattr(scholarxiv, "search", boom)
    assert data_client.get("/papers/search?q=pdf").status_code == 503


def _fake_download(monkeypatch, tmp_path):
    from tests.test_documents import make_two_column_pdf

    def download(url, dest):
        assert url == "https://arxiv.org/pdf/2401.01234v1"
        make_two_column_pdf(dest)

    monkeypatch.setattr(scholarxiv, "download_pdf", download)


def _meta(i="2401.01234v1", abstract="Abs."):
    return scholarxiv.PaperMeta(i, "Remote", ["Bo"], 2024, abstract, "https://arxiv.org/pdf/2401.01234v1")


def test_import_downloads_and_parses_pdf(data_client, monkeypatch, tmp_path):
    monkeypatch.setattr(scholarxiv, "get_paper", lambda i: _meta(i))
    _fake_download(monkeypatch, tmp_path)
    r = data_client.post("/papers/import", json={"external_id": "2401.01234v1"})
    assert r.status_code == 202
    pid = r.json()["paper_id"]
    assert data_client.get(f"/documents/{pid}/status").json() == {"paper_id": pid, "status": "ready", "progress": 100, "error": None}
    paper = data_client.get(f"/papers/{pid}").json()
    assert paper["title"] == "Remote"  # Scholarxiv metadata wins over the parsed title
    assert "1 Introduction" in [s["heading"] for s in paper["sections"]]
    # importing the same paper again reuses it
    assert data_client.post("/papers/import", json={"external_id": "2401.01234v1"}).json()["paper_id"] == pid


def test_import_falls_back_to_abstract_when_pdf_fails(data_client, monkeypatch):
    monkeypatch.setattr(scholarxiv, "get_paper", lambda i: _meta(i, "Only the abstract."))

    def no_pdf(url, dest):
        raise scholarxiv.ScholarxivError("blocked")

    monkeypatch.setattr(scholarxiv, "download_pdf", no_pdf)
    pid = data_client.post("/papers/import", json={"external_id": "x2"}).json()["paper_id"]
    status = data_client.get(f"/documents/{pid}/status").json()
    assert status["status"] == "ready" and "abstract only" in status["error"]
    assert data_client.get(f"/papers/{pid}/sections").json()[0]["text"] == "Only the abstract."


def test_reimport_retries_full_text_after_abstract_only(data_client, monkeypatch, tmp_path):
    monkeypatch.setattr(scholarxiv, "get_paper", lambda i: _meta(i, "Only the abstract."))
    monkeypatch.setattr(scholarxiv, "download_pdf", lambda u, d: (_ for _ in ()).throw(scholarxiv.ScholarxivError("dns")))
    pid = data_client.post("/papers/import", json={"external_id": "x3"}).json()["paper_id"]
    assert len(data_client.get(f"/papers/{pid}").json()["sections"]) == 1

    _fake_download(monkeypatch, tmp_path)  # the network is back
    assert data_client.post("/papers/import", json={"external_id": "x3"}).json()["paper_id"] == pid
    assert len(data_client.get(f"/papers/{pid}").json()["sections"]) > 1
    assert data_client.get(f"/documents/{pid}/status").json()["error"] is None


def test_normalize_matches_documented_fields():
    p = scholarxiv._normalize({
        "id": "http://arxiv.org/abs/2401.01234v1", "extractedID": "2401.01234v1", "title": "Deep\n Reading",
        "summary": "We read.\n More.", "authors": ["A B", "C D"], "published": "2024-01-02T00:00:00Z",
        "pdfLink": "https://arxiv.org/pdf/2401.01234v1"})
    assert (p.external_id, p.title, p.year, p.abstract) == ("2401.01234v1", "Deep Reading", 2024, "We read. More.")
    assert p.authors == ["A B", "C D"] and p.pdf_url.endswith("2401.01234v1")


def test_client_uses_documented_urls_and_envelope(monkeypatch):
    import httpx

    seen = {}

    def handler(request: httpx.Request):
        seen["url"], seen["auth"] = str(request.url), request.headers["authorization"]
        return httpx.Response(200, json={"data": [{"extractedID": "1", "title": "T"}], "pagination": {}})

    monkeypatch.setattr(scholarxiv, "_client", lambda: httpx.Client(
        base_url="https://scholarxiv.com/api/v1", headers={"Authorization": "Bearer sxv_x"},
        transport=httpx.MockTransport(handler)))
    assert scholarxiv.search("pdf", 5)[0].external_id == "1"
    assert seen["url"] == "https://scholarxiv.com/api/v1/papers/search?q=pdf&limit=5"
    assert seen["auth"] == "Bearer sxv_x"


def test_download_only_from_arxiv():
    import pytest

    for bad in ("http://arxiv.org/pdf/1", "https://evil.example/a.pdf", "https://arxiv.org.evil.example/a.pdf"):
        with pytest.raises(scholarxiv.ScholarxivError):
            scholarxiv.download_pdf(bad, "x.pdf")


def test_delete_paper(data_client, paper_id):
    assert data_client.delete(f"/papers/{paper_id}").status_code == 204
    assert data_client.get(f"/papers/{paper_id}").status_code == 404
