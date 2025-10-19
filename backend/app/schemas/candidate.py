from typing import List, Literal, Optional, Dict
from pydantic import BaseModel

SourceType = Literal["resume", "cover", "interview"]

class Evidence(BaseModel):
    quote: str
    source: SourceType
    offset: Optional[Dict[str, int]] = None

class CriterionScore(BaseModel):
    key: str
    label: str
    score: float
    evidence: Optional[List[Evidence]] = None

class CandidateSummary(BaseModel):
    id: str
    name: Optional[str] = None
    overall: float
    tags: List[str]
    highlights: List[str]
    criteria: List[CriterionScore]
    summary: Optional[str] = None

class CandidatesResponse(BaseModel):
    items: List[CandidateSummary]
    total: int
