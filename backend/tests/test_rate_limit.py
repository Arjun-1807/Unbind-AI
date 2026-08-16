"""Tests for the two throttles: per-plan daily quotas and the HTTP rate limiter.

The quota tests (app.services.quota_service) assert on observable state — the
counter stored on the user document — rather than on the shape of the update
calls, so the accounting can change implementation without the tests needing to.

The rate-limiter tests (app.security_middleware) live here too because they
cover the same "how many of these may you do" question one layer out, at the
edge, keyed on client IP instead of on user id.
"""

from datetime import datetime, timedelta, timezone

import pytest
from bson import ObjectId
from fastapi import HTTPException
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import PlainTextResponse
from starlette.routing import Route
from starlette.testclient import TestClient

from app import security_middleware
from app.security_middleware import RATE_LIMITS, RateLimitMiddleware, RateLimitRule
from app.services import quota_service
from app.services.quota_service import ANALYSIS, QUERY, release, reserve, usage


def _today():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _yesterday():
    return (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")


def _count(db, user, field="dailyAnalysisCount"):
    return db.users._docs[str(user["_id"])].get(field)


# ── Per-plan limits ──────────────────────────────────────────────────────────


@pytest.mark.parametrize("plan,limit", [(None, 1), ("Brief", 3), ("Motion", 5)])
async def test_first_analysis_of_day_allowed_and_increments(seed_user, plan, limit):
    user = seed_user(plan=plan, dailyAnalysisCount=0, lastAnalysisDate=_today())
    assert await reserve(str(user["_id"]), ANALYSIS) is True

    db = seed_user.db
    assert _count(db, user) == 1
    assert db.users._docs[str(user["_id"])]["lastAnalysisDate"] == _today()


@pytest.mark.parametrize("plan,limit", [(None, 1), ("Brief", 3), ("Motion", 5)])
async def test_quota_can_be_spent_exactly_to_the_limit(seed_user, plan, limit):
    user = seed_user(plan=plan, dailyAnalysisCount=0, lastAnalysisDate=_today())
    for _ in range(limit):
        await reserve(str(user["_id"]), ANALYSIS)
    assert _count(seed_user.db, user) == limit

    with pytest.raises(HTTPException) as exc:
        await reserve(str(user["_id"]), ANALYSIS)
    assert exc.value.status_code == 429


@pytest.mark.parametrize("plan,limit", [(None, 1), ("Brief", 3), ("Motion", 5)])
async def test_429_when_quota_reached(seed_user, plan, limit):
    user = seed_user(plan=plan, dailyAnalysisCount=limit, lastAnalysisDate=_today())
    with pytest.raises(HTTPException) as exc:
        await reserve(str(user["_id"]), ANALYSIS)
    assert exc.value.status_code == 429
    # Rejection must not push the counter past the limit.
    assert _count(seed_user.db, user) == limit


async def test_verdict_plan_is_unlimited(seed_user):
    # A count far above any finite limit must still pass for Verdict.
    user = seed_user(plan="Verdict", dailyAnalysisCount=9999, lastAnalysisDate=_today())
    # Returns False: nothing was consumed, so there is nothing to refund.
    assert await reserve(str(user["_id"]), ANALYSIS) is False
    assert seed_user.db.users.update_calls == []


async def test_unknown_plan_defaults_to_free_limit(seed_user):
    user = seed_user(plan="Mystery", dailyAnalysisCount=1, lastAnalysisDate=_today())
    with pytest.raises(HTTPException) as exc:
        await reserve(str(user["_id"]), ANALYSIS)
    assert exc.value.status_code == 429


async def test_expired_paid_plan_falls_back_to_free_quota(seed_user):
    """A lapsed Motion plan must get the free tier's 1/day, not Motion's 5."""
    expired = datetime.now(timezone.utc) - timedelta(days=1)
    user = seed_user(
        plan="Motion",
        planExpiresAt=expired,
        dailyAnalysisCount=1,
        lastAnalysisDate=_today(),
    )
    with pytest.raises(HTTPException) as exc:
        await reserve(str(user["_id"]), ANALYSIS)
    assert exc.value.status_code == 429


# ── Daily counter reset ──────────────────────────────────────────────────────


async def test_counter_resets_on_new_day(seed_user):
    """A stale count from yesterday must reset, so today's first call passes."""
    user = seed_user(plan="Brief", dailyAnalysisCount=3, lastAnalysisDate=_yesterday())
    await reserve(str(user["_id"]), ANALYSIS)

    stored = seed_user.db.users._docs[str(user["_id"])]
    assert stored["dailyAnalysisCount"] == 1
    assert stored["lastAnalysisDate"] == _today()


async def test_missing_counter_fields_treated_as_zero(seed_user):
    user = seed_user(plan="Brief")  # no dailyAnalysisCount / lastAnalysisDate
    await reserve(str(user["_id"]), ANALYSIS)
    assert _count(seed_user.db, user) == 1


async def test_account_dated_today_but_missing_counter_is_not_locked_out(seed_user):
    """An account stamped with today's date but no count field must still pass.

    A `$lt` filter does not match a missing field, so without the $exists arm in
    the rollover this user would be permanently rejected.
    """
    user = seed_user(plan="Brief", lastAnalysisDate=_today())
    await reserve(str(user["_id"]), ANALYSIS)
    assert _count(seed_user.db, user) == 1


# ── Refund on failure ────────────────────────────────────────────────────────


async def test_release_leaves_the_attempt_counter_alone(seed_user):
    """A refund gives back the allowance but never the attempt.

    This is the property that terminates a fail-and-get-refunded loop: the
    refundable counter returns to 0, but the attempt counter only ever climbs.
    """
    user = seed_user(plan=None, dailyAnalysisCount=0, lastAnalysisDate=_today())
    uid = str(user["_id"])

    reserved = await reserve(uid, ANALYSIS)
    await release(uid, ANALYSIS, reserved=reserved)

    assert _count(seed_user.db, user) == 0
    assert _count(seed_user.db, user, "dailyAnalysisAttemptCount") == 1


async def test_release_refunds_a_reserved_unit(seed_user):
    user = seed_user(plan=None, dailyAnalysisCount=0, lastAnalysisDate=_today())
    uid = str(user["_id"])

    reserved = await reserve(uid, ANALYSIS)
    assert _count(seed_user.db, user) == 1

    await release(uid, ANALYSIS, reserved=reserved)
    assert _count(seed_user.db, user) == 0

    # The refund genuinely restores the ability to analyse again today.
    await reserve(uid, ANALYSIS)
    assert _count(seed_user.db, user) == 1


async def test_release_is_a_noop_when_nothing_was_reserved(seed_user):
    """Unlimited plans reserve nothing, so their failure path must not decrement."""
    user = seed_user(plan="Verdict", dailyAnalysisCount=7, lastAnalysisDate=_today())
    await release(str(user["_id"]), ANALYSIS, reserved=False)
    assert _count(seed_user.db, user) == 7


async def test_release_never_drives_the_counter_negative(seed_user):
    user = seed_user(plan="Brief", dailyAnalysisCount=0, lastAnalysisDate=_today())
    await release(str(user["_id"]), ANALYSIS)
    assert _count(seed_user.db, user) == 0


async def test_release_after_midnight_does_not_touch_tomorrows_counter(seed_user):
    """A refund whose day has already rolled over is dropped, not applied."""
    user = seed_user(plan="Brief", dailyAnalysisCount=2, lastAnalysisDate=_yesterday())
    await release(str(user["_id"]), ANALYSIS)
    assert _count(seed_user.db, user) == 2


# ── The never-refunded attempt ceiling ───────────────────────────────────────
#
# Refunding is necessary (a user shouldn't lose their day to our outage) but on
# its own it is a hole: every refund reopens the gate, so a caller that fails
# after the LLM has been billed can loop forever. The attempt counter is the
# backstop — it is never handed back, so the loop is bounded regardless.


@pytest.mark.parametrize("plan,limit", [(None, 1), ("Brief", 3), ("Motion", 5)])
async def test_a_refund_loop_terminates_at_the_attempt_ceiling(seed_user, plan, limit):
    user = seed_user(plan=plan, dailyAnalysisCount=0, lastAnalysisDate=_today())
    uid = str(user["_id"])
    ceiling = quota_service.attempt_limit(limit)

    # Reserve-then-refund, exactly what a user-fault failure path used to do.
    for _ in range(ceiling):
        reserved = await reserve(uid, ANALYSIS)
        await release(uid, ANALYSIS, reserved=reserved)

    # Quota looks untouched, so the old code would have carried on indefinitely.
    assert _count(seed_user.db, user) == 0
    with pytest.raises(HTTPException) as exc:
        await reserve(uid, ANALYSIS)
    assert exc.value.status_code == 429
    assert "attempts" in exc.value.detail


async def test_attempt_ceiling_rejection_does_not_consume_quota(seed_user):
    """The rejected call reserved nothing, so the allowance must be untouched."""
    user = seed_user(
        plan="Brief",
        dailyAnalysisCount=0,
        dailyAnalysisAttemptCount=quota_service.attempt_limit(3),
        lastAnalysisDate=_today(),
    )
    with pytest.raises(HTTPException):
        await reserve(str(user["_id"]), ANALYSIS)
    assert _count(seed_user.db, user) == 0


async def test_plain_quota_rejection_does_not_burn_an_attempt(seed_user):
    """A 'you've used your allowance' 429 is not a failed attempt."""
    user = seed_user(
        plan=None,
        dailyAnalysisCount=1,
        dailyAnalysisAttemptCount=1,
        lastAnalysisDate=_today(),
    )
    with pytest.raises(HTTPException) as exc:
        await reserve(str(user["_id"]), ANALYSIS)
    assert "limit reached" in exc.value.detail
    assert _count(seed_user.db, user, "dailyAnalysisAttemptCount") == 1


async def test_attempt_counter_resets_on_a_new_day(seed_user):
    user = seed_user(
        plan="Brief",
        dailyAnalysisCount=3,
        dailyAnalysisAttemptCount=quota_service.attempt_limit(3),
        lastAnalysisDate=_yesterday(),
    )
    await reserve(str(user["_id"]), ANALYSIS)

    stored = seed_user.db.users._docs[str(user["_id"])]
    assert stored["dailyAnalysisCount"] == 1
    assert stored["dailyAnalysisAttemptCount"] == 1


async def test_account_predating_the_attempt_counter_keeps_todays_usage(seed_user):
    """Backfilling the new field must not silently reset an accrued count.

    A free-tier user who already analysed today has no attempt field yet; if the
    backfill shared the rollover's filter it would zero their count too and hand
    out a bonus analysis on the day this ships.
    """
    user = seed_user(plan=None, dailyAnalysisCount=1, lastAnalysisDate=_today())
    with pytest.raises(HTTPException) as exc:
        await reserve(str(user["_id"]), ANALYSIS)
    assert exc.value.status_code == 429
    assert _count(seed_user.db, user) == 1
    assert _count(seed_user.db, user, "dailyAnalysisAttemptCount") == 0


async def test_query_counter_has_its_own_attempt_ceiling(seed_user):
    user = seed_user(plan=None, lastQueryDate=_today())
    uid = str(user["_id"])
    ceiling = quota_service.attempt_limit(10)

    for _ in range(ceiling):
        reserved = await reserve(uid, QUERY)
        await release(uid, QUERY, reserved=reserved)

    with pytest.raises(HTTPException) as exc:
        await reserve(uid, QUERY)
    assert exc.value.status_code == 429
    assert _count(seed_user.db, user, "dailyQueryAttemptCount") == ceiling
    # The analysis counters are untouched by any of this.
    assert _count(seed_user.db, user, "dailyAnalysisAttemptCount") is None


# ── The query counter is independent of the analysis counter ─────────────────


async def test_query_quota_is_separate_from_analysis_quota(seed_user):
    user = seed_user(plan=None, dailyAnalysisCount=1, lastAnalysisDate=_today())
    uid = str(user["_id"])

    # Analysis quota is spent…
    with pytest.raises(HTTPException):
        await reserve(uid, ANALYSIS)
    # …but follow-up queries still work.
    assert await reserve(uid, QUERY) is True
    assert _count(seed_user.db, user, "dailyQueryCount") == 1
    assert _count(seed_user.db, user) == 1  # unchanged


async def test_query_quota_is_enforced(seed_user):
    """Free tier gets 10 follow-up queries; the 11th is rejected."""
    user = seed_user(plan=None)
    uid = str(user["_id"])
    for _ in range(10):
        await reserve(uid, QUERY)

    with pytest.raises(HTTPException) as exc:
        await reserve(uid, QUERY)
    assert exc.value.status_code == 429
    assert "AI query" in exc.value.detail


async def test_verdict_plan_query_quota_is_unlimited(seed_user):
    user = seed_user(plan="Verdict", dailyQueryCount=10_000, lastQueryDate=_today())
    assert await reserve(str(user["_id"]), QUERY) is False


# ── Usage reporting ──────────────────────────────────────────────────────────


async def test_usage_reports_zero_for_a_stale_day(seed_user):
    user = seed_user(plan="Brief", dailyAnalysisCount=3, lastAnalysisDate=_yesterday())
    used, limit = await usage(str(user["_id"]), ANALYSIS)
    assert (used, limit) == (0, 3)


async def test_usage_reports_unlimited_as_none(seed_user):
    user = seed_user(plan="Verdict", dailyAnalysisCount=4, lastAnalysisDate=_today())
    used, limit = await usage(str(user["_id"]), ANALYSIS)
    assert (used, limit) == (4, None)


# ── Auth guard ───────────────────────────────────────────────────────────────


async def test_missing_user_raises_401(fake_db):
    with pytest.raises(HTTPException) as exc:
        await reserve(str(ObjectId()), ANALYSIS)
    assert exc.value.status_code == 401


async def test_release_swallows_errors(monkeypatch, seed_user):
    """Refunding must never turn a handled error into a 500."""
    user = seed_user(plan="Brief", dailyAnalysisCount=1, lastAnalysisDate=_today())

    def _boom():
        raise RuntimeError("database is down")

    monkeypatch.setattr(quota_service, "get_db", _boom)
    await release(str(user["_id"]), ANALYSIS)  # must not raise


# ── HTTP rate limiter: client IP attribution ─────────────────────────────────
#
# Every rule in RATE_LIMITS is only as strong as the bucket key, so these tests
# are really about one thing: an attacker must not be able to choose their own
# key. Proxies APPEND to X-Forwarded-For, so anything the client sent itself
# sits on the LEFT and only the rightmost entries are written by our own edge.


def _request(headers: dict[str, str] | None = None, peer: str | None = "10.0.0.9") -> Request:
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/api/auth/login",
        "headers": [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()],
        "client": (peer, 12345) if peer else None,
    }
    return Request(scope)


