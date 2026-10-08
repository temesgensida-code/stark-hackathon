"""Check the real Scholarxiv connection with your key. Run from apps/api:

    python -m scripts.check_scholarxiv "screen readers"

Exercises the three calls the backend depends on: Papers search, paper lookup by id, and a Router completion.
"""

import sys

from app.ai import llm
from app.core.config import get_settings
from app.papers import scholarxiv


def step(name, fn):
    try:
        out = fn()
        print(f"OK    {name}: {out}")
        return out
    except Exception as exc:  # report every failure, keep going
        print(f"FAIL  {name}: {exc}")


def main():
    s = get_settings()
    if not s.scholarxiv_api_key.startswith("sxv_") or s.scholarxiv_api_key == "sxv_...":
        sys.exit("Set SCHOLARXIV_API_KEY=sxv_... in .env (apps/api or the repo root) first.")
    query = sys.argv[1] if len(sys.argv) > 1 else "screen readers"
    results = step("search", lambda: [f"{p.external_id} {p.title[:50]!r}" for p in scholarxiv.search(query, 3)])
    if results:
        ext_id = results[0].split()[0]
        step("get_paper", lambda: (lambda p: f"{p.title[:50]!r} year={p.year} pdf={p.pdf_url}")(scholarxiv.get_paper(ext_id)))
    step("router completion", lambda: llm.chat("Reply with one word.", "Say ready."))


if __name__ == "__main__":
    main()
