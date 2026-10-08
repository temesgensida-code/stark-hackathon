"""Routes: search Scholarxiv, import a paper, list papers, read sections."""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.db import Paper, Section, get_db
from app.documents import pipeline
from app.papers import scholarxiv

router = APIRouter(prefix="/papers", tags=["papers"])


class ImportIn(BaseModel):
    external_id: str


def _short(text: str) -> str:
    """One-sentence abstract for results read aloud (FR-1)."""
    first = text.strip().split(". ")[0].strip()
    return first if first.endswith(".") or not first else first + "."


def _paper_out(p: Paper) -> dict:
    return {"id": p.id, "title": p.title, "authors": p.authors, "year": p.year, "status": p.status,
            "source": p.source, "abstract": p.abstract}


def _section_out(s: Section, full: bool = True) -> dict:
    out = {"id": s.id, "order": s.order, "heading": s.heading, "level": s.level}
    if full:
        out |= {"text": s.text, "html": s.html}
    return out


def _get_paper(db: Session, paper_id: int) -> Paper:
    paper = db.get(Paper, paper_id)
    if paper is None:
        raise HTTPException(404, "Paper not found.")
    return paper


@router.get("/search")
def search(q: str = Query(..., min_length=2), limit: int = Query(10, ge=1, le=25)):
    try:
        results = scholarxiv.search(q, limit)
    except scholarxiv.ScholarxivError as exc:
        raise HTTPException(503, str(exc))  # reading uploaded papers still works (NFR-6)
    return [{"external_id": r.external_id, "title": r.title, "authors": r.authors, "year": r.year,
             "abstract_short": _short(r.abstract)} for r in results]


@router.post("/import", status_code=202)
def import_paper(body: ImportIn, background: BackgroundTasks, db: Session = Depends(get_db)):
    existing = db.query(Paper).filter_by(source="scholarxiv", external_id=body.external_id).first()
    if existing:
        if existing.error:  # earlier attempt only got the abstract: try the full text again
            existing.status, existing.error = "pending", None
            db.commit()
            return {"paper_id": existing.id, "job_id": pipeline.enqueue(existing.id, background)}
        return {"paper_id": existing.id, "job_id": str(existing.id)}
    try:
        meta = scholarxiv.get_paper(body.external_id)
    except scholarxiv.ScholarxivError as exc:
        raise HTTPException(503, str(exc))
    paper = Paper(source="scholarxiv", external_id=body.external_id, title=meta.title, authors=meta.authors,
                  year=meta.year, abstract=meta.abstract, pdf_url=meta.pdf_url, file_kind="remote")
    db.add(paper)
    db.commit()
    return {"paper_id": paper.id, "job_id": pipeline.enqueue(paper.id, background)}


@router.get("")
def list_papers(db: Session = Depends(get_db)):
    return [_paper_out(p) for p in db.query(Paper).order_by(Paper.created_at.desc()).all()]


@router.get("/{paper_id}")
def get_paper(paper_id: int, db: Session = Depends(get_db)):
    paper = _get_paper(db, paper_id)
    return _paper_out(paper) | {"sections": [_section_out(s, full=False) for s in paper.sections]}


@router.get("/{paper_id}/sections")
def list_sections(paper_id: int, db: Session = Depends(get_db)):
    return [_section_out(s) for s in _get_paper(db, paper_id).sections]


@router.get("/{paper_id}/sections/{section_id}")
def get_section(paper_id: int, section_id: int, db: Session = Depends(get_db)):
    section = db.get(Section, section_id)
    if section is None or section.paper_id != paper_id:
        raise HTTPException(404, "Section not found.")
    paper = section.paper
    last = paper.sections[-1].order if paper.sections else 0
    return _section_out(section) | {"has_previous": section.order > 0, "has_next": section.order < last}


@router.delete("/{paper_id}", status_code=204)
def delete_paper(paper_id: int, db: Session = Depends(get_db)):
    db.delete(_get_paper(db, paper_id))
    db.commit()