def test_client_ip_ignores_the_attacker_supplied_left_hand_entries():
    """The forged value the client prepended must never become the bucket key."""
    request = _request({"X-Forwarded-For": "1.2.3.4, 203.0.113.7"})
    assert security_middleware.client_ip(request) == "203.0.113.7"


def test_client_ip_uses_the_header_when_it_holds_only_the_edge_entry():
    request = _request({"X-Forwarded-For": "203.0.113.7"})
    assert security_middleware.client_ip(request) == "203.0.113.7"


def test_client_ip_falls_back_to_the_socket_peer_without_the_header():
    assert security_middleware.client_ip(_request()) == "10.0.0.9"


def test_client_ip_falls_back_when_the_header_is_shorter_than_the_proxy_chain(monkeypatch):
    """Too few entries means the request skipped a hop — trust the peer, not it."""
    monkeypatch.setattr(security_middleware, "TRUSTED_PROXY_HOPS", 2)
    assert security_middleware.client_ip(_request({"X-Forwarded-For": "1.2.3.4"})) == "10.0.0.9"


def test_client_ip_indexes_back_by_the_configured_hop_count(monkeypatch):
    monkeypatch.setattr(security_middleware, "TRUSTED_PROXY_HOPS", 2)
    request = _request({"X-Forwarded-For": "1.2.3.4, 203.0.113.7, 198.51.100.2"})
    assert security_middleware.client_ip(request) == "203.0.113.7"


