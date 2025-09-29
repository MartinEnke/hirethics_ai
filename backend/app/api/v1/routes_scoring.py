from fastapi import APIRouter
from app.schemas.scoring import ScoreRunIn, ScoreRunOut, CandidateScore, CriterionScore, EthicsFlag
import uuid

router = APIRouter()

@router.post("/score/run", response_model=ScoreRunOut)  # <-- changed
def run_scores(payload: ScoreRunIn):
    scores = []
    flags = []
    for cid in payload.candidate_ids:
        by = [
            CriterionScore(key="sys_design", score=4.0, evidence_span="“Designed multi-tenant service…”", rationale="Clear system design example."),
            CriterionScore(key="prod_ownership", score=3.5, evidence_span="“Led on-call, improved SLOs…”", rationale="Shows production ownership."),
        ]
        total = round(sum([c.score for c in by]) / len(by), 2)
        scores.append(CandidateScore(candidate_id=cid, total=total, by_criterion=by))
        if total > 3.8:
            flags.append(EthicsFlag(candidate_id=cid, type="BLINDING_DELTA", severity="warning",
                                    message="Rank changed under blinding by +3 positions.", details={"delta": 3}))
    return ScoreRunOut(batch_id=f"batch_{uuid.uuid4().hex[:8]}", scores=scores, ethics_flags=flags)
