import asyncio
import io
import json
import logging
from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import StreamingResponse
from langsmith.run_helpers import tracing_context

from app.auth import get_current_user_id
from app.database import get_db
from app.schemas import (
    AnalyzeRequest,
    DocumentQuestionRequest,
    NegotiationDraftRequest,
    SimulateRequest,
)
from app.services import document_chat_service, reminder_service, vector_store
from app.services.analysis_service import analyze_contract
from app.services.negotiation_service import draft_negotiation_message
from app.services.ocr_service import OcrError, image_to_text, is_image_upload
from app.services.quota_service import ANALYSIS, QUERY, release, reserve

# Reject oversized image uploads before OCR. Phone photos are a few MB; anything
# much larger is likely not a document photo and wastes vision tokens/time.
_MAX_IMAGE_BYTES = 15 * 1024 * 1024

# Cap document uploads too. Without this the whole file is read into memory
# before we know anything about it, so a single large PDF can exhaust the
# worker. 25 MB comfortably covers a scanned several-hundred-page contract.
_MAX_DOCUMENT_BYTES = 25 * 1024 * 1024

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analysis", tags=["analysis"])


async def _schedule_reminders(analysis_id: str, user_id: str, file_name: str, result: dict) -> None:
    """Derive deadline reminders from a finished analysis.

    Wrapped so a reminder failure can never fail the analysis the user waited
    for — reminders are a bonus on top of the result, not part of it.
    """
    await reminder_service.generate_safely(
        analysis_id, user_id, file_name, result.get("keyDates", []) or []
    )


def _object_id(raw: str, what: str = "analysis") -> ObjectId:
    """Parse a path id, answering 400 rather than 500 on a malformed one."""
    try:
        return ObjectId(raw)
    except (InvalidId, TypeError) as e:
        raise HTTPException(status_code=400, detail=f"Invalid {what} ID") from e


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _reject_if_oversized(content: bytes, is_image: bool) -> None:
    """Raise 413 when an upload exceeds the limit for its kind."""
    if is_image:
        if len(content) > _MAX_IMAGE_BYTES:
            raise HTTPException(status_code=413, detail="IMAGE_TOO_LARGE")
    elif len(content) > _MAX_DOCUMENT_BYTES:
        raise HTTPException(status_code=413, detail="FILE_TOO_LARGE")


