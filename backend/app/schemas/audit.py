# backend/app/schemas/audit.py
from pydantic import BaseModel
from typing import List, Literal, Optional

class TopKOverlap(BaseModel):
    k: int
    percent: float

class Check(BaseModel):
    name: str
    status: Literal["passed", "ok", "warn", "fail"]

class AuditSummary(BaseModel):
    spearman_r: float
    topk_overlap: TopKOverlap
    checks: List[Check]
    mitigations: Optional[List[str]] = None
