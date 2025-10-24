from fastapi import APIRouter, HTTPException
from ..schemas.candidate import CandidatesResponse, CandidateSummary
import json
from pathlib import Path

router = APIRouter(
    prefix="/api/v1/candidates",
    tags=["candidates"],
    redirect_slashes=True
)

SEED = Path(__file__).resolve().parents[2] / "seed" / "candidates.json"

def _load_seed():
    with open(SEED, "r", encoding="utf-8") as f:
        return json.load(f)

@router.get("/candidates", response_model=CandidatesResponse)
def list_candidates():
    return _load_seed()

@router.get("/candidates/{cand_id}", response_model=CandidateSummary)
def get_candidate(cand_id: str):
    data = _load_seed()
    for it in data["items"]:
        if it["id"] == cand_id:
            return it
    raise HTTPException(status_code=404, detail="Candidate not found")

@router.post("/compare", response_model=list[dict])
def compare(payload: dict):
    ids = set(payload.get("ids", []))
    out = []
    for it in _load_seed()["items"]:
        if it["id"] in ids:
            out.append({
                "candidate": it.get("name") or it["id"],
                "scores": {c["label"]: c["score"] for c in it["criteria"]}
            })
    return out
