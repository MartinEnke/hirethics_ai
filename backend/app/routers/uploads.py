# backend/app/routers/uploads.py
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import uuid, io, re
from pypdf import PdfReader

router = APIRouter(prefix="/uploads", tags=["uploads"])

class ExtractedDoc(BaseModel):
    id: str
    filename: Optional[str]
    text: str
    size: int
    display_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None

EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
PHONE_RE = re.compile(r"\+?\d[\d\-\s()]{7,}\d")

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

def guess_display_name(text: str, filename: Optional[str]) -> Optional[str]:
    # first 8 non-empty lines, prefer a name-looking line
    for line in (l.strip() for l in text.splitlines()[:8]):
        if not line:
            continue
        # Simple “Firstname Lastname” (optionally 3 parts)
        if re.match(r"^[A-Z][a-z]+(?:[-'][A-Za-z]+)?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?$", line):
            return line
    # fallback to filename stem
    if filename:
        stem = filename.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
        stem = re.sub(r"\.[Pp][Dd][Ff]$", "", stem).strip()
        # strip common prefixes like "CV_", etc.
        stem = re.sub(r"^(CV[_\-\s]+|Resume[_\-\s]+)", "", stem, flags=re.I)
        return stem or None
    return None

@router.post("/extract", response_model=List[ExtractedDoc])
async def extract(files: List[UploadFile] = File(...)):
    out: List[ExtractedDoc] = []
    for f in files:
        if f.content_type not in ("application/pdf", "application/octet-stream"):
            raise HTTPException(status_code=415, detail=f"Unsupported file type: {f.content_type}")
        raw = await f.read()
        if not raw:
            raise HTTPException(status_code=400, detail=f"{f.filename or 'unnamed'}: empty file")

        text = extract_text_from_pdf_bytes(raw)
        email = next(iter(EMAIL_RE.findall(text)), None)
        phone = next(iter(PHONE_RE.findall(text)), None)
        display_name = guess_display_name(text, f.filename)

        out.append(
            ExtractedDoc(
                id=str(uuid.uuid4()),
                filename=f.filename or "unnamed.pdf",
                text=text,
                size=len(raw),
                display_name=display_name,
                email=email,
                phone=phone,
            )
        )
    return out
