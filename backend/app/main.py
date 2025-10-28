# backend/app/main.py
from __future__ import annotations

from datetime import datetime, timezone
from io import StringIO
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Iterable
import csv
import re
import uuid
from math import exp

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

# Optional LLM scorer (unused here; keep import soft so server runs without it)
try:
    from app.llm import llm_available, score_with_llm  # noqa: F401
except Exception:  # pragma: no cover
    llm_available = lambda: False  # type: ignore
    score_with_llm = None  # type: ignore

# Internal routers
from app.routers import candidates as candidates_router
from app.routers import audit as audit_router
from app.routers import uploads as uploads_router


# ------------------------------------------------------------------------------
# App setup
# ------------------------------------------------------------------------------
app = FastAPI(title="Hirethics AI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

# load .env (non-fatal if missing)
ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(dotenv_path=ENV_PATH, override=False)

API_PREFIX = "/api/v1"

# mount sub-routers
app.include_router(candidates_router.router, prefix=API_PREFIX)
app.include_router(audit_router.router, prefix=API_PREFIX)
app.include_router(uploads_router.router, prefix=API_PREFIX)


# ------------------------------------------------------------------------------
# In-memory stores (simple for demo)
# ------------------------------------------------------------------------------
_JOBS: Dict[str, Dict[str, Any]] = {}
_CANDIDATES: Dict[str, Dict[str, Any]] = {}
_BATCHES: Dict[str, Dict[str, Any]] = {}


# ------------------------------------------------------------------------------
# Schemas (local; you can move to app.schemas.* later)
# ------------------------------------------------------------------------------
class RubricItem(BaseModel):
    key: str
    weight: float
    description: str


class JobCreate(BaseModel):
    title: str
    description: str
    rubric: List[RubricItem]
    role_context: str = ""  # used to derive keyword overlays


class JobOut(BaseModel):
    job_id: str


class CandidateIn(BaseModel):
    cv_text: str
    artifacts: Optional[dict] = None
    counterfactual_of: Optional[str] = None
    display_name: Optional[str] = None  # echoed back to frontend


class CandidateBatchIn(BaseModel):
    job_id: str
    candidates: List[CandidateIn]


class CandidateBatchOut(BaseModel):
    candidate_ids: List[str]


class CriterionScore(BaseModel):
    key: str
    score: float
    evidence_span: str = ""
    rationale: str = ""


class CandidateScore(BaseModel):
    candidate_id: str
    total: float
    by_criterion: List[CriterionScore]
    display_name: Optional[str] = None  # echoed back for UX


class ScoreRunIn(BaseModel):
    job_id: str
    candidate_ids: List[str]
    mode: str = "sync"


class EthicsFlag(BaseModel):
    candidate_id: str
    type: str
    severity: str
    message: str
    details: Optional[dict] = None


class ScoreRunOut(BaseModel):
    batch_id: str
    scores: List[CandidateScore]
    ethics_flags: List[EthicsFlag]
    audit: Optional[dict] = None  # NEW: per-run audit payload for frontend UX


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
    spearman_rho: Optional[float]
    topk_overlap_count: int
    topk_overlap_ratio: float
    mean_delta: float
    mean_abs_delta: float
    flags_by_type: Dict[str, int]
    flags_by_severity: Dict[str, int]
    candidates: List[CandidateReport]


# ------------------------------------------------------------------------------
# Health
# ------------------------------------------------------------------------------
@app.get("/health")
def health():
    return {"status": "ok"}


@app.get(f"{API_PREFIX}/ping")
def ping():
    return {"ok": True}


# ------------------------------------------------------------------------------
# Blinding helper
# ------------------------------------------------------------------------------
PRESTIGE_TOKENS_STRICT = [r"\bMIT\b", r"\bStanford\b", r"\bHarvard\b", r"\bOxford\b", r"\bCambridge\b"]
INSTITUTION_GENERIC = r"\b[A-Z][a-zA-Z]+ (University|College|Institute)\b"


def blind_text(t: str) -> str:
    # naive PII/proxy blinding for ethics probes
    t = re.sub(r"\b[A-Z][a-z]+ [A-Z][a-z]+\b", "<NAME>", t)  # naive full name
    t = re.sub(r"\S+@\S+", "<EMAIL>", t)  # emails
    t = re.sub(r"\+?\d[\d\-\s()]{7,}\d", "<PHONE>", t)  # phones
    t = re.sub(INSTITUTION_GENERIC, "<SCHOOL>", t)
    for tok in PRESTIGE_TOKENS_STRICT:
        t = re.sub(tok, "<SCHOOL>", t)
    return t


# --- Risky proxies (for visibility only; doesn't affect score) -----------------
RISKY_PROXIES = [
    r"\b(?:MIT|Stanford|Harvard|Oxford|Cambridge)\b",
    r"\b[A-Z][a-zA-Z]+ (University|College|Institute)\b",
    r"\S+@\S+",
    r"\+?\d[\d\-\s()]{7,}\d",
    r"\b(?:Berlin|Munich|Hamburg|Cologne|Frankfurt|Germany|EU)\b",
]


def find_risky_proxies(text: str) -> List[str]:
    hits: List[str] = []
    t = text or ""
    for pat in RISKY_PROXIES:
        if re.search(pat, t, flags=re.IGNORECASE):
            # Keep a readable hint of the pattern (no raw \b etc.)
            cleaned = pat.replace(r"\b", "")
            hits.append(cleaned)
    # de-dupe preserving order
    seen: set[str] = set()
    ordered: List[str] = []
    for h in hits:
        if h not in seen:
            ordered.append(h)
            seen.add(h)
    return ordered[:5]  # cap to 5 for UX


# ------------------------------------------------------------------------------
# Role-aware keyword building (regex-based with readable labels)
# ------------------------------------------------------------------------------
Needle = Tuple[re.Pattern, str]  # (compiled_pattern, display_label)


def _has_any(text: str, needles: Iterable[str]) -> bool:
    t = (text or "").lower()
    return any(n in t for n in needles)


def _compile(pats: List[str]) -> List[Needle]:
    """
    Compile tokens into case-insensitive regex with 'word-ish' boundaries,
    but keep the original human-readable label for evidence display.
    """
    out: List[Needle] = []
    for raw in pats:
        token = raw.strip()
        if not token:
            continue
        escaped = re.escape(token)
        pat = re.compile(rf"(?<![\w.+-]){escaped}(?![\w.+-])", re.IGNORECASE)
        out.append((pat, token))
    return out


def build_job_keywords(role_context: str) -> Dict[str, List[Needle]]:
    rc = (role_context or "").lower()

    # Base (present for most engineering roles)
    sys_design = _compile([
        "system design", "microservice", "distributed", "scalable", "scalability",
        "throughput", "latency", "event-driven", "cache", "queue", "pubsub",
    ])
    prod_ownership = _compile([
        "on-call", "oncall", "incident", "postmortem", "slo", "observability",
        "monitoring", "pagerduty", "grafana", "prometheus", "logging", "tracing",
    ])

    # Defaults (backend-ish; discipline overlays will alter these)
    lang_stack = _compile([
        "python", "fastapi", "flask", "django",
        "sql", "postgres", "mysql", "sqlite", "sqlalchemy",
        "golang", "go",
    ])
    code_quality = _compile([
        "pytest", "unit test", "e2e", "testing-library", "playwright", "cypress",
        "lint", "linting", "code review", "openapi", "pydantic", "typed", "schema", "docs",
    ])

    # Discipline bundles
    FE_stack = _compile([
        "react", "typescript", "ts", "next.js", "nextjs", "vite", "redux",
        "storybook", "tailwind", "css modules", "sass", "aria", "accessibility",
        "webpack", "pnpm", "yarn", "npm",
    ])
    FE_quality = _compile([
        "jest", "testing-library", "playwright", "cypress", "axe", "lighthouse",
        "performance", "lcp", "cls", "xss", "csp",
    ])
    DATA_stack = _compile([
        "spark", "pyspark", "airflow", "dbt", "kafka",
        "snowflake", "bigquery", "redshift", "hive", "parquet", "duckdb",
        "pandas", "polars", "dask",
    ])
    DATA_quality = _compile([
        "data quality", "dq", "lineage", "expectations", "great expectations", "tests",
    ])
    DEVOPS_stack = _compile([
        "kubernetes", "k8s", "docker", "terraform", "ansible",
        "aws", "gcp", "azure", "eks", "ecs", "iam", "ec2", "s3", "cloudfront",
        "github actions", "gitlab ci", "ci/cd", "pipeline",
    ])
    RAG_stack = _compile([
        "rag", "retrieval", "chunk", "rerank", "embedding", "vector",
        "pgvector", "langchain", "llamaindex", "llama index",
        "weaviate", "pinecone", "milvus", "chromadb",
        "openai", "ollama", "transformers", "huggingface",
    ])
    RAG_quality = _compile([
        "evaluation", "evals", "explainability", "audit", "trace", "observability",
        "prompt", "guardrail", "safety",
    ])

    # Discipline heuristics from role text
    is_frontend = _has_any(rc, ["frontend", "front-end", "react", "typescript", "next.js", "ui"])
    is_backend = _has_any(rc, ["backend", "back-end", "api", "fastapi", "flask", "django", "golang", "go"])
    is_data = _has_any(rc, ["data engineer", "etl", "warehouse", "spark", "airflow", "dbt", "kafka"])
    is_devops = _has_any(rc, ["devops", "platform", "sre", "kubernetes", "docker", "terraform"])
    wants_rag = _has_any(rc, ["rag", "llm", "langchain", "llamaindex", "pgvector", "retrieval"])

    # Overlay per discipline
    if is_frontend:
        sys_design += _compile(["component design", "state management", "performance", "accessibility"])
        lang_stack = FE_stack + _compile(["rest", "graphql"])
        code_quality = FE_quality + _compile(["typed dto", "openapi", "zod"])

    if is_backend:
        lang_stack += _compile(["rest", "graphql", "grpc", "openapi", "pydantic", "celery", "redis"])

    if is_data:
        lang_stack = DATA_stack + _compile(["sql", "postgres", "warehouse"])
        code_quality += DATA_quality

    if is_devops:
        prod_ownership += _compile(["sla", "error budget", "sre"])
        lang_stack += DEVOPS_stack

    if wants_rag:
        lang_stack += RAG_stack
        code_quality += RAG_quality

    # De-duplicate while preserving order (by label)
    def dedupe_needles(xs: List[Needle]) -> List[Needle]:
        seen: set[str] = set()
        out: List[Needle] = []
        for pat, label in xs:
            if label not in seen:
                out.append((pat, label))
                seen.add(label)
        return out

    return {
        "sys_design": dedupe_needles(sys_design),
        "prod_ownership": dedupe_needles(prod_ownership),
        "lang_stack": dedupe_needles(lang_stack),
        "code_quality": dedupe_needles(code_quality),
    }


# --- Role flags, role-aware default weights, and co-occurrence pairs ----------
def _role_flags(role_context: str) -> Dict[str, bool]:
    s = (role_context or "").lower()
    return {
        "frontend": any(x in s for x in ["frontend", "front-end", "react", "typescript", "next.js", "ui"]),
        "backend": any(x in s for x in ["backend", "back-end", "api", "fastapi", "flask", "django", "golang", "go"]),
        "data": any(x in s for x in ["data engineer", "etl", "warehouse", "spark", "airflow", "dbt", "kafka", "snowflake", "bigquery"]),
        "devops": any(x in s for x in ["devops", "platform", "sre", "kubernetes", "docker", "terraform", "argo", "argocd"]),
        "rag": any(x in s for x in ["rag", "llm", "langchain", "llamaindex", "pgvector", "retrieval"]),
    }


def infer_role_weights(role_context: str) -> Dict[str, float]:
    """Default bucket weights if no rubric was supplied, tuned per role."""
    f = _role_flags(role_context)
    if f["frontend"]:
        return {"sys_design": 0.20, "prod_ownership": 0.15, "lang_stack": 0.35, "code_quality": 0.30}
    if f["data"]:
        return {"sys_design": 0.20, "prod_ownership": 0.20, "lang_stack": 0.40, "code_quality": 0.20}
    if f["devops"]:
        return {"sys_design": 0.20, "prod_ownership": 0.35, "lang_stack": 0.30, "code_quality": 0.15}
    # backend / mixed default
    return {"sys_design": 0.35, "prod_ownership": 0.20, "lang_stack": 0.25, "code_quality": 0.20}


def build_cooccurrence_pairs(role_context: str) -> Dict[str, List[Tuple[str, str]]]:
    """
    Pairs of tokens that, if co-occur close together, should gently bump a bucket score.
    Case-insensitive substring match is fine; keep lowercase here.
    """
    f = _role_flags(role_context)
    pairs: Dict[str, List[Tuple[str, str]]] = {
        "sys_design": [],
        "prod_ownership": [("on-call", "incident"), ("slo", "observability"), ("grafana", "prometheus")],
        "lang_stack": [],
        "code_quality": [("jest", "testing-library"), ("pytest", "unit test"), ("openapi", "pydantic")],
    }
    if f["frontend"]:
        pairs["lang_stack"] += [("react", "typescript"), ("react", "next.js"), ("typescript", "next.js")]
        pairs["code_quality"] += [("lighthouse", "accessibility"), ("playwright", "testing-library")]
    if f["backend"]:
        pairs["lang_stack"] += [("python", "fastapi"), ("flask", "sqlalchemy"), ("openapi", "pydantic")]
        pairs["sys_design"] += [("microservice", "distributed")]
    if f["data"]:
        pairs["lang_stack"] += [("spark", "airflow"), ("airflow", "dbt"), ("snowflake", "dbt"), ("bigquery", "dbt")]
        pairs["code_quality"] += [("data quality", "lineage"), ("great expectations", "tests")]
    if f["devops"]:
        pairs["lang_stack"] += [("kubernetes", "terraform"), ("k8s", "terraform"), ("argocd", "gitops")]
        pairs["prod_ownership"] += [("slo", "error budget")]
    if f["rag"]:
        pairs["lang_stack"] += [("rag", "retrieval"), ("pgvector", "langchain"), ("llamaindex", "embedding")]
        pairs["code_quality"] += [("evaluation", "guardrail")]
    return pairs


# ------------------------------------------------------------------------------
# Scoring helpers (continuous, unique-token, co-occurrence bump, better evidence)
# ------------------------------------------------------------------------------
def _unique_labels(text: str, needles: List[Needle]) -> List[str]:
    """Return unique matched labels for given compiled patterns."""
    if not text:
        return []
    hits: List[str] = []
    seen: set[str] = set()
    for pat, label in needles:
        if pat.search(text):
            if label not in seen:
                hits.append(label)
                seen.add(label)
    return hits


def _saturating_score(k: int, k_ref: int = 4, max_score: float = 5.0) -> float:
    """
    Smooth 0..5 score with diminishing returns.
    ~k_ref unique hits reach ~80–90% of max_score.
    """
    if k <= 0:
        return 0.0
    a = 1.2  # steepness
    s = max_score * (1 - exp(-a * (k / max(k_ref, 1))))
    return round(min(max_score, s), 2)


def _cooccurrence_bump(text: str, pairs: Optional[List[Tuple[str, str]]]) -> float:
    """
    Gentle +0.3 bump if any pair appears within ~64 chars proximity (case-insensitive).
    """
    if not text or not pairs:
        return 0.0
    t = (text or "").lower()
    for a, b in pairs:
        ia = t.find(a)
        if ia == -1:
            continue
        ib = t.find(b)
        if ib == -1:
            continue
        if abs(ia - ib) <= 64:
            return 0.3
    return 0.0


def score_bucket(text: str, needles: List[Needle], pairs: Optional[List[Tuple[str, str]]] = None) -> Tuple[float, List[str]]:
    """
    - Counts unique regex-token hits -> continuous score (0..5) via a saturating curve.
    - Applies a gentle +0.3 co-occurrence bump (capped at 5.0) when certain pairs appear nearby.
    - Returns up to 3 evidence tokens, preferring longer multiword tokens first.
    """
    labels = _unique_labels(text, needles)
    k = len(labels)
    score = _saturating_score(k, k_ref=4, max_score=5.0)
    score = min(5.0, round(score + _cooccurrence_bump(text, pairs), 2))
    evid = sorted(labels, key=lambda s: (-len(s), s))[:3]
    return score, evid


# ------------------------------------------------------------------------------
# Ranking helpers for ethics probes
# ------------------------------------------------------------------------------
def _rank_order(pairs: List[Tuple[str, float]]) -> Dict[str, int]:
    """
    Turn [(candidate_id, total), ...] into rank positions (1 = best).
    Stable: ties keep relative order.
    """
    sorted_pairs = sorted(pairs, key=lambda x: (-x[1], x[0]))
    return {cid: i + 1 for i, (cid, _) in enumerate(sorted_pairs)}


def _spearman_rho(ranks1: Dict[str, int], ranks2: Dict[str, int]) -> Optional[float]:
    """Spearman correlation between two candidate rank dicts."""
    common = [cid for cid in ranks1.keys() if cid in ranks2]
    n = len(common)
    if n < 2:
        return None
    d2 = sum((ranks1[cid] - ranks2[cid]) ** 2 for cid in common)
    return 1 - (6 * d2) / (n * (n**2 - 1))


# ------------------------------------------------------------------------------
# Endpoints
# ------------------------------------------------------------------------------
@app.post(f"{API_PREFIX}/jobs", response_model=JobOut)
def create_job(job: JobCreate):
    job_id = f"job_{uuid.uuid4().hex[:8]}"
    _JOBS[job_id] = job.model_dump()
    return {"job_id": job_id}


@app.post(f"{API_PREFIX}/candidates/batch", response_model=CandidateBatchOut)
def add_candidates(payload: CandidateBatchIn):
    if payload.job_id not in _JOBS:
        raise HTTPException(status_code=400, detail="Unknown job_id")
    ids: List[str] = []
    for c in payload.candidates:
        cid = f"cand_{uuid.uuid4().hex[:8]}"
        _CANDIDATES[cid] = c.model_dump()
        ids.append(cid)
    return {"candidate_ids": ids}


@app.post(f"{API_PREFIX}/score/run", response_model=ScoreRunOut)
def run_scores(payload: ScoreRunIn):
    # Resolve job & weights (fallback to role-aware defaults)
    job = _JOBS.get(payload.job_id) or {}
    rubric = job.get("rubric", [])
    role_context: str = job.get("role_context", "") or ""

    # Role-aware defaults if rubric is empty
    weights = {r["key"]: float(r["weight"]) for r in rubric} or infer_role_weights(role_context)

    # Build job-specific keywords and co-occurrence pairs from role_context
    KW = build_job_keywords(role_context)
    PAIRS = build_cooccurrence_pairs(role_context)

    batch_id = f"batch_{uuid.uuid4().hex[:8]}"
    scores_before: List[CandidateScore] = []
    flags: List[EthicsFlag] = []
    batch_records: List[Dict[str, Any]] = []

    # light role-alignment nudge
    role_is_frontend = _has_any(role_context.lower(), ["frontend", "front-end", "react", "typescript", "next.js", "ui"])
    role_is_backend = _has_any(role_context.lower(), ["backend", "back-end", "api", "fastapi", "flask", "django", "golang", "go"])

    def score_text(cv_text: str) -> Tuple[List[CriterionScore], float]:
        by: List[CriterionScore] = []
        for key in ["sys_design", "prod_ownership", "lang_stack", "code_quality"]:
            if key not in weights:
                continue
            sc, hits = score_bucket(cv_text, KW.get(key, []), PAIRS.get(key, []))
            by.append(CriterionScore(key=key, score=sc, evidence_span=", ".join(hits), rationale=""))

        # Gentle role-alignment nudge on lang_stack (doesn't overpower evidence)
        lang_row = next((c for c in by if c.key == "lang_stack"), None)
        if lang_row:
            ev = (lang_row.evidence_span or "").lower()
            fe_signals = any(tok in ev for tok in ["react", "typescript", "next.js", "storybook", "accessibility"])
            be_signals = any(tok in ev for tok in ["python", "fastapi", "flask", "django", "golang", "go"])
            delta = 0.0
            if role_is_frontend and be_signals and not fe_signals:
                delta = -0.2
            elif role_is_backend and fe_signals and not be_signals:
                delta = -0.2
            if delta:
                lang_row.score = round(min(5.0, max(0.0, lang_row.score + delta)), 2)

        wsum = sum(weights.get(c.key, 0.0) for c in by) or 1.0
        total = round(sum(weights.get(c.key, 0.0) * c.score for c in by) / wsum, 2)
        return by, total

    # 1) Baseline scoring
    baseline_pairs: List[Tuple[str, float]] = []
    for cid in payload.candidate_ids:
        cand = (_CANDIDATES.get(cid) or {})
        raw_text = ((cand.get("cv_text") or "")).strip()

        by, total = score_text(raw_text)
        scores_before.append(CandidateScore(candidate_id=cid, total=total, by_criterion=by, display_name=cand.get("display_name")))
        baseline_pairs.append((cid, total))

    ranks_before = _rank_order(baseline_pairs)

    # 2) Blinded rescoring (PII + prestige proxies removed)
    blinded_pairs: List[Tuple[str, float]] = []
    totals_after: Dict[str, float] = {}
    for cid in payload.candidate_ids:
        cand = (_CANDIDATES.get(cid) or {})
        raw_text = ((cand.get("cv_text") or "")).strip()
        blinded = blind_text(raw_text)
        _by_blind, total_after = score_text(blinded)
        totals_after[cid] = total_after
        blinded_pairs.append((cid, total_after))

    ranks_after = _rank_order(blinded_pairs)

    # 2b) Proxy matches before/after blinding (for visibility in frontend)
    proxies_before: Dict[str, List[str]] = {}
    proxies_after: Dict[str, List[str]] = {}
    for cid in payload.candidate_ids:
        cand = (_CANDIDATES.get(cid) or {})
        raw_text = (cand.get("cv_text") or "")
        blinded = blind_text(raw_text)
        proxies_before[cid] = find_risky_proxies(raw_text)
        proxies_after[cid] = find_risky_proxies(blinded)

    # 3) Ethics flags: rank deltas & per-candidate deltas (+ proxies removed)
    for s in scores_before:
        before = ranks_before.get(s.candidate_id, 0)
        after = ranks_after.get(s.candidate_id, 0)
        delta_pos = before - after  # + means improved after blinding
        if abs(delta_pos) >= 2:
            flags.append(EthicsFlag(
                candidate_id=s.candidate_id,
                type="BLINDING_DELTA",
                severity="warning" if abs(delta_pos) < 4 else "error",
                message=f"Rank changed by {delta_pos:+d} positions under blinding.",
                details={"delta_positions": delta_pos, "rank_before": before, "rank_after": after}
            ))

        removed = [p for p in (proxies_before.get(s.candidate_id, []) or []) if p not in (proxies_after.get(s.candidate_id, []) or [])]
        if removed:
            flags.append(EthicsFlag(
                candidate_id=s.candidate_id,
                type="PROXY_SIGNAL_REMOVED",
                severity="info",
                message=f"Proxy signal(s) removed by blinding: {', '.join(removed[:3])}",
                details={"removed_proxies": removed}
            ))

        batch_records.append({
            "candidate_id": s.candidate_id,
            "total_before": float(s.total),
            "total_after": float(totals_after.get(s.candidate_id, s.total)),
            "delta": float(totals_after.get(s.candidate_id, s.total) - s.total),
            "flags": [f.type for f in flags if f.candidate_id == s.candidate_id],
        })

    # 4) Persist batch-level audit stats
    rho = _spearman_rho(ranks_before, ranks_after)

    audit_payload = {
        "spearman_rho": rho,
        "ranks_before": ranks_before,
        "ranks_after": ranks_after,
        "per_candidate": {
            cid: {
                "total_before": float(next((s.total for s in scores_before if s.candidate_id == cid), 0.0)),
                "total_after": float(totals_after.get(cid, 0.0)),
                "delta": float(totals_after.get(cid, 0.0) - next((s.total for s in scores_before if s.candidate_id == cid), 0.0)),
                "rank_before": int(ranks_before.get(cid, 0)),
                "rank_after": int(ranks_after.get(cid, 0)),
                "proxies_before": proxies_before.get(cid, []),
                "proxies_after": proxies_after.get(cid, []),
                "proxies_removed": [p for p in (proxies_before.get(cid, []) or []) if p not in (proxies_after.get(cid, []) or [])],
            }
            for cid, _ in baseline_pairs
        }
    }

    _BATCHES[batch_id] = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "job_id": payload.job_id,
        "candidates": batch_records,
        "flags": [f.model_dump() for f in flags],
        "role_context": role_context,
        "ranks_before": ranks_before,
        "ranks_after": ranks_after,
        "spearman_rho": rho,
        "audit": audit_payload,
    }

    return ScoreRunOut(batch_id=batch_id, scores=scores_before, ethics_flags=flags, audit=audit_payload)


