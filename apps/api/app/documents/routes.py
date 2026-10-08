"""Routes: POST /documents (upload PDF or BRF), GET /documents/{id}/status."""

from __future__ import annotations

import os
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import Paper, get_db
from app.documents import pipeline

router = APIRouter(prefix="/documents", tags=["documents"])

KINDS = {".pdf": "pdf", ".brf": "brf"}


@router.post("", status_code=202)
async def upload(file: UploadFile, background: BackgroundTasks, db: Session = Depends(get_db)):
    settings = get_settings()
    name = file.filename or "upload"
    kind = KINDS.get(os.path.splitext(name)[1].lower())
    if kind is None:
        raise HTTPException(415, "Upload a .pdf or a .brf file.")
    data = await file.read()
    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"File is larger than {settings.max_upload_mb} MB.")
    if kind == "pdf" and not data.startswith(b"%PDF"):
        raise HTTPException(422, "This file is not a valid PDF.")

    os.makedirs(settings.upload_dir, exist_ok=True)
    path = os.path.join(settings.upload_dir, f"{uuid.uuid4().hex}.{kind}")
    with open(path, "wb") as fh:
        fh.write(data)

    paper = Paper(source="upload", title=os.path.splitext(name)[0][:500], file_path=path, file_kind=kind)
    db.add(paper)
    db.commit()
    job_id = pipeline.enqueue(paper.id, background)
    return {"paper_id": paper.id, "job_id": job_id}


@router.get("/{paper_id}/status")
def status(paper_id: int, db: Session = Depends(get_db)):
    paper = db.get(Paper, paper_id)
    if paper is None:
        raise HTTPException(404, "Paper not found.")
    return {"paper_id": paper.id, "status": paper.status, "progress": paper.progress, "error": paper.error}
