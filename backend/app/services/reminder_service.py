"""Deadline reminders: generate them from an analysis, then email when due.

Turns UnbindAI from a one-shot tool into something that keeps working after the
user closes the tab — the contract said "give 60 days notice" and six months
later nobody remembers.

Three properties drive the design:

1. **Never invent a date.** Only dates that :mod:`app.services.date_parser`
   resolves unambiguously become reminders. Everything else is stored as
   ``needsAttention`` so the UI can ask, rather than being silently dropped or
   guessed at.
2. **Never double-send.** The sweep runs from an external scheduler, so it can
   fire twice, or not at all for days. Each reminder records which lead times it
   has already emailed, and the sweep is driven by that record rather than by
   "did today's job run" — so a retry sends nothing and a missed week still
   sends once, late, instead of never.
3. **Never send unwanted mail.** Every digest carries a working one-click
   unsubscribe, and an opted-out user is filtered before any mail is built.
"""

import logging
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from bson import ObjectId
from pymongo.errors import DuplicateKeyError

from app.database import get_db
from app.services.date_parser import resolve_key_date
from app.services.email_service import send_deadline_reminder_email

logger = logging.getLogger(__name__)

COLLECTION = "reminders"

# Days before a deadline that we email. Descending order matters: the sweep fires
# the largest arrived-but-unsent lead, so a long outage still produces one useful
# email rather than a burst of three.
DEFAULT_LEAD_DAYS = [14, 7, 1]

# The longest lead a user is allowed to configure. `lead_days_for` rejects
# anything outside 0..365, so nothing further out than this can ever fire.
MAX_LEAD_DAYS = 365

# Guard against a pathological analysis generating hundreds of reminders.
MAX_REMINDERS_PER_ANALYSIS = 50


def _as_utc_midnight(day: date) -> datetime:
    """Mongo stores datetimes, not dates; normalise to UTC midnight."""
    return datetime.combine(day, time.min, tzinfo=timezone.utc)


def _to_date(value: Any) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return None


def lead_days_for(user: dict[str, Any] | None) -> list[int]:
    """The user's configured lead times, newest-first, with bad data ignored."""
    raw = (user or {}).get("reminderLeadDays")
    if not isinstance(raw, list):
        return list(DEFAULT_LEAD_DAYS)
    leads = sorted(
        {int(d) for d in raw if isinstance(d, int) and 0 <= d <= MAX_LEAD_DAYS}, reverse=True
    )
    return leads or list(DEFAULT_LEAD_DAYS)


def reminders_enabled(user: dict[str, Any] | None) -> bool:
    """Default on: the user uploaded a contract to be helped with its deadlines.

    Explicit opt-out is respected, and every email carries an unsubscribe link
    that sets it.
    """
    return bool(user) and user.get("reminderOptIn", True) is not False


async def generate_for_analysis(
    analysis_id: str,
    user_id: str,
    file_name: str,
    key_dates: list[dict[str, Any]],
    *,
    today: date | None = None,
) -> dict[str, int]:
    """Create reminder rows for an analysis's key dates.

    Idempotent: re-running for the same analysis inserts nothing new, because the
    unique index on (userId, analysisId, description, dueDate) rejects repeats.
    That matters because an analysis can be re-run and this is called from
    several paths.

    Returns counts:
    ``{"scheduled": n, "needsAttention": n, "skipped": n, "failed": n}``.
    """
    if today is None:
        today = datetime.now(timezone.utc).date()

    db = get_db()
    counts = {"scheduled": 0, "needsAttention": 0, "skipped": 0, "failed": 0}
    now = datetime.now(timezone.utc)

    for entry in (key_dates or [])[:MAX_REMINDERS_PER_ANALYSIS]:
        raw = str(entry.get("date", "")).strip()
        description = str(entry.get("description", "")).strip() or "Contract deadline"
        resolved = resolve_key_date(raw, today=today)

        if resolved.schedulable and resolved.due:
            bucket = "scheduled"
        elif resolved.needs_user_input:
            bucket = "needsAttention"
        else:
            bucket = "skipped"

        doc = {
            "userId": user_id,
            "analysisId": analysis_id,
            "fileName": file_name,
            "description": description,
            "sourceDate": raw,
            "dueDate": _as_utc_midnight(resolved.due) if resolved.due else None,
            "schedulable": resolved.schedulable,
            "reason": resolved.reason,
            "needsAttention": resolved.needs_user_input,
            "sentLeads": [],
            "createdAt": now,
        }
        try:
            await db[COLLECTION].insert_one(doc)
        except DuplicateKeyError:
            # Already generated for this analysis — the row exists, so it still
            # counts as scheduled: a re-run reports the same totals as the first.
            counts[bucket] += 1
            continue
        except Exception:
            # Count it as failed, never as scheduled. The caller shows these
            # numbers to the user, and telling someone a deadline reminder
            # exists when the write was lost is the one failure this module
            # exists to prevent.
            counts["failed"] += 1
            logger.exception("Failed to store reminder for analysis %s", analysis_id)
            continue

        counts[bucket] += 1

    logger.info("Generated reminders for analysis %s: %s", analysis_id, counts)
    return counts


