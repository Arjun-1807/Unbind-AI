"""Tests for app.auth — token round-trips, tampering, hashing, cookie flags, purpose."""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from jose import jwt

from app import auth

# ── Token round-trip ─────────────────────────────────────────────────────────


def test_token_round_trip():
    token = auth.create_access_token("user-123")
    payload = auth.decode_access_token(token)
    assert payload["userId"] == "user-123"


def test_decode_tampered_token_raises_401():
    token = auth.create_access_token("user-123")
    # Mutate a character inside the payload segment (index 1). Avoid the last
    # char of a segment, whose trailing base64 padding bits can decode to the
    # same bytes; a mid-segment change reliably breaks the HMAC signature.
    header, payload, signature = token.split(".")
    new_char = "Z" if payload[1] != "Z" else "Y"
    tampered = f"{header}.{payload[0]}{new_char}{payload[2:]}.{signature}"
    with pytest.raises(HTTPException) as exc:
        auth.decode_access_token(tampered)
    assert exc.value.status_code == 401


def test_decode_token_signed_with_wrong_secret_raises_401():
    forged = jwt.encode(
        {"userId": "attacker", "exp": datetime.now(timezone.utc) + timedelta(days=1)},
        "some-other-secret",
        algorithm="HS256",
    )
    with pytest.raises(HTTPException) as exc:
        auth.decode_access_token(forged)
    assert exc.value.status_code == 401


def test_decode_expired_token_raises_401(override_settings):
    settings = override_settings
    expired = jwt.encode(
        {"userId": "user-123", "exp": datetime.now(timezone.utc) - timedelta(seconds=1)},
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM,
    )
    with pytest.raises(HTTPException) as exc:
        auth.decode_access_token(expired)
    assert exc.value.status_code == 401


def test_decode_garbage_token_raises_401():
    with pytest.raises(HTTPException) as exc:
        auth.decode_access_token("not.a.jwt")
    assert exc.value.status_code == 401


# ── Password hashing ─────────────────────────────────────────────────────────


def test_password_hash_and_verify():
    hashed = auth.hash_password("s3cret-p@ss")
    assert hashed != "s3cret-p@ss"
    assert auth.verify_password("s3cret-p@ss", hashed) is True
    assert auth.verify_password("wrong-pass", hashed) is False


def test_password_hash_is_salted():
    assert auth.hash_password("same") != auth.hash_password("same")


# ── Cookie security flags ────────────────────────────────────────────────────
#
# These replace the old _is_local_dev tests. Cookie flags used to be inferred
# from FRONTEND_URL (and an X-Forwarded-Proto override), which meant a deploy
# that forgot FRONTEND_URL silently issued non-Secure cookies. They are now
# driven by the declared ENVIRONMENT, so that is what these assert.


def test_cookie_security_development_is_lax_and_insecure(override_settings, monkeypatch):
    monkeypatch.setattr(override_settings, "ENVIRONMENT", "development")
    assert auth._cookie_security() == (False, "lax")


def test_cookie_security_production_is_none_and_secure(override_settings, monkeypatch):
    """SameSite=None is required cross-site, and browsers only honour it with Secure."""
    monkeypatch.setattr(override_settings, "ENVIRONMENT", "production")
    assert auth._cookie_security() == (True, "none")


