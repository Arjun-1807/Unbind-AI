import asyncio
import io
import json
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from langsmith.run_helpers import tracing_context

from app.auth import get_current_user_id
from app.database import get_db
from app.schemas import AnalyzeRequest, NegotiationDraftRequest, SimulateRequest
from app.services.analysis_service import analyze_contract, simulate_impact
from app.services.negotiation_service import draft_negotiation_message
from app.services.ocr_service import OcrError, image_to_text, is_image_upload
from app.services.plan_service import effective_plan

# Reject oversized image uploads before OCR. Phone photos are a few MB; anything
# much larger is likely not a document photo and wastes vision tokens/time.
_MAX_IMAGE_BYTES = 15 * 1024 * 1024

router = APIRouter(prefix="/analysis", tags=["analysis"])


def _sse_event(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


async def _stream_analysis(
    text: str | None,
    role: str,
    file_name: str,
    user_id: str,
    tracing_tags: list[str],
    ocr_source: tuple[bytes, str | None, str] | None = None,
):
    """Run analyze_contract while streaming progress events over SSE.

    The pipeline itself is a single awaited coroutine, so progress updates
    (fired synchronously from inside it via on_progress) are relayed to the
    client through a queue drained by a concurrently running consumer task.

    When ``ocr_source`` (raw image bytes, content-type, filename) is given, the
    image is OCR'd here first — emitting a progress event so the client sees
    feedback during the vision call — and the transcription becomes ``text``.
    """
    if ocr_source is not None:
        yield _sse_event("progress", {"stage": "ocr", "message": "Reading text from your image…"})
        try:
            text = await image_to_text(*ocr_source)
        except OcrError as e:
            yield _sse_event("error", {"code": e.code, "detail": e.message})
            return
        if not text or len(text.strip()) < 50:
            yield _sse_event("error", {"code": "OCR_INSUFFICIENT_TEXT"})
            return

    queue: asyncio.Queue = asyncio.Queue()

    def on_progress(stage: str, detail: dict) -> None:
        queue.put_nowait({"stage": stage, **detail})

    async def run_pipeline() -> dict:
        with tracing_context(
            metadata={
                "endpoint": "analysis.analyze.stream",
                "user_id": user_id,
                "file_name": file_name,
                "role": role,
                "text_length": len(text or ""),
            },
            tags=tracing_tags,
        ):
            return await analyze_contract(text, role, user_id=user_id, on_progress=on_progress)

    pipeline_task = asyncio.create_task(run_pipeline())

    try:
        while not pipeline_task.done():
            try:
                event = await asyncio.wait_for(queue.get(), timeout=0.5)
                yield _sse_event("progress", event)
            except asyncio.TimeoutError:
                continue

        # Drain any events emitted right before completion.
        while not queue.empty():
            yield _sse_event("progress", queue.get_nowait())

        try:
            result = pipeline_task.result()
        except ValueError as e:
            if str(e) == "NOT_A_LEGAL_DOCUMENT":
                yield _sse_event("error", {"code": "NOT_A_LEGAL_DOCUMENT"})
            else:
                yield _sse_event("error", {"code": "ERROR", "detail": str(e)})
            return
        except RuntimeError as e:
            yield _sse_event("error", {"code": "ERROR", "detail": str(e)})
            return

        db = get_db()
        doc = {
            "userId": user_id,
            "fileName": file_name,
            "analysisDate": datetime.utcnow().isoformat(),
            "analysisResult": result,
            "documentText": text,
        }
        inserted = await db.analyses.insert_one(doc)

        yield _sse_event(
            "result",
            {
                "id": str(inserted.inserted_id),
                "userId": user_id,
                "fileName": file_name,
                "analysisDate": doc["analysisDate"],
                "analysisResult": result,
                "documentText": text,
            },
        )
    finally:
        if not pipeline_task.done():
            pipeline_task.cancel()


# Daily analysis limits per plan (None = unlimited)
PLAN_LIMITS: dict[str | None, int | None] = {
    None: 1,  # free tier: 1 analysis per day
    "Brief": 3,  # Brief plan: 3 analyses per day
    "Motion": 5,  # Motion plan: 5 analyses per day
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

    # effective_plan treats an expired paid plan as the free tier.
    plan: str | None = effective_plan(user)
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
        with tracing_context(
            metadata={
                "endpoint": "analysis.analyze",
                "user_id": user_id,
                "file_name": body.fileName,
                "role": body.role,
                "text_length": len(body.text or ""),
            },
            tags=["analysis", "api", "text"],
        ):
            result = await analyze_contract(body.text, body.role, user_id=user_id)
    except ValueError as e:
        if str(e) == "NOT_A_LEGAL_DOCUMENT":
            raise HTTPException(status_code=422, detail="NOT_A_LEGAL_DOCUMENT") from e
        raise
    except RuntimeError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

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

    # Determine file type and extract text (image uploads go through vision OCR).
    if is_image_upload(file.content_type, file_name):
        if len(content) > _MAX_IMAGE_BYTES:
            raise HTTPException(status_code=422, detail="IMAGE_TOO_LARGE")
        try:
            text = await image_to_text(content, file.content_type, file_name)
        except OcrError as e:
            raise HTTPException(status_code=422, detail=e.code) from e
    else:
        text = _extract_text_from_upload(content, file.content_type, file_name)

    if not text or len(text.strip()) < 50:
        raise HTTPException(
            status_code=422,
            detail="Not enough text extracted from the document.",
        )

    try:
        with tracing_context(
            metadata={
                "endpoint": "analysis.upload",
                "user_id": user_id,
                "file_name": file_name,
                "file_content_type": file.content_type or "",
                "role": role,
                "text_length": len(text or ""),
            },
            tags=["analysis", "api", "upload"],
        ):
            result = await analyze_contract(text, role, user_id=user_id)
    except ValueError as e:
        if str(e) == "NOT_A_LEGAL_DOCUMENT":
            raise HTTPException(status_code=422, detail="NOT_A_LEGAL_DOCUMENT") from e
        raise
    except RuntimeError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

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


@router.post("/analyze/stream")
async def analyze_stream(body: AnalyzeRequest, request: Request):
    """Analyse contract text, streaming per-clause progress via SSE."""
    user_id = await get_current_user_id(request)
    await _enforce_rate_limit(user_id)

    return StreamingResponse(
        _stream_analysis(
            body.text,
            body.role,
            body.fileName,
            user_id,
            ["analysis", "api", "text", "stream"],
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/upload/stream")
async def upload_and_analyze_stream(
    request: Request,
    file: UploadFile = File(...),
    role: str = Form(""),
):
    """Upload a file (PDF or text), extract text, and stream analysis progress via SSE."""
    user_id = await get_current_user_id(request)
    await _enforce_rate_limit(user_id)

    content = await file.read()
    file_name = file.filename or "document"

    # Image uploads: OCR happens inside the stream (with a progress event) so the
    # client gets feedback during the vision call. Pass the raw bytes through.
    if is_image_upload(file.content_type, file_name):
        if len(content) > _MAX_IMAGE_BYTES:
            raise HTTPException(status_code=422, detail="IMAGE_TOO_LARGE")
        return StreamingResponse(
            _stream_analysis(
                None,
                role,
                file_name,
                user_id,
                ["analysis", "api", "upload", "stream", "ocr"],
                ocr_source=(content, file.content_type, file_name),
            ),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    text = _extract_text_from_upload(content, file.content_type, file_name)

    if not text or len(text.strip()) < 50:
        raise HTTPException(
            status_code=422,
            detail="Not enough text extracted from the document.",
        )

    return StreamingResponse(
        _stream_analysis(
            text,
            role,
            file_name,
            user_id,
            ["analysis", "api", "upload", "stream"],
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


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
    user_id = await get_current_user_id(request)
    with tracing_context(
        metadata={
            "endpoint": "analysis.simulate",
            "user_id": user_id,
            "scenario": body.scenario,
            "scenario_length": len(body.scenario or ""),
            "document_length": len(body.documentText or ""),
        },
        tags=["analysis", "api", "simulate"],
    ):
        result = await simulate_impact(body.documentText, body.scenario, user_id=user_id)
    # ``result`` (the answer string) is kept for backward compatibility; the UI
    # additionally uses ``citations`` to link answer markers to the document.
    return {"result": result["answer"], "citations": result["citations"]}


@router.post("/negotiation-message")
async def negotiation_message(body: NegotiationDraftRequest, request: Request):
    """Draft a ready-to-send negotiation message from selected clause changes."""
    user_id = await get_current_user_id(request)
    with tracing_context(
        metadata={
            "endpoint": "analysis.negotiation_message",
            "user_id": user_id,
            "point_count": len(body.points),
            "tone": body.tone,
            "format": body.format,
        },
        tags=["analysis", "api", "negotiation"],
    ):
        return await draft_negotiation_message(body)


# ──── File text extraction helpers ────


DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def _extract_text_from_upload(content: bytes, content_type: str | None, file_name: str) -> str:
    """Dispatch to the right extractor based on content-type/filename, or decode as plain text."""
    if content_type == "application/pdf" or file_name.lower().endswith(".pdf"):
        return _extract_pdf_text(content)
    if content_type == DOCX_CONTENT_TYPE or file_name.lower().endswith(".docx"):
        return _extract_docx_text(content)
    return content.decode("utf-8", errors="replace")


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
            raise HTTPException(status_code=422, detail=f"Failed to extract PDF text: {e}") from e


def _extract_docx_text(docx_bytes: bytes) -> str:
    try:
        import docx

        document = docx.Document(io.BytesIO(docx_bytes))

        paragraphs = [p.text for p in document.paragraphs if p.text and p.text.strip()]

        table_text: list[str] = []
        for table in document.tables:
            for row in table.rows:
                cells = [cell.text.strip() for cell in row.cells if cell.text and cell.text.strip()]
                if cells:
                    table_text.append("\t".join(cells))

        return "\n".join(paragraphs + table_text)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to extract DOCX text: {e}") from e
