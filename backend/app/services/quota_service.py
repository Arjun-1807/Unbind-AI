"""Atomic per-user daily quota accounting.

Three things this gets right that a plain read-compare-write does not:

1. **Concurrency.** The quota is claimed with a single conditional update, so
   two simultaneous requests can't both observe "0 used" and both proceed. The
   loser of the race gets the 429.
2. **Failure.** The claim is *reserved* before the expensive work and
   *released* if that work turns out to have failed for a reason that cost us
   nothing — an upstream 5xx, a timeout, a dropped connection. A refund is
   *not* granted for a failure the user's own input caused, because by then the
   LLM tokens have already been paid for. See ``analysis_routes`` for the
   classification.
3. **Refund loops.** Every reservation also bumps a second counter that is
   *never* refunded (``dailyAnalysisAttemptCount`` /
   ``dailyQueryAttemptCount``), capped at ``_ATTEMPT_MULTIPLIER`` times the
   plan's quota. Without it a refundable failure path is an infinite loop: each
   iteration hands the unit straight back, so the gate never closes and one
   free account can spend an unbounded amount on LLM calls. The attempt ceiling
   is what actually terminates such a loop.

Counters live on the user document as a (count, attempts, date) triple; the
date is a UTC ``YYYY-MM-DD`` string and a mismatch means "new day, start from
zero".
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
    attempt_field: str  # never-refunded companion counter


# How many attempts a plan gets per day, as a multiple of its refundable quota.
# Generous enough that someone genuinely fighting a flaky scan or a wobbly
# upstream still gets their allowance, tight enough that a scripted
# fail-and-get-refunded loop stops after a bounded number of LLM calls.
_ATTEMPT_MULTIPLIER = 3


ANALYSIS = Counter(
    "dailyAnalysisCount",
    "lastAnalysisDate",
    plan_limit,
    "analysis",
    "dailyAnalysisAttemptCount",
)
QUERY = Counter(
    "dailyQueryCount",
    "lastQueryDate",
    query_limit,
    "AI query",
    "dailyQueryAttemptCount",
)


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def attempt_limit(limit: int) -> int:
    """The never-refunded attempt ceiling that corresponds to a quota of ``limit``."""
    return limit * _ATTEMPT_MULTIPLIER


async def reserve(user_id: str, counter: Counter = ANALYSIS) -> bool:
    """Claim one unit of ``counter`` for the user, or raise HTTP 429.

    Two gates have to open. The refundable quota counter is the user's daily
    allowance; the attempt counter is a hard ceiling on how many times they may
    *start* the work today, refunds included. Both are claimed with a single
    conditional update each, so concurrent callers can't both squeeze past.

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
    plan_name = "Free" if plan is None else plan

    # Roll the counters over to today. Idempotent, so concurrent callers racing
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
        {
            "$set": {
                counter.count_field: 0,
                counter.attempt_field: 0,
                counter.date_field: today,
            }
        },
    )

    # Backfill the attempt counter on accounts that predate it, separately from
    # the rollover above: folding this into that $or would reset a count already
    # accrued today, handing every existing account a free extra analysis on the
    # day this ships.
    await db.users.update_one(
        {"_id": oid, counter.attempt_field: {"$exists": False}},
        {"$set": {counter.attempt_field: 0}},
    )

    # Gate one: the refundable allowance. Increment only while still under the
    # limit. If the filter doesn't match, the quota is spent.
    claimed = await db.users.find_one_and_update(
        {"_id": oid, counter.count_field: {"$lt": limit}},
        {"$inc": {counter.count_field: 1}},
    )
    if claimed is None:
        raise HTTPException(
            status_code=429,
            detail=(
                f"Daily {counter.noun} limit reached for your plan "
                f"({plan_name}). "
                f"Limit: {limit} per day. Upgrade your plan to continue."
            ),
        )

    # Gate two: the attempt ceiling, which no failure path ever hands back. This
    # is the one that terminates a fail-refund-retry loop. Claimed after the
    # quota so an ordinary "you've used your allowance" 429 doesn't burn an
    # attempt; if it doesn't open, give the unit just claimed straight back —
    # nothing was spent on it — and reject.
    attempts_max = attempt_limit(limit)
    attempted = await db.users.find_one_and_update(
        {"_id": oid, counter.attempt_field: {"$lt": attempts_max}},
        {"$inc": {counter.attempt_field: 1}},
    )
    if attempted is None:
        await release(user_id, counter)
        raise HTTPException(
            status_code=429,
            detail=(
                f"Too many {counter.noun} attempts today for your plan "
                f"({plan_name}). Failed and rejected requests count towards this "
                f"cap. Limit: {attempts_max} attempts per day. Try again "
                "tomorrow or upgrade your plan."
            ),
        )
    return True


async def release(user_id: str, counter: Counter = ANALYSIS, *, reserved: bool = True) -> None:
    """Hand back a unit reserved by :func:`reserve` after the work failed.

    Only the refundable counter moves — ``counter.attempt_field`` is deliberately
    left alone, so a caller that keeps failing eventually runs out of attempts
    even though every one of them was refunded.

    Call this only for a failure that cost us nothing (upstream 5xx, timeout,
    dropped connection, database outage). Refunding a failure the user's input
    caused means the LLM tokens were already billed and the counter went back to
    where it started, which is a free unbounded budget.

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
