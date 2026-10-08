"""Scholarxiv Papers API client: search papers, fetch metadata, download the PDF.

Verified against https://www.scholarxiv.com/developers/docs/papers-api (2026-10-06):
  base      https://www.scholarxiv.com/api/v1 (the bare domain 307-redirects to www, which drops auth), header "Authorization: Bearer sxv_..."
  search    GET /papers/search?q=&page=&limit=   (q matches titles)
            POST /papers/search {"searchFilterString": {"id": ...}, "limit": n}
  response  {"data": [paper], "pagination": {...}}
  paper     id (arXiv URL), extractedID, title, summary, authors[], published, pdfLink, ...
The docs list no get-by-id or full-text endpoint, so full text comes from the
paper's `pdfLink` (arXiv), which the documents pipeline parses locally.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from urllib.parse import urlparse

import httpx

from app.core.config import get_settings


class ScholarxivError(Exception):
    pass


@dataclass
class PaperMeta:
    external_id: str
    title: str
    authors: list[str] = field(default_factory=list)
    year: int | None = None
    abstract: str = ""
    pdf_url: str | None = None


def _normalize(raw: dict) -> PaperMeta:
    published = str(raw.get("published") or "")
    return PaperMeta(
        external_id=str(raw.get("extractedID") or raw.get("id") or ""),
        title=" ".join((raw.get("title") or "Untitled").split()),
        authors=[str(a) for a in raw.get("authors") or []],
        year=int(published[:4]) if published[:4].isdigit() else None,
        abstract=" ".join((raw.get("summary") or "").split()),
        pdf_url=raw.get("pdfLink") or None,
    )


def _client() -> httpx.Client:
    s = get_settings()
    if not s.scholarxiv_api_key:
        raise ScholarxivError("SCHOLARXIV_API_KEY is not set.")
    return httpx.Client(
        base_url=s.scholarxiv_api_url,
        headers={"Authorization": f"Bearer {s.scholarxiv_api_key}"},
        timeout=20,
    )


def _request(method: str, path: str, **kwargs) -> list[dict]:
    try:
        with _client() as c:
            r = c.request(method, path, **kwargs)
            if r.status_code == 429:
                raise ScholarxivError(f"Scholarxiv rate limit reached; retry in {r.headers.get('Retry-After', '?')}s.")
            if r.status_code in (401, 403):
                raise ScholarxivError("Scholarxiv rejected the API key.")
            r.raise_for_status()
            return r.json().get("data", [])
    except httpx.HTTPError as exc:
        raise ScholarxivError(f"Scholarxiv request failed: {exc}") from exc


def search(query: str, limit: int = 10) -> list[PaperMeta]:
    return [_normalize(p) for p in _request("GET", "/papers/search", params={"q": query, "limit": limit})]


def get_paper(external_id: str) -> PaperMeta:
    rows = _request("POST", "/papers/search", json={"searchFilterString": {"id": external_id}, "limit": 1})
    if not rows:
        raise ScholarxivError(f"Scholarxiv has no paper '{external_id}'.")
    return _normalize(rows[0])


def download_pdf(pdf_url: str, dest: str) -> None:
    """Save a paper's PDF. Only https arXiv links are fetched (the URL comes from an external API)."""
    parsed = urlparse(pdf_url)
    host = parsed.hostname or ""
    if parsed.scheme != "https" or not (host == "arxiv.org" or host.endswith(".arxiv.org")):
        raise ScholarxivError("Refusing to download a PDF from an unexpected address.")
    r = None
    for attempt in range(3):  # transient DNS or network errors are common in containers
        try:
            r = httpx.get(pdf_url, follow_redirects=True, timeout=60)
            r.raise_for_status()
            break
        except httpx.HTTPError as exc:
            if attempt == 2 or (isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code < 500):
                raise ScholarxivError(f"Could not download the PDF: {exc}") from exc
            time.sleep(1 + attempt)
    if not r.content.startswith(b"%PDF"):
        raise ScholarxivError("The downloaded file is not a PDF.")
    with open(dest, "wb") as fh:
        fh.write(r.content)