def test_client_ip_ignores_the_header_entirely_when_no_proxy_is_configured(monkeypatch):
    monkeypatch.setattr(security_middleware, "TRUSTED_PROXY_HOPS", 0)
    request = _request({"X-Forwarded-For": "1.2.3.4"})
    assert security_middleware.client_ip(request) == "10.0.0.9"


def test_client_ip_skips_empty_entries():
    assert security_middleware.client_ip(_request({"X-Forwarded-For": "1.2.3.4, "})) == "1.2.3.4"


def test_client_ip_survives_a_missing_socket_peer():
    assert security_middleware.client_ip(_request(peer=None)) == "unknown"


# ── HTTP rate limiter: end-to-end ────────────────────────────────────────────


def _limited_client(rules) -> TestClient:
    async def _ok(request):
        return PlainTextResponse("ok")

    app = Starlette(routes=[Route("/{path:path}", _ok, methods=["POST", "GET"])])
    app.add_middleware(RateLimitMiddleware, rules=rules)
    return TestClient(app)


def test_rotating_x_forwarded_for_no_longer_buys_a_fresh_bucket():
    """The bug this encodes: one attacker, one bucket, however they spoof.

    Before the fix client_ip() took parts[0] — fully attacker-chosen — so each
    request below landed in its own bucket and the 3/hour limit never fired.

    The header is built the way the wire actually delivers it: the attacker's
    rotating forgery, then the address our edge appended, which is constant
    because it is the same attacker every time.
    """
    client = _limited_client([RateLimitRule("/api/auth/signup", 3, 3600)])

    statuses = [
        client.post(
            "/api/auth/signup", headers={"X-Forwarded-For": f"1.2.3.{i}, 203.0.113.7"}
        ).status_code
        for i in range(6)
    ]
    assert statuses == [200, 200, 200, 429, 429, 429]


