"""Shared plan helpers.

Keeps the "is this user's plan still valid?" rule in one place so the rate
limiter and the plan endpoint can't drift apart.
"""

from datetime import datetime, timezone
from typing import Any


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
