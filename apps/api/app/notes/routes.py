"""Routes: CRUD for notes typed by keyboard, voice or Braille, plus export."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.db import Note, Paper, Section, get_db

router = APIRouter(prefix="/notes", tags=["notes"])

Source = Literal["keyboard", "voice", "braille"]


class NoteIn(BaseModel):
    paper_id: int
    section_id: int | None = None
    text: str = Field(..., min_length=1, max_length=10_000)
    source: Source = "keyboard"


class NotePatch(BaseModel):
    text: str = Field(..., min_length=1, max_length=10_000)


def _out(n: Note) -> dict:
    return {"id": n.id, "paper_id": n.paper_id, "section_id": n.section_id, "text": n.text,
            "source": n.source, "created_at": n.created_at, "updated_at": n.updated_at}


def _get(db: Session, note_id: int) -> Note:
    note = db.get(Note, note_id)
    if note is None:
        raise HTTPException(404, "Note not found.")
    return note


@router.get("")
def list_notes(paper_id: int | None = None, section_id: int | None = None, db: Session = Depends(get_db)):
    q = db.query(Note)
    if paper_id is not None:
        q = q.filter(Note.paper_id == paper_id)
    if section_id is not None:
        q = q.filter(Note.section_id == section_id)
    return [_out(n) for n in q.order_by(Note.created_at).all()]


@router.post("", status_code=201)
def create_note(body: NoteIn, db: Session = Depends(get_db)):
    if db.get(Paper, body.paper_id) is None:
        raise HTTPException(404, "Paper not found.")
    if body.section_id is not None:
        section = db.get(Section, body.section_id)
        if section is None or section.paper_id != body.paper_id:
            raise HTTPException(422, "That section does not belong to this paper.")
    note = Note(**body.model_dump())
    db.add(note)
    db.commit()
    return _out(note)


@router.get("/export")
def export_notes(paper_id: int, format: Literal["txt", "brf"] = Query("txt"), table: str = "en-ueb-g2",
                 db: Session = Depends(get_db)):
    paper = db.get(Paper, paper_id)
    if paper is None:
        raise HTTPException(404, "Paper not found.")
    headings = {s.id: s.heading for s in paper.sections}
    notes = db.query(Note).filter_by(paper_id=paper_id).order_by(Note.created_at).all()
    blocks = [f"Notes on: {paper.title}"]
    for i, n in enumerate(notes, 1):
        cite = f" (section: {headings[n.section_id]})" if n.section_id in headings else ""
        blocks.append(f"{i}. {n.text}{cite}")
    text = "\n\n".join(blocks)
    if format == "txt":
        return PlainTextResponse(text)
    from app.braille import service as braille  # needs Liblouis

    try:
        data = braille.to_brf(text, table)
    except braille.UnknownTable as exc:
        raise HTTPException(422, str(exc))
    return Response(data.encode("ascii"), media_type="application/x-brf",
                    headers={"Content-Disposition": 'attachment; filename="notes.brf"'})


@router.get("/{note_id}")
def get_note(note_id: int, db: Session = Depends(get_db)):
    return _out(_get(db, note_id))


@router.patch("/{note_id}")
def update_note(note_id: int, body: NotePatch, db: Session = Depends(get_db)):
    note = _get(db, note_id)
    note.text = body.text
    db.commit()
    return _out(note)


@router.delete("/{note_id}", status_code=204)
def delete_note(note_id: int, db: Session = Depends(get_db)):
    db.delete(_get(db, note_id))
    db.commit()
