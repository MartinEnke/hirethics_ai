# backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uuid, re
from typing import Any, Tuple, Dict, List
from pathlib import Path
from dotenv import load_dotenv

from app.llm import llm_available, score_with_llm

# --- Load backend/.env no matter where uvicorn is launched from
ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(dotenv_path=ENV_PATH, override=False)

API_PREFIX = "/api/v1"

# ----- In-memory stores (MVP) -----
_JOBS: Dict[str, Dict] = {}
_CANDIDATES: Dict[str, Dict] = {}

# ----- Schemas -----
class RubricItem(BaseModel):
    key: str
    weight: float
    description: str

class JobCreate(BaseModel):
    title: str
    description: str
    rubric: List[RubricItem]

class JobOut(BaseModel):
    job_id: str

class CandidateIn(BaseModel):
    cv_text: str
    artifacts: dict | None = None
    counterfactual_of: str | None = None

class CandidateBatchIn(BaseModel):
    job_id: str
    candidates: List[CandidateIn]

class CandidateBatchOut(BaseModel):
    candidate_ids: List[str]

class CriterionScore(BaseModel):
    key: str
    score: float
    evidence_span: str
    rationale: str

class CandidateScore(BaseModel):
    candidate_id: str
    total: float
    by_criterion: List[CriterionScore]

class ScoreRunIn(BaseModel):
    job_id: str
    candidate_ids: List[str]
    mode: str = "sync"

class EthicsFlag(BaseModel):
    candidate_id: str
    type: str
    severity: str
    message: str
    details: dict | None = None

class ScoreRunOut(BaseModel):
    batch_id: str
    scores: List[CandidateScore]
    ethics_flags: List[EthicsFlag]

