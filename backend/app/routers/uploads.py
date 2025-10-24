# backend/app/routers/uploads.py
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import uuid, io

# Use pypdf (add to requirements.txt: pypdf)
from pypdf import PdfReader

router = APIRouter(prefix="/uploads", tags=["uploads"])


class ExtractedDoc(BaseModel):
    id: str
    filename: Optional[str]  # UploadFile.filename can be None
    text: str
    size: int


def extract_text_from_pdf_bytes(data: bytes) -> str:
    try:
        reader = PdfReader(io.BytesIO(data))
        chunks: List[str] = []
        for page in getattr(reader, "pages", []):
            txt = page.extract_text() or ""
            chunks.append(txt)
        return "\n".join(chunks).strip()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse PDF: {e}")


@router.post("/extract", response_model=List[ExtractedDoc])
async def extract(files: List[UploadFile] = File(...)):
    """
    Accept multiple PDF files and return minimal extraction payloads.
    """
    out: List[ExtractedDoc] = []
    for f in files:
        # Some browsers send octet-stream; allow both
        if f.content_type not in ("application/pdf", "application/octet-stream"):
            raise HTTPException(status_code=415, detail=f"Unsupported file type: {f.content_type}")
        raw = await f.read()
        if not raw:
            raise HTTPException(status_code=400, detail=f"{f.filename or 'unnamed'}: empty file")

        text = extract_text_from_pdf_bytes(raw)
        out.append(
            ExtractedDoc(
                id=str(uuid.uuid4()),
                filename=f.filename or "unnamed.pdf",
                text=text,
                size=len(raw),
            )
        )
    return out
