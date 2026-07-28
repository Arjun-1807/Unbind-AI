"""Shared plan helpers.

Keeps the "is this user's plan still valid?" rule and the per-plan quotas in
one place so the rate limiter, the lawyer-directory gate and the plan endpoint
can't drift apart.
"""

from datetime import datetime, timezone
from typing import Any

# Daily full-analysis limits per plan (None = unlimited).
PLAN_LIMITS: dict[str | None, int | None] = {
    None: 1,  # free tier: 1 analysis per day
    "Brief": 3,
    "Motion": 5,
    "Verdict": None,  # unlimited
}

# Daily limits for the cheap follow-up LLM calls (impact simulator, negotiation
# message drafting). These cost a fraction of a full analysis, so they get their
# own, more generous counter rather than eating into the analysis quota — but
# they are metered, because an unbounded LLM endpoint is an unbounded bill.
QUERY_LIMITS: dict[str | None, int | None] = {
    None: 10,  # free tier: 10 follow-up questions per day
    "Brief": 40,
    "Motion": 100,
    "Verdict": None,  # unlimited
}

# Default quota applied when a user's plan string isn't in the map (e.g. a plan
# that was renamed or removed). Treat unknown as free tier.
_UNKNOWN_PLAN_DEFAULT = 1


def plan_limit(plan: str | None) -> int | None:
    """Daily analysis quota for ``plan``; None means unlimited."""
    return PLAN_LIMITS.get(plan, _UNKNOWN_PLAN_DEFAULT)


def query_limit(plan: str | None) -> int | None:
    """Daily follow-up-query quota for ``plan``; None means unlimited."""
    return QUERY_LIMITS.get(plan, QUERY_LIMITS[None])


def effective_plan(user: dict[str, Any] | None) -> str | None:
    """Return the user's plan, or None if they have none or it has expired.

    Time-limited plans (Brief/Motion) store a ``planExpiresAt``; once that
    passes the user falls back to the free tier. Lifetime plans (Verdict) store
    no expiry, so they never lapse. Users seeded without an expiry (e.g. in
    tests, or pre-existing accounts) are treated as non-expiring.
    """
    if not user:
        return None

    plan = user.get("plan")
    if not plan:
        return None

    expires_at = user.get("planExpiresAt")
    if expires_at is not None:
        # Mongo may hand back a naive datetime; assume it was stored as UTC.
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) >= expires_at:
            return None

    return plan
