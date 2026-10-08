"""Routes: POST /ai/summarize, POST /ai/ask. Summaries are cached on the database rows (NFR-4)."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session

from app.ai import llm
from app.core.db import Paper, Section, get_db

router = APIRouter(prefix="/ai", tags=["ai"])


Lang = Literal["en", "am", "om"]

NOT_FOUND = {
    "en": "I could not find a section of this paper that clearly answers that.",
    "am": "ይህን ጥያቄ በግልጽ የሚመልስ የጽሑፉ ክፍል አላገኘሁም።",
    "om": "Kutaan barruu kanaa gaaffii kana ifatti deebisu hin argamne.",
}


class SummarizeIn(BaseModel):
    paper_id: int | None = None
    section_id: int | None = None
    lang: Lang = "en"

    @model_validator(mode="after")
    def one_target(self):
        if (self.paper_id is None) == (self.section_id is None):
            raise ValueError("Send exactly one of 'paper_id' or 'section_id'.")
        return self


class AskIn(BaseModel):
    paper_id: int
    question: str = Field(..., min_length=3, max_length=1000)
    lang: Lang = "en"


def _ready_paper(db: Session, paper_id: int) -> Paper:
    paper = db.get(Paper, paper_id)
    if paper is None:
        raise HTTPException(404, "Paper not found.")
    if paper.status != "ready":
        raise HTTPException(409, f"This paper is not ready yet (status: {paper.status}).")
    return paper


@router.post("/summarize")
def summarize(body: SummarizeIn, db: Session = Depends(get_db)):
    try:
        if body.section_id is not None:
            section = db.get(Section, body.section_id)
            if section is None:
                raise HTTPException(404, "Section not found.")
            if body.lang != "en":  # only English is cached on the row
                summary = llm.summarize_section(section.heading, section.text, body.lang)
                return {"section_id": section.id, "summary": summary, "cached": False, "lang": body.lang}
            cached = section.summary is not None
            if not cached:
                section.summary = llm.summarize_section(section.heading, section.text)
                db.commit()
            return {"section_id": section.id, "summary": section.summary, "cached": cached, "lang": "en"}

        paper = _ready_paper(db, body.paper_id)
        if body.lang != "en":
            ov = llm.overview(paper.title, [(s.heading, s.text) for s in paper.sections], body.lang)
            return {"paper_id": paper.id, **ov, "cached": False, "lang": body.lang}
        cached = paper.overview is not None
        if not cached:
            paper.overview = llm.overview(paper.title, [(s.heading, s.text) for s in paper.sections])
            db.commit()
        return {"paper_id": paper.id, **paper.overview, "cached": cached, "lang": "en"}
    except llm.LLMError as exc:
        raise HTTPException(503, str(exc))  # reading and Braille keep working (NFR-6)


@router.post("/ask")
def ask(body: AskIn, db: Session = Depends(get_db)):
    paper = _ready_paper(db, body.paper_id)
    sections = [(s.id, s.heading, s.text) for s in paper.sections]
    try:
        result = llm.answer(body.question, sections, body.lang)
    except llm.LLMError as exc:
        raise HTTPException(503, str(exc))
    headings = {s.id: s.heading for s in paper.sections}
    # Drop citations the model invented, then require one for any positive answer (AD-4).
    result["citations"] = [
        {"section_id": c["section_id"], "heading": headings[c["section_id"]], "quote": str(c.get("quote", ""))}
        for c in result["citations"] if c["section_id"] in headings
    ]
    if result["answered"] and not result["citations"]:
        result["answered"] = False
        result["answer"] = NOT_FOUND[body.lang]
    return result