async def generate_safely(
    analysis_id: str,
    user_id: str,
    file_name: str,
    key_dates: list[dict[str, Any]],
) -> None:
    """Fire-and-forget wrapper for the analysis routes.

    Reminder generation is a bonus on top of the analysis the user is waiting
    for; a failure here must never turn a successful analysis into an error.
    """
    try:
        await generate_for_analysis(analysis_id, user_id, file_name, key_dates)
    except Exception:
        logger.exception("Reminder generation failed for analysis %s", analysis_id)


async def list_for_analysis(analysis_id: str, user_id: str) -> list[dict[str, Any]]:
    """Reminders for one analysis, scoped to its owner."""
    db = get_db()
    cursor = db[COLLECTION].find({"analysisId": analysis_id, "userId": user_id})
    out = []
    async for doc in cursor:
        due = doc.get("dueDate")
        out.append(
            {
                "id": str(doc["_id"]),
                "description": doc.get("description", ""),
                "sourceDate": doc.get("sourceDate", ""),
                "dueDate": due.date().isoformat() if isinstance(due, datetime) else None,
                "schedulable": doc.get("schedulable", False),
                "reason": doc.get("reason"),
                "needsAttention": doc.get("needsAttention", False),
                "sentLeads": doc.get("sentLeads", []),
            }
        )
    return out


async def set_due_date(reminder_id: str, user_id: str, due: date) -> bool:
    """Let the user supply the date we refused to guess.

    Returns False if the reminder isn't theirs or doesn't exist.
    """
    db = get_db()
    result = await db[COLLECTION].update_one(
        {"_id": ObjectId(reminder_id), "userId": user_id},
        {
            "$set": {
                "dueDate": _as_utc_midnight(due),
                "schedulable": True,
                "needsAttention": False,
                "reason": None,
                # A new date is a new deadline, so past sends don't apply.
                "sentLeads": [],
                "updatedAt": datetime.now(timezone.utc),
            }
        },
    )
    return bool(result and getattr(result, "matched_count", 0))


async def delete_for_analysis(analysis_id: str, user_id: str) -> None:
    """Drop an analysis's reminders. Best-effort, called on analysis delete."""
    try:
        db = get_db()
        await db[COLLECTION].delete_many({"analysisId": analysis_id, "userId": user_id})
    except Exception:
        logger.exception("Failed to delete reminders for analysis %s", analysis_id)


def due_lead(days_until: int, leads: list[int], sent_leads: list[int]) -> int | None:
    """Which lead time to email for now, or None.

    ``leads`` is descending. A lead has "arrived" once ``days_until <= lead``.
    We fire the largest arrived lead that hasn't been sent, which makes the sweep
    tolerant of an outage: if the 14- and 7-day marks both passed unsent, the user
    gets one email now rather than two, and rather than nothing.
    """
    if days_until < 0:
        return None
    arrived = [lead for lead in leads if days_until <= lead]
    unsent = [lead for lead in arrived if lead not in sent_leads]
    return max(unsent) if unsent else None


async def _collect_due(today: date) -> dict[str, list[dict[str, Any]]]:
    """Group due reminders by user id, skipping opted-out users."""
    db = get_db()
    # Widen to the *maximum configurable* lead, not the default one: a user who
    # asked for 90 days notice must be loaded 90 days out, and the horizon is
    # computed before we know whose reminders these are. Reading the actual
    # per-user maxima would mean a scan of `users` on every sweep to shave a
    # window that is already tiny — reminders are one row per contract deadline,
    # bounded by MAX_REMINDERS_PER_ANALYSIS, and `due_lead` below still does the
    # real per-user filtering. The index on dueDate makes the wider range cost
    # the same lookup, just a few more rows.
    horizon = _as_utc_midnight(today + timedelta(days=MAX_LEAD_DAYS + 1))
    cursor = db[COLLECTION].find(
        {
            "schedulable": True,
            "dueDate": {"$gte": _as_utc_midnight(today), "$lt": horizon},
        }
    )

    candidates: list[dict[str, Any]] = []
    async for doc in cursor:
        candidates.append(doc)

    by_user: dict[str, list[dict[str, Any]]] = defaultdict(list)
    user_cache: dict[str, dict[str, Any] | None] = {}

    for doc in candidates:
        user_id = doc.get("userId")
        due = _to_date(doc.get("dueDate"))
        if not user_id or due is None:
            continue

        if user_id not in user_cache:
            try:
                user_cache[user_id] = await db.users.find_one({"_id": ObjectId(user_id)})
            except Exception:
                user_cache[user_id] = None
        user = user_cache[user_id]

        if not reminders_enabled(user) or not user.get("email"):
            continue

        lead = due_lead((due - today).days, lead_days_for(user), doc.get("sentLeads", []))
        if lead is None:
            continue

        by_user[user_id].append({"doc": doc, "due": due, "lead": lead, "user": user})

    return by_user


