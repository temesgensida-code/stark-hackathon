import fitz  # PyMuPDF


def make_two_column_pdf(path):
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 60), "Reading Papers By Ear", fontsize=22)
    left = ("1 Introduction\n" + "Left column sentence one. " * 12).split("\n")
    right = ("2 Methods\n" + "Right column sentence two. " * 12).split("\n")
    y = 120
    page.insert_text((72, y), left[0], fontsize=13, fontname="hebo")
    page.insert_textbox(fitz.Rect(72, y + 10, 280, 400), left[1], fontsize=10)
    page.insert_text((320, y), right[0], fontsize=13, fontname="hebo")
    page.insert_textbox(fitz.Rect(320, y + 10, 540, 400), right[1], fontsize=10)
    doc.save(path)


def upload(client, name, data):
    return client.post("/documents", files={"file": (name, data)})


def test_pdf_upload_orders_columns_and_finds_headings(data_client, tmp_path):
    pdf = tmp_path / "paper.pdf"
    make_two_column_pdf(pdf)
    r = upload(data_client, "paper.pdf", pdf.read_bytes())
    assert r.status_code == 202
    pid = r.json()["paper_id"]
    assert data_client.get(f"/documents/{pid}/status").json()["status"] == "ready"

    sections = data_client.get(f"/papers/{pid}/sections").json()
    headings = [s["heading"] for s in sections]
    assert headings.index("1 Introduction") < headings.index("2 Methods")
    intro = next(s for s in sections if s["heading"] == "1 Introduction")
    assert "Left column" in intro["text"] and "Right column" not in intro["text"]
    assert data_client.get(f"/papers/{pid}").json()["title"] == "Reading Papers By Ear"


def test_rejects_wrong_type_and_fake_pdf(data_client):
    assert upload(data_client, "notes.docx", b"x").status_code == 415
    assert upload(data_client, "fake.pdf", b"not a pdf").status_code == 422


def test_pdf_without_text_reports_failure(data_client, tmp_path):
    pdf = tmp_path / "blank.pdf"
    doc = fitz.open()
    doc.new_page()
    doc.save(pdf)
    pid = upload(data_client, "blank.pdf", pdf.read_bytes()).json()["paper_id"]
    status = data_client.get(f"/documents/{pid}/status").json()
    assert status["status"] == "failed" and "text layer" in status["error"]


def test_status_unknown_paper(data_client):
    assert data_client.get("/documents/42/status").status_code == 404


def test_markdown_sections():
    from app.documents.parser import sections_from_markdown

    doc = sections_from_markdown("# Title\n\nintro line\ncontinued\n\n## A\n\nbody a\n\n### A.1\n\nbody b")
    assert doc.title == "Title"
    assert [(s.heading, s.level) for s in doc.sections] == [("Title", 1), ("A", 1), ("A.1", 2)]
    assert doc.sections[0].text == "intro line continued"


def test_section_number_on_its_own_line_joins_the_title(tmp_path):
    from app.documents.parser import parse_pdf

    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 60), "A Study Of Reading", fontsize=22)
    y = 120
    for number, title, body in [("1", "Introduction", "We begin here. " * 20), ("2", "Methods", "We tested users. " * 20)]:
        page.insert_text((72, y), number, fontsize=11, fontname="hebo")
        page.insert_text((100, y + 14), title, fontsize=11, fontname="hebo")
        page.insert_textbox(fitz.Rect(72, y + 24, 540, y + 110), body, fontsize=10)
        y += 130
    path = tmp_path / "numbered.pdf"
    doc.save(path)
    headings = [s.heading for s in parse_pdf(str(path)).sections]
    assert "1 Introduction" in headings and "2 Methods" in headings