def test_cookie_flags_ignore_frontend_url(override_settings, monkeypatch):
    """A localhost FRONTEND_URL must not downgrade a production cookie."""
    monkeypatch.setattr(override_settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(override_settings, "FRONTEND_URL", "http://localhost:3000")
    assert auth._cookie_security() == (True, "none")


# ── Token purpose separation ─────────────────────────────────────────────────


def _bare_request(token: str):
    class _R:
        cookies = {"unbind_token": token}
        headers: dict[str, str] = {}

    return _R()


async def test_session_token_authenticates(override_settings):
    token = auth.create_access_token("507f1f77bcf86cd799439011")
    assert await auth.get_current_user_id(_bare_request(token)) == "507f1f77bcf86cd799439011"


async def test_non_session_token_is_rejected(override_settings):
    """An unsubscribe-style token must never work as a Bearer/cookie credential."""
    forged = jwt.encode(
        {"userId": "507f1f77bcf86cd799439011", "purpose": "unsubscribe"},
        override_settings.JWT_SECRET,
        algorithm=override_settings.JWT_ALGORITHM,
    )
    with pytest.raises(HTTPException) as exc:
        await auth.get_current_user_id(_bare_request(forged))
    assert exc.value.status_code == 401


async def test_legacy_purposeless_token_is_rejected(override_settings):
    """Tokens minted before the purpose claim existed are invalid: one forced logout."""
    legacy = jwt.encode(
        {"userId": "507f1f77bcf86cd799439011"},
        override_settings.JWT_SECRET,
        algorithm=override_settings.JWT_ALGORITHM,
    )
    with pytest.raises(HTTPException) as exc:
        await auth.get_current_user_id(_bare_request(legacy))
    assert exc.value.status_code == 401


# ── get_token_from_request ───────────────────────────────────────────────────


class _ReqWithCookiesHeaders:
    def __init__(self, cookies=None, headers=None):
        self.cookies = cookies or {}
        self.headers = headers or {}


def test_get_token_prefers_cookie(override_settings):
    req = _ReqWithCookiesHeaders(
        cookies={override_settings.COOKIE_NAME: "cookie-token"},
        headers={"Authorization": "Bearer header-token"},
    )
    assert auth.get_token_from_request(req) == "cookie-token"


def test_get_token_falls_back_to_bearer(override_settings):
    req = _ReqWithCookiesHeaders(headers={"Authorization": "Bearer header-token"})
    assert auth.get_token_from_request(req) == "header-token"


def test_get_token_none_when_absent(override_settings):
    assert auth.get_token_from_request(_ReqWithCookiesHeaders()) is None


async def test_get_current_user_id_no_token_raises_401(override_settings):
    with pytest.raises(HTTPException) as exc:
        await auth.get_current_user_id(_ReqWithCookiesHeaders())
    assert exc.value.status_code == 401


async def test_get_current_user_id_valid_token(override_settings):
    token = auth.create_access_token("user-abc")
    req = _ReqWithCookiesHeaders(cookies={override_settings.COOKIE_NAME: token})
    assert await auth.get_current_user_id(req) == "user-abc"


# ── Absolute session lifetime ────────────────────────────────────────────────
#
# /auth/me re-mints a token on every call. Without a ceiling that makes any
# captured token immortal, so ``sst`` is stamped once and carried through every
# re-issue.


def test_new_token_stamps_session_start():
    payload = auth.decode_access_token(auth.create_access_token("u1"))
    assert payload["sst"] == pytest.approx(datetime.now(timezone.utc).timestamp(), abs=5)


def test_reissue_preserves_session_start():
    started = datetime.now(timezone.utc) - timedelta(days=10)
    payload = auth.decode_access_token(auth.create_access_token("u1", session_start=started))
    assert payload["sst"] == int(started.timestamp())


def test_reissue_expiry_is_clamped_to_the_absolute_ceiling(override_settings):
    """A session 28 days old may only slide 2 more days, not a fresh 7."""
    started = datetime.now(timezone.utc) - timedelta(days=auth.JWT_ABSOLUTE_EXPIRE_DAYS - 2)
    payload = auth.decode_access_token(auth.create_access_token("u1", session_start=started))
    ceiling = started + timedelta(days=auth.JWT_ABSOLUTE_EXPIRE_DAYS)
    assert payload["exp"] == pytest.approx(ceiling.timestamp(), abs=5)
    # ...and that is strictly earlier than the sliding window would allow.
    assert (
        payload["exp"]
        < (
            datetime.now(timezone.utc) + timedelta(days=override_settings.JWT_EXPIRE_DAYS)
        ).timestamp()
    )


def test_fresh_session_uses_the_sliding_window(override_settings):
    payload = auth.decode_access_token(auth.create_access_token("u1"))
    expected = datetime.now(timezone.utc) + timedelta(days=override_settings.JWT_EXPIRE_DAYS)
    assert payload["exp"] == pytest.approx(expected.timestamp(), abs=5)


async def test_token_past_absolute_ceiling_is_rejected(override_settings):
    """Even with a far-future exp, a session older than the ceiling is dead."""
    started = datetime.now(timezone.utc) - timedelta(days=auth.JWT_ABSOLUTE_EXPIRE_DAYS + 1)
    forged = jwt.encode(
        {
            "userId": "507f1f77bcf86cd799439011",
            "purpose": "session",
            "sst": int(started.timestamp()),
            "exp": datetime.now(timezone.utc) + timedelta(days=7),
        },
        override_settings.JWT_SECRET,
        algorithm=override_settings.JWT_ALGORITHM,
    )
    with pytest.raises(HTTPException) as exc:
        await auth.get_current_user_id(_bare_request(forged))
    assert exc.value.status_code == 401


async def test_token_without_sst_still_authenticates(override_settings):
    """Backward compatibility: already-issued tokens predate the claim."""
    legacy = jwt.encode(
        {
            "userId": "507f1f77bcf86cd799439011",
            "purpose": "session",
            "exp": datetime.now(timezone.utc) + timedelta(days=1),
        },
        override_settings.JWT_SECRET,
        algorithm=override_settings.JWT_ALGORITHM,
    )
    assert await auth.get_current_user_id(_bare_request(legacy)) == "507f1f77bcf86cd799439011"


def test_session_start_missing_claim_is_treated_as_now():
    assert auth.session_start_from_payload({}).timestamp() == pytest.approx(
        datetime.now(timezone.utc).timestamp(), abs=5
    )


def test_session_start_garbage_claim_is_treated_as_now():
    assert auth.session_start_from_payload({"sst": "not-a-number"}).timestamp() == pytest.approx(
        datetime.now(timezone.utc).timestamp(), abs=5
    )


# ── /auth/login and /auth/me report the *effective* plan ─────────────────────


class _FakeResponse:
    """Stand-in for fastapi.Response — set_auth_cookie only needs set_cookie."""

    def __init__(self):
        self.cookies = {}

    def set_cookie(self, key, value, **kwargs):
        self.cookies[key] = value


async def test_login_pro_is_false_when_plan_has_expired(seed_user, override_settings):
    from app.routes import auth_routes
    from app.schemas import LoginRequest

    seed_user(
        username="lapsed",
        email="lapsed@example.com",
        passwordHash=auth.hash_password("correct-horse"),
        # The stored flag is stale: _grant_plan sets it and nothing clears it.
        pro=True,
        plan="Brief",
        planExpiresAt=datetime.now(timezone.utc) - timedelta(days=1),
    )

    out = await auth_routes.login(
        LoginRequest(email="lapsed@example.com", password="correct-horse"),
        _ReqWithCookiesHeaders(),
        _FakeResponse(),
    )
    assert out.pro is False
    assert out.plan is None


async def test_login_pro_is_true_for_a_live_plan(seed_user, override_settings):
    from app.routes import auth_routes
    from app.schemas import LoginRequest

    seed_user(
        username="paid",
        email="paid@example.com",
        passwordHash=auth.hash_password("correct-horse"),
        plan="Motion",
        planExpiresAt=datetime.now(timezone.utc) + timedelta(days=10),
    )

    out = await auth_routes.login(
        LoginRequest(email="paid@example.com", password="correct-horse"),
        _ReqWithCookiesHeaders(),
        _FakeResponse(),
    )
    assert out.pro is True
    assert out.plan == "Motion"


async def test_me_pro_is_false_when_plan_has_expired(seed_user, override_settings):
    from app.routes import auth_routes

    user = seed_user(
        username="lapsed",
        pro=True,
        plan="Brief",
        planExpiresAt=datetime.now(timezone.utc) - timedelta(days=1),
    )
    token = auth.create_access_token(str(user["_id"]))
    out = await auth_routes.me(
        _ReqWithCookiesHeaders(cookies={override_settings.COOKIE_NAME: token})
    )
    assert out.pro is False
    assert out.plan is None


async def test_me_reissued_token_keeps_the_original_session_start(seed_user, override_settings):
    from app.routes import auth_routes

    user = seed_user(username="someone")
    started = datetime.now(timezone.utc) - timedelta(days=28)
    token = auth.create_access_token(str(user["_id"]), session_start=started)

    out = await auth_routes.me(
        _ReqWithCookiesHeaders(cookies={override_settings.COOKIE_NAME: token})
    )
    reissued = auth.decode_access_token(out.accessToken)
    assert reissued["sst"] == int(started.timestamp())
    # 28 days in, only 2 remain — polling /auth/me cannot buy a fresh 7 days
    # beyond the ceiling.
    assert reissued["exp"] == pytest.approx(
        (started + timedelta(days=auth.JWT_ABSOLUTE_EXPIRE_DAYS)).timestamp(), abs=5
    )
