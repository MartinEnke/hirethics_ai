# backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uuid, re
from typing import Any, Tuple

API_PREFIX = "/api/v1"

# ----- In-memory stores (MVP) -----
_JOBS: dict[str, dict] = {}
_CANDIDATES: dict[str, dict] = {}

# ----- Schemas -----
class RubricItem(BaseModel):
    key: str
    weight: float
    description: str

class JobCreate(BaseModel):
    title: str
    description: str
    rubric: list[RubricItem]

class JobOut(BaseModel):
    job_id: str

class CandidateIn(BaseModel):
    cv_text: str
    artifacts: dict | None = None
    counterfactual_of: str | None = None

class CandidateBatchIn(BaseModel):
    job_id: str
    candidates: list[CandidateIn]

class CandidateBatchOut(BaseModel):
    candidate_ids: list[str]

class CriterionScore(BaseModel):
    key: str
    score: float
    evidence_span: str
    rationale: str

class CandidateScore(BaseModel):
    candidate_id: str
    total: float
    by_criterion: list[CriterionScore]

class ScoreRunIn(BaseModel):
    job_id: str
    candidate_ids: list[str]
    mode: str = "sync"

class EthicsFlag(BaseModel):
    candidate_id: str
    type: str
    severity: str
    message: str
    details: dict | None = None

class ScoreRunOut(BaseModel):
    batch_id: str
    scores: list[CandidateScore]
    ethics_flags: list[EthicsFlag]

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

# ----- Helpers -----

# ---- Tunables (change these freely) ----
BLINDING_DELTA_THRESHOLD: float = 0.25
PRESTIGE_BONUS: float = 0.30

UNIV_PATTERN = r"\b[A-Z][a-zA-Z]+ (University|College|Institute)\b"
PRESTIGE_TOKENS = [r"\bMIT\b", r"\bStanford\b", r"\bHarvard\b", r"\bOxford\b", r"\bCambridge\b"]
PRESTIGE_PATTERNS = PRESTIGE_TOKENS + [UNIV_PATTERN]

def blind_text(t: str) -> str:
    t = re.sub(r"\b[A-Z][a-z]+ [A-Z][a-z]+\b", "<NAME>", t)
    t = re.sub(r"\S+@\S+", "<EMAIL>", t)
    t = re.sub(r"\+?\d[\d\-\s()]{7,}\d", "<PHONE>", t)
    t = re.sub(UNIV_PATTERN, "<SCHOOL>", t)
    for tok in PRESTIGE_TOKENS:
        t = re.sub(tok, "<SCHOOL>", t)
    return t

def find_evidence_span(text: str, keywords: list[str], fallback: str) -> str:
    # pick the first sentence containing any keyword
    for sent in re.split(r"(?<=[.!?])\s+", text):
        for kw in keywords:
            if kw.lower() in sent.lower():
                return sent.strip()[:280]
    return fallback

