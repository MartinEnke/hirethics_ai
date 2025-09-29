from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uuid, re
from typing import Any, Tuple, Dict, List
from pathlib import Path
from dotenv import load_dotenv
from datetime import datetime, timezone

from app.llm import llm_available, score_with_llm

# --- Load backend/.env no matter where uvicorn is launched from
ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(dotenv_path=ENV_PATH, override=False)

API_PREFIX = "/api/v1"

# ----- In-memory stores (MVP) -----
_JOBS: Dict[str, Dict] = {}
_CANDIDATES: Dict[str, Dict] = {}
_BATCHES: Dict[str, Dict] = {}

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

class CandidateReport(BaseModel):
    candidate_id: str
    total_before: float
    total_after: float
    delta: float
    flags: List[str]

class ReportOut(BaseModel):
    batch_id: str
    job_id: str
    n_candidates: int
    k: int
    spearman_rho: float | None
    topk_overlap_count: int
    topk_overlap_ratio: float
    mean_delta: float
    mean_abs_delta: float
    flags_by_type: Dict[str, int]
    flags_by_severity: Dict[str, int]
    candidates: List[CandidateReport]

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

# Strict elite names vs generic institution form
PRESTIGE_TOKENS_STRICT = [r"\bMIT\b", r"\bStanford\b", r"\bHarvard\b", r"\bOxford\b", r"\bCambridge\b"]
INSTITUTION_GENERIC = r"\b[A-Z][a-zA-Z]+ (University|College|Institute)\b"

# ----- Helpers -----
def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "")).strip().lower()

def evidence_overlap(cv_text: str, span: str) -> float:
    """Return 0..1 overlap score; 1.0 if normalized span is substring of cv."""
    if not span:
        return 0.0
    cvn, spn = _norm(cv_text), _norm(span)
    if spn in cvn:
        return 1.0
    span_tokens = set(re.findall(r"\b\w{3,}\b", spn))
    if not span_tokens:
        return 0.0
    cv_tokens = set(re.findall(r"\b\w{3,}\b", cvn))
    return len(span_tokens & cv_tokens) / max(1, len(span_tokens))

def blind_text(t: str) -> str:
    t = re.sub(r"\b[A-Z][a-z]+ [A-Z][a-z]+\b", "<NAME>", t)                # naive full name
    t = re.sub(r"\S+@\S+", "<EMAIL>", t)                                   # email
    t = re.sub(r"\+?\d[\d\-\s()]{7,}\d", "<PHONE>", t)                     # phone
    t = re.sub(INSTITUTION_GENERIC, "<SCHOOL>", t)                         # generic institutions
    for tok in PRESTIGE_TOKENS_STRICT:                                     # elite names
        t = re.sub(tok, "<SCHOOL>", t)
    return t

def find_tokens(text: str, patterns: List[str]) -> List[str]:
    hits: List[str] = []
    for pat in patterns:
        for m in re.finditer(pat, text, flags=re.I):
            hits.append(m.group(0))
    return hits

def find_evidence_span(text: str, keywords: List[str], fallback: str) -> str:
    for sent in re.split(r"(?<=[.!?])\s+", text):
        for kw in keywords:
            if kw.lower() in sent.lower():
                return sent.strip()[:280]
    return fallback

def heuristic_scores_from_cv(cv_text: str, job: dict | None = None) -> Tuple[List[CriterionScore], Dict[str, Any]]:
    """
    Heuristic scorer that covers all rubric keys (if provided), in rubric order.
    Prestige bonus only for STRICT tokens (not any 'X University').
    """
    debug: Dict[str, Any] = {}

    # Signal detection
    has_sys  = bool(re.search(r"microservice|multi-tenant|scalable|throughput", cv_text, re.I))
    has_prod = bool(re.search(r"on-?call|SLO|incident|uptime|99\.\d{1,2}", cv_text, re.I))
    has_tests = bool(re.search(r"unit test|pytest|testing|coverage|lint|CI/?CD", cv_text, re.I))
    has_lang = bool(re.search(r"\b(Python|Go|Golang|Java|TypeScript|SQL)\b", cv_text, re.I))

    # Prestige detection for bonus (STRICT ONLY)
    strict_hits = find_tokens(cv_text, PRESTIGE_TOKENS_STRICT)
    prestige_bonus = PRESTIGE_BONUS if strict_hits else 0.0
    debug["prestige_hits_strict"] = strict_hits
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

