"""Braille Talks API entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.ai.routes import router as ai_router
from app.braille.routes import router as braille_router
from app.core.config import get_settings
from app.core.db import init_db
from app.documents.routes import router as documents_router
from app.notes.routes import router as notes_router
from app.papers.routes import router as papers_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()  # creates tables on first start; switch to Alembic when the schema needs migrations
    yield


app = FastAPI(title="Braille Talks API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins.split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(braille_router)
app.include_router(papers_router)
app.include_router(documents_router)
app.include_router(ai_router)
app.include_router(notes_router)


@app.get("/health")
def health():
    return {"status": "ok"}