def test_distinct_real_clients_still_get_their_own_buckets():
    """The fix must not collapse everyone behind the proxy into one bucket."""
    client = _limited_client([RateLimitRule("/api/auth/signup", 1, 3600)])

    # Same forged prefix, different genuine edge-appended address.
    first = client.post("/api/auth/signup", headers={"X-Forwarded-For": "1.2.3.4, 203.0.113.7"})
    second = client.post("/api/auth/signup", headers={"X-Forwarded-For": "1.2.3.4, 198.51.100.2"})
    assert (first.status_code, second.status_code) == (200, 200)

    repeat = client.post("/api/auth/signup", headers={"X-Forwarded-For": "9.9.9.9, 203.0.113.7"})
    assert repeat.status_code == 429


def test_google_sign_in_is_throttled_like_signup():
    """POST /api/auth/google creates accounts too, so it needs signup's ceiling."""
    rule = next(r for r in RATE_LIMITS if r.prefix == "/api/auth/google")
    signup = next(r for r in RATE_LIMITS if r.prefix == "/api/auth/signup")
    assert (rule.limit, rule.window) == (signup.limit, signup.window)

    client = _limited_client(RATE_LIMITS)
    for _ in range(rule.limit):
        assert client.post("/api/auth/google").status_code == 200
    assert client.post("/api/auth/google").status_code == 429
