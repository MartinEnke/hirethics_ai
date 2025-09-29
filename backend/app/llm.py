# backend/app/llm.py
import os, json, math
from typing import Any, Dict, List, Optional
from openai import OpenAI

def _client() -> Optional[OpenAI]:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        return None
    return OpenAI(api_key=api_key)

def llm_available() -> bool:
    return _client() is not None

def score_with_llm(
    job: Dict[str, Any],
    cv_text: str,
    model: Optional[str] = None,
    temperature: float = 0.1,
    timeout: Optional[float] = 30.0,
) -> List[Dict[str, Any]]:
    """
    Returns a list of {key, score, evidence_span, rationale} dicts.
    Never raises: on any failure, throws ValueError which you can catch to fallback.
    """
    cli = _client()
    if cli is None:
        raise ValueError("OPENAI_API_KEY missing")

    rubric = job.get("rubric", [])
    model = model or os.getenv("OPENAI_MODEL", "gpt-4o-mini")

    # Build a compact rubric string the model can follow deterministically
    rubric_lines = []
    for r in rubric:
        rubric_lines.append(f"- {r['key']}: weight={r.get('weight', 0)} desc={r.get('description','')}")
    rubric_txt = "\n".join(rubric_lines)

    system = (
        "You are an AI hiring evaluator. Score a candidate on the given rubric.\n"
        "Rules:\n"
        "• Only use evidence from the provided CV text.\n"
        "• For EACH rubric key, produce a score from 0.0–5.0 (step 0.5), an evidence_span (<= 240 chars), and a brief rationale.\n"
        "• Output STRICT JSON with this structure and ONLY that JSON:\n"
        '{ "by_criterion": [ { "key": "<rubric-key>", "score": 0.0, "evidence_span": "", "rationale": "" }, ... ] }'
    )

    user = (
        f"Job Title: {job.get('title','(unknown)')}\n"
        f"Rubric:\n{rubric_txt}\n\n"
        f"Candidate CV:\n\"\"\"\n{cv_text}\n\"\"\"\n\n"
        "Return JSON for ALL rubric keys, in the same order."
    )

    # Use Chat Completions JSON mode to force valid JSON
    # Ref: response_format={"type": "json_object"} :contentReference[oaicite:2]{index=2}
    resp = cli.chat.completions.create(
        model=model,
        temperature=0,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        timeout=timeout,
    )

    raw = resp.choices[0].message.content or ""
    try:
        data = json.loads(raw)
    except Exception as e:
        raise ValueError(f"Invalid JSON from model: {e}")

    items = data.get("by_criterion")
    if not isinstance(items, list):
        raise ValueError("Missing 'by_criterion' array in model output")

    # Normalize: ensure each rubric key is present; clamp and round scores
    by: List[Dict[str, Any]] = []
    rubric_keys = [r["key"] for r in rubric]
    got = {str(it.get("key")): it for it in items if isinstance(it, dict)}

    for k in rubric_keys:
        it = got.get(k) or {}
        score = it.get("score", 0)
        try:
            score = float(score)
        except Exception:
            score = 0.0

        # clamp 0..5 in 0.5 steps
        score = max(0.0, min(5.0, round(score * 2) / 2))

        by.append({
            "key": k,
            "score": score,
            "evidence_span": str(it.get("evidence_span", ""))[:240],
            "rationale": str(it.get("rationale", ""))[:400],
        })

    return by