# ----- App setup -----
app = FastAPI(title="Hirethics AI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get(f"{API_PREFIX}/ping")
def ping():
    return {"ok": True}

# ----- Tunables -----
BLINDING_DELTA_THRESHOLD: float = 0.25
PRESTIGE_BONUS: float = 0.30

UNIV_PATTERN = r"\b[A-Z][a-zA-Z]+ (University|College|Institute)\b"
PRESTIGE_TOKENS = [r"\bMIT\b", r"\bStanford\b", r"\bHarvard\b", r"\bOxford\b", r"\bCambridge\b"]
PRESTIGE_PATTERNS = PRESTIGE_TOKENS + [UNIV_PATTERN]

# ----- Helpers -----
def blind_text(t: str) -> str:
    t = re.sub(r"\b[A-Z][a-z]+ [A-Z][a-z]+\b", "<NAME>", t)                # naive full name
    t = re.sub(r"\S+@\S+", "<EMAIL>", t)                                   # email
    t = re.sub(r"\+?\d[\d\-\s()]{7,}\d", "<PHONE>", t)                     # phone
    t = re.sub(UNIV_PATTERN, "<SCHOOL>", t)                                # institutions
    for tok in PRESTIGE_TOKENS:
        t = re.sub(tok, "<SCHOOL>", t)
    return t

def find_evidence_span(text: str, keywords: List[str], fallback: str) -> str:
    for sent in re.split(r"(?<=[.!?])\s+", text):
        for kw in keywords:
            if kw.lower() in sent.lower():
                return sent.strip()[:280]
    return fallback

def prestige_tokens_in(text: str) -> List[str]:
    hits: List[str] = []
    for pat in PRESTIGE_PATTERNS:
        for m in re.finditer(pat, text, flags=re.I):
            hits.append(m.group(0))
    return hits

def heuristic_scores_from_cv(cv_text: str, job: dict | None = None) -> Tuple[List[CriterionScore], Dict[str, Any]]:
    """
    Heuristic scorer that covers all rubric keys (if provided), in rubric order.
    """
    debug: Dict[str, Any] = {"prestige_hits": [], "prestige_bonus": 0.0}

    # Signal detection
    has_sys  = bool(re.search(r"microservice|multi-tenant|scalable|throughput", cv_text, re.I))
    has_prod = bool(re.search(r"on-?call|SLO|incident|uptime|99\.\d{1,2}", cv_text, re.I))
    has_tests = bool(re.search(r"unit test|pytest|testing|coverage|lint|CI/?CD", cv_text, re.I))
    has_lang = bool(re.search(r"\b(Python|Go|Golang|Java|TypeScript|SQL)\b", cv_text, re.I))

    # Prestige detection and bonus (proxy)
    prestige_hits = prestige_tokens_in(cv_text)
    prestige_bonus = PRESTIGE_BONUS if prestige_hits else 0.0
    debug["prestige_hits"] = prestige_hits
    debug["prestige_bonus"] = prestige_bonus

    # Per-criterion simple rules
    sys_score = 3.0 + (0.5 if has_sys else 0.0)
    sys_score = min(5.0, sys_score + prestige_bonus)
    sys_ev  = find_evidence_span(cv_text, ["microservice", "multi-tenant", "scalable", "throughput"], "Designed scalable systems.")
    sys_why = "System design signals found." if has_sys else "Limited explicit system design signals."

    prod_score = 2.8 + (0.5 if has_prod else 0.0)
    prod_ev  = find_evidence_span(cv_text, ["on-call", "SLO", "incident", "uptime"], "Production ownership indicators.")
    prod_why = "Production ownership signals found." if has_prod else "Limited explicit production ownership signals."

    lang_score = 3.0 + (1.0 if has_lang else 0.0)
    lang_ev  = find_evidence_span(cv_text, ["Python", "Go", "Golang", "Java", "TypeScript", "SQL"], "Mentions of languages/tools.")
    lang_why = "Shows depth in stack." if has_lang else "Limited explicit stack depth."

    code_score = 2.5 + (0.5 if has_tests else 0.0)
    code_ev  = find_evidence_span(cv_text, ["unit test", "pytest", "lint", "coverage", "CI/CD"], "Quality/Testing indicators.")
    code_why = "Evidence of testing/quality practices." if has_tests else "No explicit testing/quality practices."

    by_map = {
        "sys_design":     CriterionScore(key="sys_design",     score=round(sys_score, 1), evidence_span=sys_ev,  rationale=sys_why),
        "prod_ownership": CriterionScore(key="prod_ownership", score=round(prod_score, 1), evidence_span=prod_ev, rationale=prod_why),
        "lang_stack":     CriterionScore(key="lang_stack",     score=round(lang_score, 1), evidence_span=lang_ev, rationale=lang_why),
        "code_quality":   CriterionScore(key="code_quality",   score=round(code_score, 1), evidence_span=code_ev, rationale=code_why),
    }

    rubric = (job or {}).get("rubric", [])
    if rubric:
        by = [by_map[r["key"]] for r in rubric if r["key"] in by_map]
    else:
        by = [by_map["sys_design"], by_map["prod_ownership"]]

    return by, debug

def weighted_total(by: List[CriterionScore], weights: Dict[str, float]) -> float:
    wsum = sum(weights.get(c.key, 0.0) for c in by)
    if wsum <= 0:
        return round(sum(c.score for c in by) / max(1, len(by)), 2)
    return round(sum(c.score * weights.get(c.key, 0.0) for c in by) / wsum, 2)

# ----- Endpoints -----
@app.post(f"{API_PREFIX}/jobs", response_model=JobOut)
def create_job(job: JobCreate):
    job_id = f"job_{uuid.uuid4().hex[:8]}"
    _JOBS[job_id] = job.model_dump()
    return {"job_id": job_id}

@app.post(f"{API_PREFIX}/candidates/batch", response_model=CandidateBatchOut)
def add_candidates(payload: CandidateBatchIn):
    ids: List[str] = []
    for c in payload.candidates:
        cid = f"cand_{uuid.uuid4().hex[:8]}"
        _CANDIDATES[cid] = c.model_dump()
        ids.append(cid)
    return {"candidate_ids": ids}


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "")).strip().lower()

def contains_evidence(cv_text: str, span: str, overlap_thresh: float = 0.7) -> bool:
    if not span:
        return False
    cvn = _norm(cv_text)
    spn = _norm(span)
    # exact-ish
    if spn in cvn:
        return True
    # token overlap (3+ letter tokens)
    span_tokens = set(re.findall(r"\b\w{3,}\b", spn))
    if not span_tokens:
        return False
    cv_tokens = set(re.findall(r"\b\w{3,}\b", cvn))
    overlap = len(span_tokens & cv_tokens) / len(span_tokens)
    return overlap >= overlap_thresh


