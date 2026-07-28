"""Atomic per-user daily quota accounting.

Two things this gets right that a plain read-compare-write does not:

1. **Concurrency.** The quota is claimed with a single conditional update, so
   two simultaneous requests can't both observe "0 used" and both proceed. The
   loser of the race gets the 429.
2. **Failure.** The claim is *reserved* before the expensive work and
   *released* if that work fails, so a user never loses a day's allowance to an
   error they didn't cause (a scanned photo that OCRs badly, a document the
   classifier rejects, an upstream 500).

Counters live on the user document as a (count, date) pair; the date is a UTC
``YYYY-MM-DD`` string and a mismatch means "new day, start from zero".
"""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import HTTPException

from app.database import get_db
from app.services.plan_service import effective_plan, plan_limit, query_limit


@dataclass(frozen=True)
class Counter:
    """One quota bucket: where it's stored, what it's called, how big it is."""

    count_field: str
    date_field: str
    limit_for: Callable[[str | None], int | None]
    noun: str  # used in the 429 message, e.g. "analysis"


ANALYSIS = Counter("dailyAnalysisCount", "lastAnalysisDate", plan_limit, "analysis")
QUERY = Counter("dailyQueryCount", "lastQueryDate", query_limit, "AI query")


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


async def reserve(user_id: str, counter: Counter = ANALYSIS) -> bool:
    """Claim one unit of ``counter`` for the user, or raise HTTP 429.

    Returns True when a unit was actually consumed and False for unlimited
    plans — pass that value to :func:`release` so an unlimited plan's failure
    path doesn't decrement a counter it never incremented.
    """
    db = get_db()
    oid = ObjectId(user_id)

    user = await db.users.find_one({"_id": oid})
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # An expired paid plan falls back to the free tier's quota.
    plan = effective_plan(user)
    limit = counter.limit_for(plan)
    if limit is None:
        return False

    today = _today()

    # Roll the counter over to today. Idempotent, so concurrent callers racing
    # across a midnight boundary just write the same values. The $exists arm
    # covers accounts that predate this counter and have no count field yet —
    # without it the $lt below would not match and they'd be locked out.
    await db.users.update_one(
        {
            "_id": oid,
            "$or": [
                {counter.date_field: {"$ne": today}},
                {counter.count_field: {"$exists": False}},
            ],
        },
        {"$set": {counter.count_field: 0, counter.date_field: today}},
    )

    # The actual gate: increment only while still under the limit. If the filter
    # doesn't match, the quota is spent.
    claimed = await db.users.find_one_and_update(
        {"_id": oid, counter.count_field: {"$lt": limit}},
        {"$inc": {counter.count_field: 1}},
    )
    if claimed is None:
        raise HTTPException(
            status_code=429,
            detail=(
                f"Daily {counter.noun} limit reached for your plan "
                f"({'Free' if plan is None else plan}). "
                f"Limit: {limit} per day. Upgrade your plan to continue."
            ),
        )
    return True


async def release(user_id: str, counter: Counter = ANALYSIS, *, reserved: bool = True) -> None:
    """Hand back a unit reserved by :func:`reserve` after the work failed.

    Best-effort and never raises: refunding a quota must not turn a handled
    error into a 500. The date guard means a refund arriving after midnight is
    dropped rather than pushing tomorrow's counter negative.
    """
    if not reserved:
        return
    try:
        db = get_db()
        await db.users.update_one(
            {
                "_id": ObjectId(user_id),
                counter.date_field: _today(),
                counter.count_field: {"$gt": 0},
            },
            {"$inc": {counter.count_field: -1}},
        )
    except Exception:  # pragma: no cover - refund is advisory
        pass


async def usage(user_id: str, counter: Counter = ANALYSIS) -> tuple[int, int | None]:
    """Return ``(used_today, limit)`` for display. ``limit`` None = unlimited."""
    db = get_db()
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    limit = counter.limit_for(effective_plan(user))
    used = user.get(counter.count_field, 0) if user.get(counter.date_field) == _today() else 0
    return used, limit
