"""Deadline reminder endpoints: the scheduled sweep, plus user controls."""

import hmac
import logging
from datetime import date

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import HTMLResponse

from app.auth import get_current_user_id
from app.config import get_settings
from app.database import get_db
from app.schemas import ReminderDueDateRequest, ReminderPreferencesRequest
from app.services import reminder_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/reminders", tags=["reminders"])


def _require_sweep_secret(request: Request) -> None:
    """Authenticate the scheduler.

    This endpoint sends mail to every user with a due deadline, so it must not be
    callable by anyone who knows the URL. Compared in constant time, and refused
    outright when unconfigured rather than defaulting to open — an unset secret is
    a misconfiguration, not permission.
    """
    expected = get_settings().REMINDER_SWEEP_SECRET
    if not expected:
        raise HTTPException(
            status_code=503,
            detail="Reminder sweep is not configured. Set REMINDER_SWEEP_SECRET.",
        )
    provided = request.headers.get("x-reminder-secret", "")
    if not hmac.compare_digest(provided, expected):
        raise HTTPException(status_code=401, detail="Invalid sweep credentials")


@router.post("/sweep")
async def sweep(
    request: Request,
    dry_run: bool = Query(False, description="Report what would be sent without sending"),
):
    """Email every user their upcoming deadlines. Driven by a daily scheduler.

    Safe to call more than once a day: each reminder records which lead times it
    has already emailed, so a repeat run sends nothing new.
    """
    _require_sweep_secret(request)
    return await reminder_service.run_sweep(dry_run=dry_run)


@router.get("/preferences")
async def get_preferences(request: Request):
    """Current reminder settings for the caller."""
    user_id = await get_current_user_id(request)
    db = get_db()
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {
        "enabled": reminder_service.reminders_enabled(user),
        "leadDays": reminder_service.lead_days_for(user),
    }


@router.put("/preferences")
async def update_preferences(body: ReminderPreferencesRequest, request: Request):
    """Turn reminders on/off and choose how far ahead to be warned."""
    user_id = await get_current_user_id(request)

    changes: dict = {}
    if body.enabled is not None:
        changes["reminderOptIn"] = body.enabled
    if body.leadDays is not None:
        # Normalise here so the stored value is always sane, regardless of client.
        cleaned = sorted({d for d in body.leadDays if 0 <= d <= 365}, reverse=True)
        if not cleaned:
            raise HTTPException(status_code=422, detail="leadDays must contain at least one value")
        changes["reminderLeadDays"] = cleaned

    if not changes:
        raise HTTPException(status_code=422, detail="Nothing to update")

    db = get_db()
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": changes})
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    return {
        "enabled": reminder_service.reminders_enabled(user),
        "leadDays": reminder_service.lead_days_for(user),
    }


@router.get("/analysis/{analysis_id}")
async def list_reminders(analysis_id: str, request: Request):
    """Reminders derived from one analysis, including those needing a date."""
    user_id = await get_current_user_id(request)
    db = get_db()
    try:
        oid = ObjectId(analysis_id)
    except (InvalidId, TypeError) as e:
        raise HTTPException(status_code=400, detail="Invalid analysis ID") from e

    # Confirm ownership before revealing anything derived from the document.
    if not await db.analyses.find_one({"_id": oid, "userId": user_id}):
        raise HTTPException(status_code=404, detail="Analysis not found")

    return await reminder_service.list_for_analysis(analysis_id, user_id)


@router.put("/{reminder_id}/due-date")
async def set_reminder_due_date(reminder_id: str, body: ReminderDueDateRequest, request: Request):
    """Supply the date we refused to guess, turning a flagged item into a reminder."""
    user_id = await get_current_user_id(request)
    try:
        due = date.fromisoformat(body.dueDate)
    except ValueError as e:
        raise HTTPException(status_code=422, detail="dueDate must be YYYY-MM-DD") from e

    try:
        updated = await reminder_service.set_due_date(reminder_id, user_id, due)
    except (InvalidId, TypeError) as e:
        raise HTTPException(status_code=400, detail="Invalid reminder ID") from e

    if not updated:
        raise HTTPException(status_code=404, detail="Reminder not found")
    return {"ok": True, "dueDate": due.isoformat()}


@router.get("/unsubscribe", response_class=HTMLResponse)
async def unsubscribe(token: str = Query(...)):
    """One-click opt-out from a link in the email — no login required.

    Reached from a mail client, so it answers with a small HTML page rather than
    JSON. Every outbound digest carries this link; without a working one, sending
    scheduled mail isn't legitimate.
    """
    user_id = reminder_service.read_unsubscribe_token(token)
    if not user_id:
        return HTMLResponse(
            _page(
                "Link expired",
                "This unsubscribe link isn't valid. "
                "You can turn reminders off in your profile settings.",
            ),
            status_code=400,
        )

    try:
        db = get_db()
        await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"reminderOptIn": False}})
    except Exception:
        logger.exception("Failed to unsubscribe user %s", user_id)
        return HTMLResponse(
            _page(
                "Something went wrong", "Please try again, or turn reminders off in your profile."
            ),
            status_code=500,
        )

    return HTMLResponse(
        _page(
            "Reminders turned off",
            "You won't get any more deadline reminder emails. "
            "You can turn them back on any time in your profile settings.",
        )
    )


def _page(title: str, message: str) -> str:
    frontend = get_settings().FRONTEND_URL.rstrip("/")
    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>{title} · UnBind AI</title>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
  body {{ font-family: 'Segoe UI', Arial, sans-serif; background:#0f0f13; color:#e5e7eb;
         display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; padding:24px; }}
  .card {{ max-width:440px; background:#1a1a2e; border:1px solid #2d2d44; border-radius:12px; padding:32px; text-align:center; }}
  h1 {{ font-size:20px; margin:0 0 12px; }}
  p {{ color:#9ca3af; line-height:1.6; margin:0 0 24px; }}
  a {{ display:inline-block; background:#4f46e5; color:#fff; text-decoration:none;
       padding:10px 22px; border-radius:8px; font-weight:600; font-size:15px; }}
</style></head>
<body><div class="card"><h1>{title}</h1><p>{message}</p>
<a href="{frontend}/profile">Go to my profile</a></div></body></html>"""