def heuristic_scores_from_cv(cv_text: str) -> Tuple[list[CriterionScore], dict[str, Any]]:
    """
    Very small, transparent scoring heuristic to make the demo interactive:
    - sys_design: +0.5 if 'microservice' or 'multi-tenant' present, base 3.5 else 3.0
    - prod_ownership: +0.5 if ('on-call' or 'SLO') present, base 3.0 else 2.8
    - prestige bonus: if any prestige token present, +0.3 to sys_design (proxy!) -> ethics should catch.
    Returns (by_criterion, debug_info)
    """
    # start fully-typed so editors don’t complain
    debug: dict[str, Any] = {"prestige_hits": [], "prestige_bonus": 0.0}

    sys_design = 3.0 + (0.5 if re.search(r"microservice|multi-tenant", cv_text, re.I) else 0.0)
    sys_ev = find_evidence_span(cv_text, ["microservice", "multi-tenant", "scalable", "throughput"], "Designed scalable systems.")
    sys_why = "System design signals found." if sys_design > 3.0 else "Limited explicit system design signals."

    prod = 2.8 + (0.5 if re.search(r"on-?call|SLO", cv_text, re.I) else 0.0)
    prod_ev = find_evidence_span(cv_text, ["on-call", "SLO", "incident", "uptime", "99.9"], "Production ownership indicators.")
    prod_why = "Production ownership signals found." if prod > 2.8 else "Limited explicit production ownership signals."

    prestige_bonus = 0.0
    for pat in PRESTIGE_PATTERNS:
        if re.search(pat, cv_text):
            prestige_bonus = PRESTIGE_BONUS   # <-- use constant
            debug["prestige_hits"].append(re.sub(r"\\b", "", pat))
            break

    sys_design = min(5.0, sys_design + prestige_bonus)
    by = [
        CriterionScore(key="sys_design", score=round(sys_design, 1), evidence_span=sys_ev, rationale=sys_why),
        CriterionScore(key="prod_ownership", score=round(prod, 1), evidence_span=prod_ev, rationale=prod_why),
    ]
    debug["prestige_bonus"] = prestige_bonus
    return by, debug

def weighted_total(by: list[CriterionScore], weights: dict[str, float]) -> float:
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
    ids: list[str] = []
    for c in payload.candidates:
        cid = f"cand_{uuid.uuid4().hex[:8]}"
        _CANDIDATES[cid] = c.model_dump()
        ids.append(cid)
    return {"candidate_ids": ids}

@app.post(f"{API_PREFIX}/score/run", response_model=ScoreRunOut)
def run_scores(payload: ScoreRunIn):
    scores: list[CandidateScore] = []
    flags: list[EthicsFlag] = []

    job = _JOBS.get(payload.job_id)
    weights = {r["key"]: r["weight"] for r in (job or {}).get("rubric", [])}

    for cid in payload.candidate_ids:
        cv = (_CANDIDATES.get(cid) or {}).get("cv_text", "")

        # original score
        by_orig, dbg_orig = heuristic_scores_from_cv(cv)
        total_orig = weighted_total(by_orig, weights)

        # blinded score
        cv_blind = blind_text(cv)
        by_blind, dbg_blind = heuristic_scores_from_cv(cv_blind)
        total_blind = weighted_total(by_blind, weights)

        # use the ORIGINAL by_criterion for display
        scores.append(CandidateScore(candidate_id=cid, total=total_orig, by_criterion=by_orig))

        # ---- Ethics flags ----
        # 1) Blinding delta
        delta = round(total_orig - total_blind, 2)
        if abs(delta) >= BLINDING_DELTA_THRESHOLD:   # <-- use constant
            flags.append(EthicsFlag(
                candidate_id=cid,
                type="BLINDING_DELTA",
                severity="warning",
                message=f"Total changed under blinding by {delta:+}.",
                details={"total_before": total_orig, "total_after": total_blind},
            ))

        # 2) Proxy evidence (single consolidated flag)
        prestige_before = dbg_orig.get("prestige_bonus", 0) > 0
        prestige_after  = dbg_blind.get("prestige_bonus", 0) > 0
        if prestige_before:
            flags.append(EthicsFlag(
                candidate_id=cid,
                type="PROXY_EVIDENCE",
                severity="warning",
                message="Prestige tokens influenced the score.",
                details={
                    "tokens": dbg_orig.get("prestige_hits", []),
                    "removed_by_blinding": (not prestige_after),
                    "delta": delta,  # <-- add this
                    "total_before": total_orig,
                    "total_after": total_blind,
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
                "total_before": total_orig,
                "total_after": total_blind,
                "prestige_hits": dbg_orig.get("prestige_hits", []),
                "delta": delta,
            },
        ))

    return ScoreRunOut(
        batch_id=f"batch_{uuid.uuid4().hex[:8]}",
        scores=scores,
        ethics_flags=flags
    )
# uvicorn app.main:app --reload --port 8000