@app.post(f"{API_PREFIX}/score/run", response_model=ScoreRunOut)
def run_scores(payload: ScoreRunIn):
    scores: List[CandidateScore] = []
    flags: List[EthicsFlag] = []

    job = _JOBS.get(payload.job_id)
    weights = {r["key"]: r["weight"] for r in (job or {}).get("rubric", [])}

    for cid in payload.candidate_ids:
        cv = (_CANDIDATES.get(cid) or {}).get("cv_text", "")

        # -------- Original score (LLM -> heuristic fallback)
        try:
            if llm_available():
                by_orig_dicts = score_with_llm(job or {}, cv)
                by_orig = [CriterionScore(**d) for d in by_orig_dicts]
                scorer_before = "llm"
            else:
                raise ValueError("LLM not available")
        except Exception:
            by_orig, _dbg_o = heuristic_scores_from_cv(cv, job)
            scorer_before = "heuristic"

        total_before = weighted_total(by_orig, weights)

        # -------- Blinded score (use SAME scorer policy)
        cv_blind = blind_text(cv)
        try:
            if llm_available():
                by_blind_dicts = score_with_llm(job or {}, cv_blind)
                by_blind = [CriterionScore(**d) for d in by_blind_dicts]
                scorer_after = "llm"
            else:
                raise ValueError("LLM not available")
        except Exception:
            by_blind, _dbg_b = heuristic_scores_from_cv(cv_blind, job)
            scorer_after = "heuristic"

        total_after = weighted_total(by_blind, weights)

        # -------- Proxy evidence detection (independent of scorer)
        tokens_before = prestige_tokens_in(cv)
        tokens_after  = prestige_tokens_in(cv_blind)

        # -------- Evidence sanity check (NO_EVIDENCE)
        # normalize whitespace/case for robust containment check
        def _norm(s: str) -> str:
            return re.sub(r"\s+", " ", (s or "")).strip().lower()
        cv_norm = _norm(cv)
        missing_evidence = [c.key for c in by_orig if not contains_evidence(cv, c.evidence_span)]
        if missing_evidence:
            flags.append(EthicsFlag(
                candidate_id=cid,
                type="NO_EVIDENCE",
                severity="warning",
                message="Some scores lack verifiable evidence in the CV.",
                details={"criteria": missing_evidence},
            ))

        # Use ORIGINAL by_criterion for display (evidence from real CV)
        scores.append(CandidateScore(candidate_id=cid, total=total_before, by_criterion=by_orig))

        # ---- Ethics flags ----
        # 1) Blinding delta
        delta = round(total_before - total_after, 2)
        if abs(delta) >= BLINDING_DELTA_THRESHOLD:
            flags.append(EthicsFlag(
                candidate_id=cid,
                type="BLINDING_DELTA",
                severity="warning",
                message=f"Total changed under blinding by {delta:+}.",
                details={"total_before": total_before, "total_after": total_after},
            ))

        # 2) Proxy evidence (+ influence direction)
        if tokens_before:
            direction = "raises" if delta < 0 else ("lowers" if delta > 0 else "neutral")
            flags.append(EthicsFlag(
                candidate_id=cid,
                type="PROXY_EVIDENCE",
                severity="warning",
                message="Prestige tokens influenced the score.",
                details={
                    "tokens": tokens_before,
                    "removed_by_blinding": (len(tokens_after) == 0),
                    "influence_direction": direction,   # <-- added
                    "delta": delta,
                    "total_before": total_before,
                    "total_after": total_after,
                },
            ))

        # 3) Debug info
        flags.append(EthicsFlag(
            candidate_id=cid,
            type="DEBUG",
            severity="info",
            message="Scoring debug",
            details={
                "weights": weights,
                "total_before": total_before,
                "total_after": total_after,
                "delta": delta,
                "scorer_before": scorer_before,
                "scorer_after": scorer_after,
                "tokens_before": tokens_before,
                "tokens_after": tokens_after,
            },
        ))

    return ScoreRunOut(
        batch_id=f"batch_{uuid.uuid4().hex[:8]}",
        scores=scores,
        ethics_flags=flags
    )


# uvicorn app.main:app --reload --port 8000