@app.post(f"{API_PREFIX}/score/run", response_model=ScoreRunOut)
def run_scores(payload: ScoreRunIn):
    scores: List[CandidateScore] = []
    flags: List[EthicsFlag] = []

    job = _JOBS.get(payload.job_id)
    weights = {r["key"]: r["weight"] for r in (job or {}).get("rubric", [])}

    batch_id = f"batch_{uuid.uuid4().hex[:8]}"
    batch_results: List[Dict[str, Any]] = []

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

        # -------- Blinded score (same scorer policy)
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

        # -------- Proxy evidence detection
        tokens_strict_before  = find_tokens(cv, PRESTIGE_TOKENS_STRICT)
        tokens_generic_before = find_tokens(cv, [INSTITUTION_GENERIC])
        tokens_strict_after   = find_tokens(cv_blind, PRESTIGE_TOKENS_STRICT)
        tokens_generic_after  = find_tokens(cv_blind, [INSTITUTION_GENERIC])

        # -------- Evidence QC (overlap; treat <0.7 as missing)
        qc = {c.key: evidence_overlap(cv, c.evidence_span) for c in by_orig}
        missing_evidence = [k for k, s in qc.items() if s < 0.7]

        # Collect per-candidate flags (avoid duplicates)
        cand_flags: List[EthicsFlag] = []

        if missing_evidence:
            cand_flags.append(EthicsFlag(
                candidate_id=cid,
                type="NO_EVIDENCE",
                severity="warning",
                message="Some scores lack verifiable evidence in the CV.",
                details={"criteria": missing_evidence, "overlap": qc},
            ))

        delta = round(total_before - total_after, 2)
        if abs(delta) >= BLINDING_DELTA_THRESHOLD:
            cand_flags.append(EthicsFlag(
                candidate_id=cid,
                type="BLINDING_DELTA",
                severity="warning",
                message=f"Total changed under blinding by {delta:+}.",
                details={"total_before": total_before, "total_after": total_after},
            ))

        if tokens_strict_before or tokens_generic_before:
            direction = "raises" if delta < 0 else ("lowers" if delta > 0 else "neutral")
            only_generic = (not tokens_strict_before) and bool(tokens_generic_before)
            severity = "info" if only_generic and abs(delta) < BLINDING_DELTA_THRESHOLD else "warning"
            cand_flags.append(EthicsFlag(
                candidate_id=cid,
                type="PROXY_EVIDENCE",
                severity=severity,
                message=(
                    "Institution prestige/inference influenced the score."
                    if not only_generic else
                    "Institution mention detected (generic)."
                ),
                details={
                    "tokens_strict": tokens_strict_before,
                    "tokens_generic": tokens_generic_before,
                    "removed_by_blinding": (len(tokens_strict_after) + len(tokens_generic_after) == 0),
                    "influence_direction": direction,
                    "delta": delta,
                    "total_before": total_before,
                    "total_after": total_after,
                },
            ))

        # Debug flag (last)
        cand_flags.append(EthicsFlag(
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
                "tokens_strict_before": tokens_strict_before,
                "tokens_generic_before": tokens_generic_before,
                "tokens_strict_after": tokens_strict_after,
                "tokens_generic_after": tokens_generic_after,
                "evidence_overlap": qc,
            },
        ))

        # Aggregate into response + batch
        scores.append(CandidateScore(candidate_id=cid, total=total_before, by_criterion=by_orig))
        flags.extend(cand_flags)
        batch_results.append({
            "candidate_id": cid,
            "total_before": total_before,
            "total_after": total_after,
            "delta": delta,
            "by_criterion": [c.model_dump() for c in by_orig],
            "flags": [f.model_dump(include={"type", "severity"}) for f in cand_flags],
        })

    # Save full batch for evaluation
    _BATCHES[batch_id] = {
        "job_id": payload.job_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "weights": weights,
        "results": batch_results,
    }

    return ScoreRunOut(batch_id=batch_id, scores=scores, ethics_flags=flags)

