from fastapi import APIRouter
from app.schemas.candidate import CandidateBatchIn, CandidateBatchOut
import uuid

_CANDIDATES: dict[str, dict] = {}
router = APIRouter()

@router.post("/candidates/batch", response_model=CandidateBatchOut)  # <-- changed
def add_candidates(payload: CandidateBatchIn):
    ids = []
    for c in payload.candidates:
        cid = f"cand_{uuid.uuid4().hex[:8]}"
        _CANDIDATES[cid] = c.model_dump()
        ids.append(cid)
    return {"candidate_ids": ids}