def _sse_event(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


async def _stream_analysis(
    text: str | None,
    role: str,
    file_name: str,
    user_id: str,
    tracing_tags: list[str],
    ocr_source: tuple[bytes, str | None, str] | None = None,
    reserved: bool = False,
):
    """Run analyze_contract while streaming progress events over SSE.

    The pipeline itself is a single awaited coroutine, so progress updates
    (fired synchronously from inside it via on_progress) are relayed to the
    client through a queue drained by a concurrently running consumer task.

    When ``ocr_source`` (raw image bytes, content-type, filename) is given, the
    image is OCR'd here first — emitting a progress event so the client sees
    feedback during the vision call — and the transcription becomes ``text``.

    ``reserved`` says whether the caller consumed a unit of the daily quota; any
    path that ends in an ``error`` event refunds it, since the user got nothing.
    """
    if ocr_source is not None:
        yield _sse_event("progress", {"stage": "ocr", "message": "Reading text from your image…"})
        try:
            text = await image_to_text(*ocr_source)
        except OcrError as e:
            await release(user_id, ANALYSIS, reserved=reserved)
            yield _sse_event("error", {"code": e.code, "detail": e.message})
            return
        if not text or len(text.strip()) < 50:
            await release(user_id, ANALYSIS, reserved=reserved)
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
            await release(user_id, ANALYSIS, reserved=reserved)
            if str(e) == "NOT_A_LEGAL_DOCUMENT":
                yield _sse_event("error", {"code": "NOT_A_LEGAL_DOCUMENT"})
            else:
                yield _sse_event("error", {"code": "ERROR", "detail": str(e)})
            return
        except Exception as e:
            # Catch-all, not just RuntimeError: letting an unexpected exception
            # escape the generator truncates the SSE stream, and the client sees
            # a dead connection instead of an error it can render.
            await release(user_id, ANALYSIS, reserved=reserved)
            logger.exception("Streaming analysis failed for user %s", user_id)
            yield _sse_event("error", {"code": "ERROR", "detail": str(e)})
            return

        db = get_db()
        doc = {
            "userId": user_id,
            "fileName": file_name,
            "analysisDate": _utcnow_iso(),
            "analysisResult": result,
            "documentText": text,
        }
        inserted = await db.analyses.insert_one(doc)
        await _schedule_reminders(str(inserted.inserted_id), user_id, file_name, result)

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


@router.post("/analyze")
async def analyze(body: AnalyzeRequest, request: Request):
    """Analyse contract text and return the full result."""
    user_id = await get_current_user_id(request)
    reserved = await reserve(user_id, ANALYSIS)

    try:
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
    except Exception:
        # The user got no analysis back, so don't spend their daily quota on it.
        await release(user_id, ANALYSIS, reserved=reserved)
        raise

    # Persist to DB
    db = get_db()
    doc = {
        "userId": user_id,
        "fileName": body.fileName,
        "analysisDate": _utcnow_iso(),
        "analysisResult": result,
        "documentText": body.text,
    }
    inserted = await db.analyses.insert_one(doc)
    await _schedule_reminders(str(inserted.inserted_id), user_id, body.fileName, result)

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
    reserved = await reserve(user_id, ANALYSIS)

    try:
        content = await file.read()
        file_name = file.filename or "document"
        is_image = is_image_upload(file.content_type, file_name)
        _reject_if_oversized(content, is_image)

        # Determine file type and extract text (images go through vision OCR).
        if is_image:
            try:
                text = await image_to_text(content, file.content_type, file_name)
            except OcrError as e:
                raise HTTPException(status_code=422, detail=e.code) from e
        else:
            text = await _extract_text_from_upload(content, file.content_type, file_name)

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
    except Exception:
        # Nothing was delivered — refund the quota rather than charge the user
        # for an unreadable scan or a rejected document.
        await release(user_id, ANALYSIS, reserved=reserved)
        raise

    # Persist
    db = get_db()
    doc = {
        "userId": user_id,
        "fileName": file_name,
        "analysisDate": _utcnow_iso(),
        "analysisResult": result,
        "documentText": text,
    }
    inserted = await db.analyses.insert_one(doc)
    await _schedule_reminders(str(inserted.inserted_id), user_id, file_name, result)

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
    reserved = await reserve(user_id, ANALYSIS)

    return StreamingResponse(
        _stream_analysis(
            body.text,
            body.role,
            body.fileName,
            user_id,
            ["analysis", "api", "text", "stream"],
            reserved=reserved,
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
    reserved = await reserve(user_id, ANALYSIS)

    try:
        content = await file.read()
        file_name = file.filename or "document"
        is_image = is_image_upload(file.content_type, file_name)
        _reject_if_oversized(content, is_image)

        # Image uploads: OCR happens inside the stream (with a progress event) so
        # the client gets feedback during the vision call. Pass raw bytes through.
        if is_image:
            return StreamingResponse(
                _stream_analysis(
                    None,
                    role,
                    file_name,
                    user_id,
                    ["analysis", "api", "upload", "stream", "ocr"],
                    ocr_source=(content, file.content_type, file_name),
                    reserved=reserved,
                ),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
            )

        text = await _extract_text_from_upload(content, file.content_type, file_name)

        if not text or len(text.strip()) < 50:
            raise HTTPException(
                status_code=422,
                detail="Not enough text extracted from the document.",
            )
    except Exception:
        await release(user_id, ANALYSIS, reserved=reserved)
        raise

    return StreamingResponse(
        _stream_analysis(
            text,
            role,
            file_name,
            user_id,
            ["analysis", "api", "upload", "stream"],
            reserved=reserved,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/history")
async def history(
    request: Request,
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
):
    """Return a page of the user's analyses, newest first.

    ``documentText`` is deliberately omitted: it is by far the largest field and
    the list view never renders it. Clients fetch the full record from
    ``/history/{id}`` when the user actually opens one.
    """
    user_id = await get_current_user_id(request)
    db = get_db()
    cursor = (
        db.analyses.find({"userId": user_id}, {"documentText": 0})
        .sort("analysisDate", -1)
        .skip(skip)
        .limit(limit)
    )
    results = []
    async for doc in cursor:
        results.append(
            {
                "id": str(doc["_id"]),
                "userId": doc["userId"],
                "fileName": doc["fileName"],
                "analysisDate": doc["analysisDate"],
                "analysisResult": doc["analysisResult"],
            }
        )
    return results


@router.get("/history/{analysis_id}")
async def get_analysis(analysis_id: str, request: Request):
    """Return a single analysis by id, including its full document text."""
    user_id = await get_current_user_id(request)
    db = get_db()

    doc = await db.analyses.find_one({"_id": _object_id(analysis_id), "userId": user_id})
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
    """Delete a single analysis by id, plus everything derived from it."""
    user_id = await get_current_user_id(request)
    db = get_db()

    result = await db.analyses.delete_one({"_id": _object_id(analysis_id), "userId": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Analysis not found")

    # Deleting a document must delete what we derived from it — its embeddings
    # and its Q&A history — or the user's "delete" leaves their contract text
    # behind in chunk form.
    await vector_store.delete_index(analysis_id, user_id)
    await reminder_service.delete_for_analysis(analysis_id, user_id)
    try:
        await document_chat_service.clear_conversation(analysis_id, user_id)
    except Exception:
        logger.exception("Failed to clear chat for deleted analysis %s", analysis_id)

    return {"ok": True}


# ──── Document Q&A ────


async def _load_owned_analysis(analysis_id: str, user_id: str) -> dict:
    """Fetch an analysis the caller owns, or 404. Never leaks another user's doc."""
    db = get_db()
    doc = await db.analyses.find_one({"_id": _object_id(analysis_id), "userId": user_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return doc


@router.post("/{analysis_id}/chat")
async def ask_document(analysis_id: str, body: DocumentQuestionRequest, request: Request):
    """Answer a question about an analysed document, with citations."""
    user_id = await get_current_user_id(request)
    doc = await _load_owned_analysis(analysis_id, user_id)

    reserved = await reserve(user_id, QUERY)
    try:
        with tracing_context(
            metadata={
                "endpoint": "analysis.chat",
                "user_id": user_id,
                "analysis_id": analysis_id,
                "question": body.question,
                "question_length": len(body.question),
            },
            tags=["analysis", "api", "chat"],
        ):
            return await document_chat_service.answer_question(
                analysis_id,
                user_id,
                doc.get("documentText", ""),
                body.question,
            )
    except Exception:
        await release(user_id, QUERY, reserved=reserved)
        raise


@router.get("/{analysis_id}/chat")
async def get_document_chat(analysis_id: str, request: Request):
    """Return the stored Q&A conversation for an analysis."""
    user_id = await get_current_user_id(request)
    await _load_owned_analysis(analysis_id, user_id)
    messages = await document_chat_service.get_conversation(analysis_id, user_id)
    return [
        {
            "role": m.get("role"),
            "content": m.get("content", ""),
            "citations": m.get("citations", []),
            "createdAt": (
                m["createdAt"].isoformat()
                if hasattr(m.get("createdAt"), "isoformat")
                else m.get("createdAt")
            ),
        }
        for m in messages
    ]


@router.delete("/{analysis_id}/chat")
async def clear_document_chat(analysis_id: str, request: Request):
    """Clear the Q&A conversation for an analysis."""
    user_id = await get_current_user_id(request)
    await _load_owned_analysis(analysis_id, user_id)
    await document_chat_service.clear_conversation(analysis_id, user_id)
    return {"ok": True}


@router.post("/simulate")
async def simulate(body: SimulateRequest, request: Request):
    """Answer a one-off question about contract text, with citations.

    Retained for the published CLI, which posts raw document text with no
    analysis id and reads back ``result``. The web app uses
    ``POST /{analysis_id}/chat`` instead, which shares this exact answering path
    but adds a stored conversation.
    """
    user_id = await get_current_user_id(request)
    # Metered: each call is a HyDE completion plus retrieval, so leaving it
    # unbounded is an unbounded bill.
    reserved = await reserve(user_id, QUERY)
    try:
        with tracing_context(
            metadata={
                "endpoint": "analysis.simulate",
                "user_id": user_id,
                "scenario": body.scenario,
                "scenario_length": len(body.scenario or ""),
                "document_length": len(body.documentText or ""),
                "analysis_id": body.analysisId,
            },
            tags=["analysis", "api", "simulate"],
        ):
            result = await document_chat_service.answer_standalone(
                body.documentText,
                body.scenario,
                user_id=user_id,
                analysis_id=body.analysisId,
            )
    except Exception:
        await release(user_id, QUERY, reserved=reserved)
        raise
    # ``result`` is the legacy field name the CLI reads; ``citations`` lets newer
    # clients link answer markers back to the document.
    return {"result": result["answer"], "citations": result["citations"]}


@router.post("/negotiation-message")
async def negotiation_message(body: NegotiationDraftRequest, request: Request):
    """Draft a ready-to-send negotiation message from selected clause changes."""
    user_id = await get_current_user_id(request)
    reserved = await reserve(user_id, QUERY)
    try:
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
    except Exception:
        await release(user_id, QUERY, reserved=reserved)
        raise


# ──── File text extraction helpers ────


DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


async def _extract_text_from_upload(
    content: bytes, content_type: str | None, file_name: str
) -> str:
    """Dispatch to the right extractor based on content-type/filename, or decode as plain text.

    pdfplumber and python-docx are synchronous and CPU-bound — a large PDF parsed
    inline would stall the event loop for every other request on the worker — so
    they run in a thread, matching ocr_service's handling of Pillow.
    """
    if content_type == "application/pdf" or file_name.lower().endswith(".pdf"):
        return await asyncio.to_thread(_extract_pdf_text, content)
    if content_type == DOCX_CONTENT_TYPE or file_name.lower().endswith(".docx"):
        return await asyncio.to_thread(_extract_docx_text, content)
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
