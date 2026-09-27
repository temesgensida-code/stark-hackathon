"""Braille Talks API entry point."""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.braille.routes import router as braille_router

app = FastAPI(title="Braille Talks API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(braille_router)
# TODO: include papers, documents, ai and notes routers as they are built.


@app.get("/health")
def health():
    return {"status": "ok"}
