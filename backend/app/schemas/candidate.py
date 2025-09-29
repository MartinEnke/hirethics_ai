from pydantic import BaseModel

class CandidateIn(BaseModel):
    cv_text: str
    artifacts: dict | None = None
    counterfactual_of: str | None = None

class CandidateBatchIn(BaseModel):
    job_id: str
    candidates: list[CandidateIn]

class CandidateBatchOut(BaseModel):
    candidate_ids: list[str]
