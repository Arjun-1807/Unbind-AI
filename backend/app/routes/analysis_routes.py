import io
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Form
from app.schemas import AnalyzeRequest, SimulateRequest, StoredAnalysis
from app.auth import get_current_user_id
from app.database import get_db
from app.services.analysis_service import analyze_contract, simulate_impact

router = APIRouter(prefix="/analysis", tags=["analysis"])

# Daily analysis limits per plan (None = unlimited)
PLAN_LIMITS: dict[str | None, int | None] = {
    None: 1,        # free tier: 1 analysis per day
    "Brief": 3,     # Brief plan: 3 analyses per day
    "Motion": 5,    # Motion plan: 5 analyses per day
    "Verdict": None,  # Verdict plan: unlimited
}


async def _enforce_rate_limit(user_id: str) -> None:
    """Check the user's plan limit and increment the daily counter.

    Raises HTTP 429 if the daily quota has been reached.
    """
    db = get_db()
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    plan: str | None = user.get("plan")
    limit = PLAN_LIMITS.get(plan, 1)  # default to 1 if plan key is unknown

    # Unlimited plan — skip all checks
    if limit is None:
        return

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    last_date: str = user.get("lastAnalysisDate", "")
    daily_count: int = user.get("dailyAnalysisCount", 0)

    # Reset counter when the calendar date changes
    if last_date != today:
        daily_count = 0

    if daily_count >= limit:
        raise HTTPException(
            status_code=429,
            detail=(
                f"Daily analysis limit reached for your plan "
                f"({'Free' if plan is None else plan}). "
                f"Limit: {limit} per day. Upgrade your plan to continue."
            ),
        )

    # Increment counter
    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"dailyAnalysisCount": daily_count + 1, "lastAnalysisDate": today}},
    )


@router.post("/analyze")
async def analyze(body: AnalyzeRequest, request: Request):
    """Analyse contract text and return the full result."""
    user_id = await get_current_user_id(request)
    await _enforce_rate_limit(user_id)

    try:
        result = await analyze_contract(body.text, body.role)
    except RuntimeError as e:
        raise HTTPException(status_code=422, detail=str(e))

    # Persist to DB
    db = get_db()
    doc = {
        "userId": user_id,
        "fileName": body.fileName,
        "analysisDate": datetime.utcnow().isoformat(),
        "analysisResult": result,
        "documentText": body.text,
    }
    inserted = await db.analyses.insert_one(doc)

    return {
        "id": str(inserted.inserted_id),
        "userId": user_id,
        "fileName": body.fileName,
        "analysisDate": doc["analysisDate"],
        "analysisResult": result,
        "documentText": body.text,
    }


@router.post("/upload")
async def upload_and_analyze(
    request: Request,
    file: UploadFile = File(...),
    role: str = Form(""),
):
    """Upload a file (PDF or text), extract text, and analyse."""
    user_id = await get_current_user_id(request)
    await _enforce_rate_limit(user_id)

    content = await file.read()
    file_name = file.filename or "document"

    # Determine file type and extract text
    if file.content_type == "application/pdf" or file_name.lower().endswith(".pdf"):
        text = _extract_pdf_text(content)
    else:
        text = content.decode("utf-8", errors="replace")

    if not text or len(text.strip()) < 50:
        raise HTTPException(
            status_code=422,
            detail="Not enough text extracted from the document.",
        )

    try:
        result = await analyze_contract(text, role)
    except RuntimeError as e:
        raise HTTPException(status_code=422, detail=str(e))

    # Persist
    db = get_db()
    doc = {
        "userId": user_id,
        "fileName": file_name,
        "analysisDate": datetime.utcnow().isoformat(),
        "analysisResult": result,
        "documentText": text,
    }
    inserted = await db.analyses.insert_one(doc)

    return {
        "id": str(inserted.inserted_id),
        "userId": user_id,
        "fileName": file_name,
        "analysisDate": doc["analysisDate"],
        "analysisResult": result,
        "documentText": text,
    }


@router.get("/history")
async def history(request: Request):
    """Return all analyses for the authenticated user."""
    user_id = await get_current_user_id(request)
    db = get_db()
    cursor = db.analyses.find({"userId": user_id}).sort("analysisDate", -1)
    results = []
    async for doc in cursor:
        results.append(
            {
                "id": str(doc["_id"]),
                "userId": doc["userId"],
                "fileName": doc["fileName"],
                "analysisDate": doc["analysisDate"],
                "analysisResult": doc["analysisResult"],
                "documentText": doc.get("documentText", ""),
            }
        )
    return results


@router.get("/history/{analysis_id}")
async def get_analysis(analysis_id: str, request: Request):
    """Return a single analysis by id."""
    user_id = await get_current_user_id(request)
    db = get_db()
    from bson import ObjectId

    doc = await db.analyses.find_one({"_id": ObjectId(analysis_id), "userId": user_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return {
        "id": str(doc["_id"]),
        "userId": doc["userId"],
        "fileName": doc["fileName"],
        "analysisDate": doc["analysisDate"],
        "analysisResult": doc["analysisResult"],
        "documentText": doc.get("documentText", ""),
    }


@router.delete("/history/{analysis_id}")
async def delete_analysis(analysis_id: str, request: Request):
    """Delete a single analysis by id for the authenticated user."""
    user_id = await get_current_user_id(request)
    db = get_db()
    from bson import ObjectId

    result = await db.analyses.delete_one({"_id": ObjectId(analysis_id), "userId": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return {"ok": True}


@router.post("/simulate")
async def simulate(body: SimulateRequest, request: Request):
    """Run a what-if impact simulation against the contract text."""
    await get_current_user_id(request)  # ensure auth
    result = await simulate_impact(body.documentText, body.scenario)
    return {"result": result}


# ──── PDF text extraction helper ────

def _extract_pdf_text(pdf_bytes: bytes) -> str:
    try:
        import pdfplumber

        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            pages = []
            for page in pdf.pages:
                text = page.extract_text() or ""
                pages.append(text)
            return "\n\n".join(pages)
    except Exception:
        # Fallback to PyPDF2
        try:
            from PyPDF2 import PdfReader

            reader = PdfReader(io.BytesIO(pdf_bytes))
            pages = []
            for page in reader.pages:
                text = page.extract_text() or ""
                pages.append(text)
            return "\n\n".join(pages)
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Failed to extract PDF text: {e}")
