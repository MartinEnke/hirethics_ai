from pydantic import BaseModel

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
