import os

import pytest

# Tests never use the developer's .env database or keys.
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["SCHOLARXIV_API_KEY"] = ""
os.environ["LLM_API_KEY"] = ""
os.environ["JOB_BACKEND"] = "inline"
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker


@pytest.fixture
def client():
    from app.main import app

    return TestClient(app)


@pytest.fixture
def db_session_factory(monkeypatch):
    """Fresh in-memory database per test, wired into the app and the parsing pipeline."""
    from app.core import db
    from app.documents import pipeline

    engine = db.make_engine("sqlite://")
    db.Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    monkeypatch.setattr(pipeline, "SessionLocal", factory)
    return factory


@pytest.fixture
def data_client(db_session_factory, tmp_path, monkeypatch):
    """Client for the data routers only (no Liblouis needed)."""
    from app.ai.routes import router as ai
    from app.core import db
    from app.core.config import get_settings
    from app.documents.routes import router as documents
    from app.notes.routes import router as notes
    from app.papers.routes import router as papers

    monkeypatch.setattr(get_settings(), "upload_dir", str(tmp_path))
    app = FastAPI()
    for r in (papers, documents, ai, notes):
        app.include_router(r)

    def override():
        with db_session_factory() as s:
            yield s

    app.dependency_overrides[db.get_db] = override
    return TestClient(app)


@pytest.fixture
def paper_id(db_session_factory):
    """A ready paper with three sections."""
    from app.core.db import Paper, Section
    from app.documents.parser import section_html

    rows = [("Abstract", "We study PDF accessibility."), ("Methods", "We tested 12 screen reader users."),
            ("Results", "Tagged PDFs were 40% faster.")]
    with db_session_factory() as db:
        p = Paper(source="upload", title="Screen readers and PDFs", status="ready", progress=100)
        p.sections = [Section(order=i, heading=h, level=1, text=t, html=section_html(h, 1, t))
                      for i, (h, t) in enumerate(rows)]
        db.add(p)
        db.commit()
        return p.id
