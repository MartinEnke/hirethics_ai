from pydantic import BaseModel

class RubricItem(BaseModel):
    key: str
    weight: float
    description: str

class JobCreate(BaseModel):
    title: str
    description: str
    rubric: list[RubricItem]

class JobOut(BaseModel):
    job_id: str
