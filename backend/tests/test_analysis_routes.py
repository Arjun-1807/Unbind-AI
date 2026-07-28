"""Tests for the analysis history routes and the lawyer-directory paywall.

Same direct-call style as the other suites: handlers are awaited with a tiny
fake Request, no server and no network.

The tenancy checks here are the important ones — nothing previously verified
that one user cannot read or delete another user's analyses.
"""

from datetime import datetime, timedelta, timezone

import pytest
from bson import ObjectId
from fastapi import HTTPException

from app import auth
from app.routes import analysis_routes, lawyer_routes


class _ReqWithCookiesHeaders:
    def __init__(self, cookies=None, headers=None):
        self.cookies = cookies or {}
        self.headers = headers or {}


def _authed_request(settings, user_id: str) -> _ReqWithCookiesHeaders:
    return _ReqWithCookiesHeaders(cookies={settings.COOKIE_NAME: auth.create_access_token(user_id)})


def _seed_analysis(db, user_id: str, *, file_name="contract.pdf", date="2026-01-01", text="body"):
    _id = ObjectId()
    db.analyses._docs[str(_id)] = {
        "_id": _id,
        "userId": user_id,
        "fileName": file_name,
        "analysisDate": date,
        "analysisResult": {"summary": "s", "clauses": []},
        "documentText": text,
    }
    return str(_id)


# ── History listing ──────────────────────────────────────────────────────────


async def test_history_omits_document_text(override_settings, seed_user):
    """The list view never renders documentText, and it dominates the payload."""
    user = seed_user()
    uid = str(user["_id"])
    _seed_analysis(seed_user.db, uid, text="a very long contract" * 1000)

    results = await analysis_routes.history(_authed_request(override_settings, uid))

    assert len(results) == 1
    assert "documentText" not in results[0]
    assert results[0]["fileName"] == "contract.pdf"


async def test_history_returns_only_the_callers_analyses(override_settings, seed_user):
    user = seed_user()
    uid = str(user["_id"])
    other = str(ObjectId())
    _seed_analysis(seed_user.db, uid, file_name="mine.pdf")
    _seed_analysis(seed_user.db, other, file_name="theirs.pdf")

    results = await analysis_routes.history(_authed_request(override_settings, uid))

    assert [r["fileName"] for r in results] == ["mine.pdf"]


async def test_history_is_newest_first_and_paginates(override_settings, seed_user):
    user = seed_user()
    uid = str(user["_id"])
    for day in ("2026-01-01", "2026-02-01", "2026-03-01"):
        _seed_analysis(seed_user.db, uid, file_name=f"{day}.pdf", date=day)

    req = _authed_request(override_settings, uid)
    page1 = await analysis_routes.history(req, limit=2, skip=0)
    page2 = await analysis_routes.history(req, limit=2, skip=2)

    assert [r["analysisDate"] for r in page1] == ["2026-03-01", "2026-02-01"]
    assert [r["analysisDate"] for r in page2] == ["2026-01-01"]


# ── Single-analysis fetch: tenancy + id validation ───────────────────────────


async def test_get_analysis_returns_full_document_text(override_settings, seed_user):
    user = seed_user()
    uid = str(user["_id"])
    analysis_id = _seed_analysis(seed_user.db, uid, text="the whole contract")

    doc = await analysis_routes.get_analysis(analysis_id, _authed_request(override_settings, uid))

    assert doc["documentText"] == "the whole contract"


async def test_cannot_read_another_users_analysis(override_settings, seed_user):
    user = seed_user()
    uid = str(user["_id"])
    victim_analysis = _seed_analysis(seed_user.db, str(ObjectId()), text="secret")

    with pytest.raises(HTTPException) as exc:
        await analysis_routes.get_analysis(victim_analysis, _authed_request(override_settings, uid))
    assert exc.value.status_code == 404


