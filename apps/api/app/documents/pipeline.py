"""Parse -> store sections. Runs in a FastAPI background task or the Redis (RQ) worker.

Summaries are generated lazily by /ai/summarize and cached, so a paper becomes
readable as soon as parsing finishes (NFR-5, NFR-6).
"""

from __future__ import annotations

import os
import uuid

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import Paper, Section, SessionLocal
from app.documents import parser
from app.papers import scholarxiv


def _store(db: Session, paper: Paper, doc: parser.ParsedDocument) -> None:
    if not doc.sections:
        raise parser.ParseError("No readable text was found in this document.")
    paper.sections.clear()
    for i, s in enumerate(doc.sections):
        paper.sections.append(
            Section(order=i, heading=s.heading, level=s.level, text=s.text,
                    html=parser.section_html(s.heading, s.level, s.text))
        )
    # Uploads start with the file name as title; parsed titles are better. Scholarxiv metadata stays.
    if doc.title and (paper.source == "upload" or paper.title in ("", "Untitled")):
        paper.title = doc.title[:500]


def _parse(paper: Paper) -> parser.ParsedDocument:
    if paper.file_kind == "pdf":
        return parser.parse_pdf(paper.file_path)
    if paper.file_kind == "brf":
        return parser.parse_brf(paper.file_path)
    if paper.file_kind == "remote":
        # Scholarxiv returns metadata and an arXiv PDF link: download it and parse it like an upload.
        try:
            os.makedirs(get_settings().upload_dir, exist_ok=True)
            dest = os.path.join(get_settings().upload_dir, f"{uuid.uuid4().hex}.pdf")
            scholarxiv.download_pdf(paper.pdf_url or "", dest)
            paper.file_path = dest
            return parser.parse_pdf(dest)
        except (scholarxiv.ScholarxivError, parser.ParseError) as exc:
            if not paper.abstract:
                raise
            # Still let the user read and ask about the abstract; say plainly that it is partial.
            paper.error = f"Full text unavailable, showing the abstract only ({exc})"
            return parser.ParsedDocument(title=paper.title, sections=[parser.ParsedSection("Abstract", 1, paper.abstract)])
    raise parser.ParseError(f"Unknown document kind '{paper.file_kind}'.")


def run_parse(paper_id: int, session_factory=None) -> None:
    """Entry point for the worker. Opens its own session; never raises."""
    with (session_factory or SessionLocal)() as db:
        paper = db.get(Paper, paper_id)
        if paper is None:
            return
        try:
            paper.status, paper.progress, paper.error = "parsing", 10, None
            db.commit()
            doc = _parse(paper)
            paper.progress = 80
            _store(db, paper, doc)
            paper.status, paper.progress = "ready", 100
        except Exception as exc:  # surfaced to the user through /documents/{id}/status
            db.rollback()
            paper = db.get(Paper, paper_id)
            paper.status, paper.error = "failed", str(exc)
        db.commit()


def enqueue(paper_id: int, background_tasks=None) -> str:
    """Start parsing. Returns the job id (the paper id for inline jobs)."""
    settings = get_settings()
    if settings.job_backend == "rq":
        from redis import Redis
        from rq import Queue

        job = Queue("parse", connection=Redis.from_url(settings.redis_url)).enqueue(run_parse, paper_id)
        return job.id
    if background_tasks is not None:
        background_tasks.add_task(run_parse, paper_id)
    else:
        run_parse(paper_id)
    return str(paper_id)
