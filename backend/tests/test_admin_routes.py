"""Tests for the lawyer-verification back-office.

The point of this surface is that it is the ONLY thing that can make a lawyer
registration visible in the paid directory. So the tests that matter are the
access ones: a non-admin must not be able to reach it, and an admin must
actually flip the flag the public directory reads.
"""

from datetime import datetime, timezone

import pytest
from bson import ObjectId
from fastapi import HTTPException

from app import auth
from app.routes import admin_routes, lawyer_routes


class _ReqWithCookiesHeaders:
    def __init__(self, cookies=None, headers=None):
        self.cookies = cookies or {}
        self.headers = headers or {}


def _authed_request(settings, user_id: str) -> _ReqWithCookiesHeaders:
    return _ReqWithCookiesHeaders(cookies={settings.COOKIE_NAME: auth.create_access_token(user_id)})


def _seed_lawyer(db, *, name="A. Vakil", email="a@example.com", verified=False):
    lawyer = {
        "_id": ObjectId(),
        "name": name,
        "email": email,
        "specializations": ["Rental"],
        "bio": "bio",
        "experienceYears": 5,
        "city": "Mumbai",
        "phone": "+910000000000",
        "rating": 0.0,
        "verified": verified,
        "createdAt": datetime.now(timezone.utc),
    }
    db.lawyers._docs[str(lawyer["_id"])] = lawyer
    return lawyer


# ── Access control ────────────────────────────────────────────────────────────


async def test_non_admin_cannot_list_registrations(override_settings, seed_user):
    user = seed_user()  # no isAdmin flag
    _seed_lawyer(seed_user.db)

    with pytest.raises(HTTPException) as exc:
        await admin_routes.list_lawyers_for_review(
            _authed_request(override_settings, str(user["_id"]))
        )

    # 404, not 403 — the surface doesn't confirm it exists to a stranger.
    assert exc.value.status_code == 404


async def test_non_admin_cannot_verify_a_lawyer(override_settings, seed_user):
    user = seed_user()
    lawyer = _seed_lawyer(seed_user.db)

    with pytest.raises(HTTPException) as exc:
        await admin_routes.set_lawyer_verified(
            str(lawyer["_id"]),
            _authed_request(override_settings, str(user["_id"])),
            verified=True,
        )

    assert exc.value.status_code == 404
    # And the flag is untouched, so the directory is unaffected.
    assert seed_user.db.lawyers._docs[str(lawyer["_id"])]["verified"] is False


# ── The flag the directory actually reads ─────────────────────────────────────


async def test_admin_verifying_a_lawyer_makes_them_visible_to_a_verdict_user(
    override_settings, seed_user
):
    db = seed_user.db
    admin = seed_user(isAdmin=True)
    lawyer = _seed_lawyer(db)

    # A Verdict subscriber sees nothing while the registration is unverified —
    # this is the bug the back-office exists to fix.
    subscriber = seed_user(plan="Verdict")
    subscriber_req = _authed_request(override_settings, str(subscriber["_id"]))
    # specialization is passed explicitly: calling the handler directly skips
    # FastAPI's dependency resolution, so an omitted Query(...) parameter
    # arrives as a truthy FieldInfo sentinel rather than None and would be
    # applied as a filter. Only an artifact of the direct-call test style.
    assert await lawyer_routes.list_lawyers(subscriber_req, specialization=None) == []

    result = await admin_routes.set_lawyer_verified(
        str(lawyer["_id"]),
        _authed_request(override_settings, str(admin["_id"])),
        verified=True,
    )

    assert result["success"] is True
    assert result["verified"] is True

    listed = await lawyer_routes.list_lawyers(subscriber_req, specialization=None)
    assert [item.name for item in listed] == ["A. Vakil"]


async def test_admin_can_withdraw_a_verified_lawyer(override_settings, seed_user):
    db = seed_user.db
    admin = seed_user(isAdmin=True)
    lawyer = _seed_lawyer(db, verified=True)

    await admin_routes.set_lawyer_verified(
        str(lawyer["_id"]),
        _authed_request(override_settings, str(admin["_id"])),
        verified=False,
    )

    assert db.lawyers._docs[str(lawyer["_id"])]["verified"] is False


# ── Listing the pending queue ─────────────────────────────────────────────────


async def test_admin_listing_includes_unverified_and_can_filter(override_settings, seed_user):
    db = seed_user.db
    admin = seed_user(isAdmin=True)
    _seed_lawyer(db, name="Pending", email="p@example.com", verified=False)
    _seed_lawyer(db, name="Live", email="l@example.com", verified=True)
    req = _authed_request(override_settings, str(admin["_id"]))

    everyone = await admin_routes.list_lawyers_for_review(req)
    assert {item["name"] for item in everyone} == {"Pending", "Live"}

    pending = await admin_routes.list_lawyers_for_review(req, verified=False)
    assert [item["name"] for item in pending] == ["Pending"]


# ── Malformed input ───────────────────────────────────────────────────────────


async def test_malformed_lawyer_id_is_a_400(override_settings, seed_user):
    admin = seed_user(isAdmin=True)

    with pytest.raises(HTTPException) as exc:
        await admin_routes.set_lawyer_verified(
            "not-an-objectid",
            _authed_request(override_settings, str(admin["_id"])),
            verified=True,
        )

    assert exc.value.status_code == 400


async def test_unknown_lawyer_id_is_a_404(override_settings, seed_user):
    admin = seed_user(isAdmin=True)

    with pytest.raises(HTTPException) as exc:
        await admin_routes.set_lawyer_verified(
            str(ObjectId()),
            _authed_request(override_settings, str(admin["_id"])),
            verified=True,
        )

    assert exc.value.status_code == 404