async def test_cannot_delete_another_users_analysis(override_settings, seed_user):
    user = seed_user()
    uid = str(user["_id"])
    other = str(ObjectId())
    victim_analysis = _seed_analysis(seed_user.db, other)

    with pytest.raises(HTTPException) as exc:
        await analysis_routes.delete_analysis(
            victim_analysis, _authed_request(override_settings, uid)
        )
    assert exc.value.status_code == 404
    # And it really is still there.
    assert victim_analysis in seed_user.db.analyses._docs


async def test_delete_removes_the_callers_own_analysis(override_settings, seed_user):
    user = seed_user()
    uid = str(user["_id"])
    analysis_id = _seed_analysis(seed_user.db, uid)

    result = await analysis_routes.delete_analysis(
        analysis_id, _authed_request(override_settings, uid)
    )

    assert result == {"ok": True}
    assert analysis_id not in seed_user.db.analyses._docs


@pytest.mark.parametrize("bad_id", ["not-an-objectid", "", "123"])
async def test_malformed_id_is_400_not_500(override_settings, seed_user, bad_id):
    user = seed_user()
    req = _authed_request(override_settings, str(user["_id"]))

    for handler in (analysis_routes.get_analysis, analysis_routes.delete_analysis):
        with pytest.raises(HTTPException) as exc:
            await handler(bad_id, req)
        assert exc.value.status_code == 400


async def test_missing_analysis_is_404(override_settings, seed_user):
    user = seed_user()
    uid = str(user["_id"])
    with pytest.raises(HTTPException) as exc:
        await analysis_routes.get_analysis(str(ObjectId()), _authed_request(override_settings, uid))
    assert exc.value.status_code == 404


# ── Upload size guard ────────────────────────────────────────────────────────


def test_oversized_document_is_rejected():
    oversized = b"x" * (analysis_routes._MAX_DOCUMENT_BYTES + 1)
    with pytest.raises(HTTPException) as exc:
        analysis_routes._reject_if_oversized(oversized, is_image=False)
    assert exc.value.status_code == 413
    assert exc.value.detail == "FILE_TOO_LARGE"


def test_oversized_image_is_rejected():
    oversized = b"x" * (analysis_routes._MAX_IMAGE_BYTES + 1)
    with pytest.raises(HTTPException) as exc:
        analysis_routes._reject_if_oversized(oversized, is_image=True)
    assert exc.value.status_code == 413
    assert exc.value.detail == "IMAGE_TOO_LARGE"


def test_image_under_the_image_cap_passes():
    # An image between the two caps must be judged against the image limit only.
    analysis_routes._reject_if_oversized(b"x" * 1024, is_image=True)
    analysis_routes._reject_if_oversized(b"x" * 1024, is_image=False)


# ── Lawyer directory paywall ─────────────────────────────────────────────────


@pytest.mark.parametrize("plan", [None, "Brief", "Motion"])
async def test_non_verdict_plans_are_denied_the_directory(seed_user, plan):
    user = seed_user(plan=plan)
    with pytest.raises(HTTPException) as exc:
        await lawyer_routes._require_verdict_plan(str(user["_id"]))
    assert exc.value.status_code == 403


async def test_verdict_plan_is_allowed_the_directory(seed_user):
    user = seed_user(plan="Verdict")
    await lawyer_routes._require_verdict_plan(str(user["_id"]))  # must not raise


async def test_expired_verdict_plan_is_denied_the_directory(seed_user):
    """The gate must honour expiry, not just read user["plan"] raw.

    Verdict is sold as lifetime today, but a Verdict record carrying an expiry
    (a refund, a trial, a future time-limited tier) must lose access like any
    other lapsed plan — that is the whole point of routing through
    effective_plan.
    """
    user = seed_user(plan="Verdict", planExpiresAt=datetime.now(timezone.utc) - timedelta(days=1))
    with pytest.raises(HTTPException) as exc:
        await lawyer_routes._require_verdict_plan(str(user["_id"]))
    assert exc.value.status_code == 403


async def test_unknown_user_is_401_not_403(fake_db):
    with pytest.raises(HTTPException) as exc:
        await lawyer_routes._require_verdict_plan(str(ObjectId()))
    assert exc.value.status_code == 401
