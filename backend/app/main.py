from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pathlib import Path
from dotenv import load_dotenv
from datetime import datetime, timezone
from fastapi.responses import JSONResponse, StreamingResponse
from io import StringIO
import uuid, re, csv
from typing import Any, Dict, List, Tuple

from app.llm import llm_available, score_with_llm
from app.routers import candidates, audit

# ----- Load environment -----
ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(dotenv_path=ENV_PATH, override=False)

# ----- App setup -----
app = FastAPI(title="Hirethics AI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],       # <--- handles OPTIONS preflight
    allow_headers=["*"],
    allow_credentials=True
)

app.include_router(candidates.router, prefix="/api/v1")
app.include_router(audit.router, prefix="/api/v1")

# ----- In-memory stores -----
_JOBS: Dict[str, Dict] = {}
_CANDIDATES: Dict[str, Dict] = {}
_BATCHES: Dict[str, Dict] = {}

API_PREFIX = "/api/v1"

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

# ----- Health / ping -----
@app.get("/health")
def health():
    return {"status": "ok"}

@app.get(f"{API_PREFIX}/ping")
def ping():
    return {"ok": True}

# ----- Constants -----
BLINDING_DELTA_THRESHOLD = 0.25
PRESTIGE_BONUS = 0.30
PRESTIGE_TOKENS_STRICT = [r"\bMIT\b", r"\bStanford\b", r"\bHarvard\b", r"\bOxford\b", r"\bCambridge\b"]
INSTITUTION_GENERIC = r"\b[A-Z][a-zA-Z]+ (University|College|Institute)\b"

# ----- Helper functions -----
def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "")).strip().lower()

def blind_text(t: str) -> str:
    t = re.sub(r"\b[A-Z][a-z]+ [A-Z][a-z]+\b", "<NAME>", t)
    t = re.sub(r"\S+@\S+", "<EMAIL>", t)
    t = re.sub(r"\+?\d[\d\-\s()]{7,}\d", "<PHONE>", t)
    t = re.sub(INSTITUTION_GENERIC, "<SCHOOL>", t)
    for tok in PRESTIGE_TOKENS_STRICT:
        t = re.sub(tok, "<SCHOOL>", t)
    return t

# Add other helpers as in your previous version: find_tokens, evidence_overlap, heuristic_scores_from_cv, weighted_total, etc.

# ----- Endpoints -----
@app.post(f"{API_PREFIX}/jobs", response_model=JobOut)
def create_job(job: JobCreate):
    job_id = f"job_{uuid.uuid4().hex[:8]}"
    _JOBS[job_id] = job.model_dump()
    return {"job_id": job_id}

@app.post(f"{API_PREFIX}/candidates/batch", response_model=CandidateBatchOut)
def add_candidates(payload: CandidateBatchIn):
    ids = []
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

    for cid in payload.candidate_ids:
        cv = (_CANDIDATES.get(cid) or {}).get("cv_text", "")
        # scoring logic as before
        by_orig, _ = [], {}  # use heuristic or LLM fallback
        total_before = 0
        scores.append(CandidateScore(candidate_id=cid, total=total_before, by_criterion=by_orig))
        # ethics_flags logic here

    return ScoreRunOut(batch_id=batch_id, scores=scores, ethics_flags=flags)

# ----- Report endpoints -----
@app.get(f"{API_PREFIX}/report/{{batch_id}}", response_model=ReportOut)
def get_report(batch_id: str, k: int = Query(None, ge=1)):
    batch = _BATCHES.get(batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    # build report object
    return ReportOut(
        batch_id=batch_id,
        job_id=batch.get("job_id", ""),
        n_candidates=0,
        k=k or 0,
        spearman_rho=None,
        topk_overlap_count=0,
        topk_overlap_ratio=0.0,
        mean_delta=0.0,
        mean_abs_delta=0.0,
        flags_by_type={},
        flags_by_severity={},
        candidates=[]
    )

@app.get(f"{API_PREFIX}/audit/{{batch_id}}.json")
def export_audit_json(batch_id: str):
    batch = _BATCHES.get(batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    return JSONResponse(content=batch, headers={"Content-Disposition": f"attachment; filename={batch_id}.json"})

@app.get(f"{API_PREFIX}/audit/{{batch_id}}.csv")
def export_audit_csv(batch_id: str):
    batch = _BATCHES.get(batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    buf = StringIO()
    writer = csv.DictWriter(buf, fieldnames=["batch_id","created_at","job_id","candidate_id","total_before","total_after","delta","flag_types"])
    writer.writeheader()
    buf.seek(0)
    return StreamingResponse(buf, media_type="text/csv", headers={"Content-Disposition": f"attachment; filename={batch_id}.csv"})