# ------------------------------------------------------------------------------
# Reporting & audit exports
# ------------------------------------------------------------------------------
@app.get(f"{API_PREFIX}/report/{{batch_id}}", response_model=ReportOut)
def get_report(batch_id: str, k: int = Query(None, ge=1)):
    batch = _BATCHES.get(batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    recs = batch.get("candidates", [])
    n = len(recs)
    k = k or min(5, n or 1)

    deltas = [float(r.get("delta", 0.0)) for r in recs]
    mean_delta = round(sum(deltas) / (len(deltas) or 1), 3)
    mean_abs_delta = round(sum(abs(d) for d in deltas) / (len(deltas) or 1), 3)

    flags_by_type: Dict[str, int] = {}
    flags_by_severity: Dict[str, int] = {}
    for f in (batch.get("flags") or []):
        t = f.get("type", "UNKNOWN")
        s = f.get("severity", "warning")
        flags_by_type[t] = flags_by_type.get(t, 0) + 1
        flags_by_severity[s] = flags_by_severity.get(s, 0) + 1

    rho = batch.get("spearman_rho")
    ranks_before = batch.get("ranks_before") or {}
    ranks_after = batch.get("ranks_after") or {}

    # Top-K overlap (by rank)
    def topk(ids_by_rank: Dict[str, int], k_: int) -> set:
        return {cid for cid, r in ids_by_rank.items() if r <= k_}
    top_before = topk(ranks_before, k) if ranks_before else set()
    top_after = topk(ranks_after, k) if ranks_after else set()
    overlap_count = len(top_before & top_after) if top_before and top_after else min(k, n)
    overlap_ratio = (overlap_count / float(k)) if k else 0.0

    return ReportOut(
        batch_id=batch_id,
        job_id=batch.get("job_id", ""),
        n_candidates=n,
        k=k,
        spearman_rho=rho,
        topk_overlap_count=overlap_count,
        topk_overlap_ratio=overlap_ratio,
        mean_delta=mean_delta,
        mean_abs_delta=mean_abs_delta,
        flags_by_type=flags_by_type,
        flags_by_severity=flags_by_severity,
        candidates=[
            CandidateReport(
                candidate_id=r["candidate_id"],
                total_before=float(r.get("total_before", 0.0)),
                total_after=float(r.get("total_after", 0.0)),
                delta=float(r.get("delta", 0.0)),
                flags=list(r.get("flags", [])),
            ) for r in recs
        ],
    )


@app.get(f"{API_PREFIX}/audit/{{batch_id}}.json")
def export_audit_json(batch_id: str):
    batch = _BATCHES.get(batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    return JSONResponse(
        content=batch,
        headers={"Content-Disposition": f"attachment; filename={batch_id}.json"},
    )


@app.get(f"{API_PREFIX}/audit/{{batch_id}}.csv")
def export_audit_csv(batch_id: str):
    batch = _BATCHES.get(batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    buf = StringIO()
    writer = csv.DictWriter(
        buf,
        fieldnames=[
            "batch_id", "created_at", "job_id",
            "candidate_id", "total_before", "total_after", "delta", "flag_types",
        ],
    )
    writer.writeheader()
    for r in batch.get("candidates", []):
        writer.writerow({
            "batch_id": batch_id,
            "created_at": batch.get("created_at", ""),
            "job_id": batch.get("job_id", ""),
            "candidate_id": r.get("candidate_id", ""),
            "total_before": r.get("total_before", 0.0),
            "total_after": r.get("total_after", 0.0),
            "delta": r.get("delta", 0.0),
            "flag_types": ",".join(r.get("flags", [])),
        })
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={batch_id}.csv"},
    )

# uvicorn app.main:app --reload --port 8000
