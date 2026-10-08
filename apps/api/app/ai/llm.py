"""OpenAI-compatible LLM client (Scholarxiv Router by default): section summaries, takeaways, Q&A with section citations.

One plain chat-completions call per feature; no agent framework is needed (AD-5).
"""

from __future__ import annotations

import json
import re

import httpx

from app.core.config import get_settings


class LLMError(Exception):
    pass


MAX_CONTEXT_CHARS = 60_000


def chat(system: str, user: str, json_mode: bool = False) -> str:
    s = get_settings()
    key = s.llm_api_key or s.scholarxiv_api_key
    if not key:
        raise LLMError("LLM_API_KEY (or SCHOLARXIV_API_KEY) is not set.")
    body: dict = {
        "model": s.llm_model,
        "temperature": 0.2,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
    }
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    try:
        r = httpx.post(f"{s.llm_base_url.rstrip('/')}/chat/completions", json=body, timeout=60,
                       headers={"Authorization": f"Bearer {key}", "x-api-key": key})
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"].strip()
    except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
        raise LLMError(f"The language model is unavailable: {exc}") from exc


def _parse_json(raw: str) -> dict:
    raw = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.M).strip()
    start, end = raw.find("{"), raw.rfind("}")  # tolerate text around the JSON object
    try:
        data = json.loads(raw[start:end + 1])
        if not isinstance(data, dict):
            raise ValueError("not an object")
        return data
    except ValueError as exc:
        raise LLMError(f"The model returned an unreadable answer: {raw[:120]!r}") from exc


LANGUAGES = {
    "en": "",
    "am": " Write the reply in Amharic, in Ethiopic (Ge'ez) script.",
    "om": " Write the reply in Afaan Oromoo, in Latin (Qubee) script.",
}


def _lang(lang: str) -> str:
    return LANGUAGES.get(lang, "")


def summarize_section(heading: str, text: str, lang: str = "en") -> str:
    return chat(
        "You summarize one section of an academic paper for a blind reader who hears the result. "
        "Write 2 to 4 plain sentences. No markdown, no bullet points, no preamble." + _lang(lang),
        f"Section: {heading}\n\n{text[:MAX_CONTEXT_CHARS]}",
    )


def overview(title: str, sections: list[tuple[str, str]], lang: str = "en") -> dict:
    body = "\n\n".join(f"## {h}\n{t[:4000]}" for h, t in sections)[:MAX_CONTEXT_CHARS]
    data = _parse_json(chat(
        "You summarize academic papers for a blind reader who hears the result. Reply as JSON: "
        '{"overview": "2-3 plain sentences", "takeaways": ["3 to 5 short plain sentences"]}.' + _lang(lang),
        f"Title: {title}\n\n{body}", json_mode=True))
    return {"overview": str(data.get("overview", "")), "takeaways": [str(t) for t in data.get("takeaways", [])][:5]}


def answer(question: str, sections: list[tuple[int, str, str]], lang: str = "en") -> dict:
    """sections: (id, heading, text). Returns {answer, answered, citations:[{section_id, quote}]}."""
    body = "\n\n".join(f"[section {sid}] {h}\n{t[:6000]}" for sid, h, t in sections)[:MAX_CONTEXT_CHARS]
    data = _parse_json(chat(
        "Answer the question using ONLY the paper sections provided. Every claim must cite the section id it came "
        "from. If the paper does not answer the question, set answered to false and say so plainly. Reply as JSON: "
        '{"answer": "plain sentences", "answered": true|false, '
        '"citations": [{"section_id": <int>, "quote": "short exact quote in the original language"}]}.'
        + _lang(lang),
        f"Question: {question}\n\n{body}", json_mode=True))
    return {"answer": str(data.get("answer", "")), "answered": bool(data.get("answered", False)),
            "citations": [c for c in data.get("citations", []) if isinstance(c, dict) and "section_id" in c]}
