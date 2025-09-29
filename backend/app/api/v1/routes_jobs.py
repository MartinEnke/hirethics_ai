from fastapi import APIRouter
from app.schemas.job import JobCreate, JobOut
import uuid

_JOBS: dict[str, JobCreate] = {}

router = APIRouter()

@router.post("/jobs", response_model=JobOut)
def create_job(job: JobCreate):
    job_id = f"job_{uuid.uuid4().hex[:8]}"
    _JOBS[job_id] = job
    return {"job_id": job_id}