async def run_sweep(*, today: date | None = None, dry_run: bool = False) -> dict[str, Any]:
    """Email every user their due deadlines as one digest.

    One email per user per run, not per reminder: three deadlines landing the
    same week should not be three emails. ``dry_run`` reports what would be sent
    without sending or marking anything, so the schedule can be verified safely.
    """
    if today is None:
        today = datetime.now(timezone.utc).date()

    by_user = await _collect_due(today)
    summary = {
        "date": today.isoformat(),
        "usersNotified": 0,
        "remindersSent": 0,
        "failures": 0,
        "dryRun": dry_run,
    }

    db = get_db()
    for user_id, items in by_user.items():
        user = items[0]["user"]
        items.sort(key=lambda item: item["due"])
        payload = [
            {
                "description": item["doc"].get("description", ""),
                "fileName": item["doc"].get("fileName", "your document"),
                "dueDate": item["due"].isoformat(),
                "daysUntil": (item["due"] - today).days,
            }
            for item in items
        ]

        if dry_run:
            summary["usersNotified"] += 1
            summary["remindersSent"] += len(payload)
            continue

        try:
            await send_deadline_reminder_email(
                to_email=user["email"],
                user_name=user.get("username") or "there",
                reminders=payload,
                unsubscribe_url=build_unsubscribe_url(user_id),
            )
        except Exception:
            # Leave sentLeads untouched so the next run retries this user.
            logger.exception("Failed to send reminder digest to user %s", user_id)
            summary["failures"] += 1
            continue

        # Mark every arrived lead, not just the one we emailed, so the shorter
        # leads we skipped past during an outage don't fire a second mail.
        for item in items:
            leads = lead_days_for(user)
            days_until = (item["due"] - today).days
            arrived = [lead for lead in leads if days_until <= lead]
            try:
                await db[COLLECTION].update_one(
                    {"_id": item["doc"]["_id"]},
                    {
                        "$set": {
                            "sentLeads": sorted(
                                set(item["doc"].get("sentLeads", [])) | set(arrived)
                            ),
                            "lastSentAt": datetime.now(timezone.utc),
                        }
                    },
                )
            except Exception:
                # The email went out; failing to mark it risks one duplicate on
                # the next run, which is much better than failing the sweep.
                logger.exception("Failed to mark reminder %s as sent", item["doc"]["_id"])

        summary["usersNotified"] += 1
        summary["remindersSent"] += len(payload)

    logger.info("Reminder sweep complete: %s", summary)
    return summary


# ── Unsubscribe tokens ───────────────────────────────────────────────────────


UNSUBSCRIBE_TOKEN_TTL_DAYS = 90


def _unsubscribe_signing_key() -> str:
    """Signing key for unsubscribe tokens, derived from — but not equal to — JWT_SECRET.

    These tokens ride in an email URL query string, so they leak into proxy
    logs, mail archives and referrers. Using a distinct key makes it
    structurally impossible for one to verify as a session token (and vice
    versa) no matter what the ``purpose`` claim says: the signature simply
    won't check out. Derived rather than configured so there is no extra secret
    to deploy, and rotating JWT_SECRET rotates this too.
    """
    import hashlib
    import hmac

    from app.config import get_settings

    return hmac.new(
        get_settings().JWT_SECRET.encode(), b"unsubscribe-v1", hashlib.sha256
    ).hexdigest()


def build_unsubscribe_token(user_id: str) -> str:
    """Signed, long-lived token so unsubscribing needs no login.

    Scoped with a purpose claim *and* a separate signing key so it can't be
    replayed as a session token, and expires so a leaked link isn't forever.
    """
    from jose import jwt

    from app.config import get_settings

    settings = get_settings()
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {
            "userId": user_id,
            "purpose": "unsubscribe",
            "iat": now,
            "exp": now + timedelta(days=UNSUBSCRIBE_TOKEN_TTL_DAYS),
        },
        _unsubscribe_signing_key(),
        algorithm=settings.JWT_ALGORITHM,
    )


def read_unsubscribe_token(token: str) -> str | None:
    """Return the user id from an unsubscribe token, or None if it isn't one.

    None covers every rejection reason — wrong key, wrong purpose, expired,
    malformed — because the caller renders the same "link isn't valid" page for
    all of them and shouldn't leak which.
    """
    from jose import JWTError, jwt

    from app.config import get_settings

    settings = get_settings()
    try:
        payload = jwt.decode(token, _unsubscribe_signing_key(), algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        # jose raises ExpiredSignatureError (a JWTError subclass) for an expired
        # token, so this covers expiry as well as bad signatures and garbage.
        return None
    if payload.get("purpose") != "unsubscribe":
        return None
    return payload.get("userId")


def build_unsubscribe_url(user_id: str) -> str:
    from app.config import get_settings

    base = get_settings().FRONTEND_URL.rstrip("/")
    return f"{base}/api/reminders/unsubscribe?token={build_unsubscribe_token(user_id)}"
