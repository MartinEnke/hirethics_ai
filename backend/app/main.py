# backend/app/main.py
from __future__ import annotations

from datetime import datetime, timezone
from io import StringIO
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import csv
import re
import uuid

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
# Blinding helper (kept for future ethics checks)
# ------------------------------------------------------------------------------
PRESTIGE_TOKENS_STRICT = [r"\bMIT\b", r"\bStanford\b", r"\bHarvard\b", r"\bOxford\b", r"\bCambridge\b"]
INSTITUTION_GENERIC = r"\b[A-Z][a-zA-Z]+ (University|College|Institute)\b"


def blind_text(t: str) -> str:
    # naive PII/proxy blinding for future ethics probes
    t = re.sub(r"\b[A-Z][a-z]+ [A-Z][a-z]+\b", "<NAME>", t)  # naive full name
    t = re.sub(r"\S+@\S+", "<EMAIL>", t)  # emails
    t = re.sub(r"\+?\d[\d\-\s()]{7,}\d", "<PHONE>", t)  # phones
    t = re.sub(INSTITUTION_GENERIC, "<SCHOOL>", t)
    for tok in PRESTIGE_TOKENS_STRICT:
        t = re.sub(tok, "<SCHOOL>", t)
    return t


# ------------------------------------------------------------------------------
# Role-aware keyword building
# ------------------------------------------------------------------------------
def _has_any(text: str, needles: List[str]) -> bool:
    t = (text or "").lower()
    return any(n in t for n in needles)


def _compile(pats: List[str]) -> List[str]:
    # Keep lowercase substrings for PDF OCR robustness
    return [p.lower() for p in pats]


def build_job_keywords(role_context: str) -> Dict[str, List[str]]:
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
        "react", "typescript", "ts ", " next.js", "nextjs", "vite", "redux",
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

    # De-duplicate while preserving order
    def dedupe(xs: List[str]) -> List[str]:
        seen: set[str] = set()
        out: List[str] = []
        for x in xs:
            if x not in seen:
                out.append(x)
                seen.add(x)
        return out

    return {
        "sys_design": dedupe(sys_design),
        "prod_ownership": dedupe(prod_ownership),
        "lang_stack": dedupe(lang_stack),
        "code_quality": dedupe(code_quality),
    }


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
    # Resolve job & weights (fallback to defaults)
    job = _JOBS.get(payload.job_id) or {}
    rubric = job.get("rubric", [])
    weights = {r["key"]: float(r["weight"]) for r in rubric} or {
        "sys_design": 0.35,
        "prod_ownership": 0.20,
        "lang_stack": 0.25,
        "code_quality": 0.20,
    }

    # Build job-specific keywords from role_context
    role_context = job.get("role_context", "") or ""
    KW = build_job_keywords(role_context)

    batch_id = f"batch_{uuid.uuid4().hex[:8]}"
    scores: List[CandidateScore] = []
    flags: List[EthicsFlag] = []
    batch_records: List[Dict[str, Any]] = []

    def score_bucket(text: str, needles: List[str]) -> Tuple[float, List[str]]:
        t = (text or "").lower()
        hits = [n for n in needles if n in t]
        k = len(hits)
        # map #hits → 0..5
        if k == 0:
            score = 0.0
        elif k == 1:
            score = 2.5
        elif k == 2:
            score = 3.5
        elif k == 3:
            score = 4.2
        else:
            score = 4.7
        return round(score, 2), hits[:2]  # show up to 2 matched tokens as evidence

    for cid in payload.candidate_ids:
        cand = (_CANDIDATES.get(cid) or {})
        raw_text = (cand.get("cv_text") or "").strip()
        # Keep blinding ready for future ethics probes, not used for scoring yet
        _ = blind_text(raw_text)

        # Per-bucket scoring
        by: List[CriterionScore] = []
        for key in ["sys_design", "prod_ownership", "lang_stack", "code_quality"]:
            if key not in weights:
                continue
            sc, hits = score_bucket(raw_text, KW.get(key, []))
            by.append(CriterionScore(
                key=key,
                score=sc,
                evidence_span=", ".join(hits),
                rationale=""
            ))

        # Weighted total
        total = 0.0
        if by:
            wsum = sum(weights.get(c.key, 0.0) for c in by) or 1.0
            total = round(sum(weights.get(c.key, 0.0) * c.score for c in by) / wsum, 2)

        scores.append(CandidateScore(
            candidate_id=cid,
            total=total,
            by_criterion=by,
            display_name=cand.get("display_name")
        ))

        # Example ethics flag when score is high (placeholder)
        if total >= 4.2:
            flags.append(EthicsFlag(
                candidate_id=cid,
                type="BLINDING_DELTA",
                severity="warning",
                message="Rank changed under blinding by +2 positions.",
                details={"delta": 2}
            ))

        batch_records.append({
            "candidate_id": cid,
            "total_before": total,
            "total_after": total,  # no counterfactual applied yet
            "delta": 0.0,
            "flags": [f.type for f in flags if f.candidate_id == cid],
        })

    # Persist batch for /report
    _BATCHES[batch_id] = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "job_id": payload.job_id,
        "candidates": batch_records,
        "flags": [f.model_dump() for f in flags],
        "role_context": role_context,
    }

    return ScoreRunOut(batch_id=batch_id, scores=scores, ethics_flags=flags)


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

    return ReportOut(
        batch_id=batch_id,
        job_id=batch.get("job_id", ""),
        n_candidates=n,
        k=k,
        spearman_rho=None,  # compute if you add counterfactual rankings later
        topk_overlap_count=min(k, n),
        topk_overlap_ratio=(min(k, n) / (k or 1)) if k else 0.0,
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