# ----- Evaluation helpers/endpoints -----
def _ranks(values: List[float]) -> List[float]:
    # tie-aware average ranks (1-based)
    idx = list(range(len(values)))
    idx.sort(key=lambda i: values[i])
    ranks = [0.0] * len(values)
    i = 0
    while i < len(values):
        j = i
        while j + 1 < len(values) and abs(values[idx[j+1]] - values[idx[i]]) < 1e-12:
            j += 1
        avg = (i + 1 + j + 1) / 2.0
        for k in range(i, j + 1):
            ranks[idx[k]] = avg
        i = j + 1
    return ranks

def _spearman_rho(a: List[float], b: List[float]) -> float | None:
    n = len(a)
    if n < 2 or len(b) != n:
        return None
    ra, rb = _ranks(a), _ranks(b)
    mean_ra = sum(ra) / n
    mean_rb = sum(rb) / n
    cov = sum((ra[i]-mean_ra)*(rb[i]-mean_rb) for i in range(n))
    var_a = sum((x-mean_ra)**2 for x in ra)
    var_b = sum((y-mean_rb)**2 for y in rb)
    if var_a <= 0 or var_b <= 0:
        return None
    return round(cov / (var_a**0.5 * var_b**0.5), 4)

@app.get(f"{API_PREFIX}/report/{{batch_id}}", response_model=ReportOut)
def get_report(batch_id: str, k: int = Query(None, ge=1)):
    batch = _BATCHES.get(batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    results = batch["results"]
    n = len(results)
    if n == 0:
        raise HTTPException(status_code=400, detail="Empty batch")

    totals_before = [r["total_before"] for r in results]
    totals_after  = [r["total_after"]  for r in results]
    deltas        = [r["delta"]        for r in results]

    rho = _spearman_rho(totals_before, totals_after)

    # Top-K overlap
    if k is None:
        k = min(5, n)
    order_before = sorted(range(n), key=lambda i: totals_before[i], reverse=True)[:k]
    order_after  = sorted(range(n), key=lambda i: totals_after[i],  reverse=True)[:k]
    set_before = {results[i]["candidate_id"] for i in order_before}
    set_after  = {results[i]["candidate_id"] for i in order_after}
    overlap_count = len(set_before & set_after)
    overlap_ratio = round(overlap_count / max(1, k), 3)

    # Flag summaries
    flags_by_type: Dict[str, int] = {}
    flags_by_severity: Dict[str, int] = {}
    for r in results:
        for f in r["flags"]:
            # back-compat: support old batches that stored strings
            if isinstance(f, dict):
                t = f.get("type", "UNKNOWN")
                sev = f.get("severity", "warning")
            else:
                t = f
                sev = "info" if t == "DEBUG" or str(t).endswith("_INFO") else "warning"
            flags_by_type[t] = flags_by_type.get(t, 0) + 1
            flags_by_severity[sev] = flags_by_severity.get(sev, 0) + 1


    mean_delta = round(sum(deltas) / n, 3)
    mean_abs_delta = round(sum(abs(d) for d in deltas) / n, 3)

    candidates = [
        CandidateReport(
            candidate_id=r["candidate_id"],
            total_before=r["total_before"],
            total_after=r["total_after"],
            delta=r["delta"],
            flags=[(f["type"] if isinstance(f, dict) else f) for f in r["flags"]],
        )
        for r in results
    ]

    return ReportOut(
        batch_id=batch_id,
        job_id=batch["job_id"],
        n_candidates=n,
        k=k,
        spearman_rho=rho,
        topk_overlap_count=overlap_count,
        topk_overlap_ratio=overlap_ratio,
        mean_delta=mean_delta,
        mean_abs_delta=mean_abs_delta,
        flags_by_type=flags_by_type,
        flags_by_severity=flags_by_severity,
        candidates=candidates,
    )



# uvicorn app.main:app --reload --port 8000