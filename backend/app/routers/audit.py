# backend/app/routers/audit.py
from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Literal, Optional
from app.schemas.audit import AuditSummary, TopKOverlap, Check  # absolute import

router = APIRouter(
    prefix="/api/v1/audit",
    tags=["audit"],
    redirect_slashes=True  # <--- add this
)
# ----- Example endpoint -----
@router.get("/", response_model=dict)
def get_audit_example():
    example = AuditSummary(
        spearman_r=0.87,
        topk_overlap=TopKOverlap(k=5, percent=80.0),
        checks=[Check(name="bias_check", status="ok")],
        mitigations=["Add more diverse training data"]
    )
    return {"example": example.dict()}
