"""Renaming an account.

Email signup no longer collects a display name — the server derives one from
the address — so this endpoint is the only way to change it. Without it the
derived name is permanent, which is why it exists at all.

Goes through the real ASGI stack, skipping the lifespan so `connect_db()`
never reaches a real cluster (see test_auth_cookie_clearing for the rationale).
"""

from starlette.testclient import TestClient

from app.auth import create_access_token
from app.main import app


def _client() -> TestClient:
    return TestClient(app, raise_server_exceptions=False)


def _auth(user, settings):
    return {settings.COOKIE_NAME: create_access_token(str(user["_id"]))}


def test_renames_the_account(override_settings, seed_user):
    user = seed_user(username="derived", createdAt=None)
    res = _client().post(
        "/api/auth/update-name",
        json={"username": "Sachin"},
        cookies=_auth(user, override_settings),
    )
    assert res.status_code == 200, res.text
    assert res.json()["username"] == "Sachin"
    # And it is actually persisted, not just echoed back.
    assert seed_user.db.users._docs[str(user["_id"])]["username"] == "Sachin"


def test_trims_surrounding_whitespace(override_settings, seed_user):
    user = seed_user(username="derived", createdAt=None)
    res = _client().post(
        "/api/auth/update-name",
        json={"username": "  Sachin  "},
        cookies=_auth(user, override_settings),
    )
    assert res.status_code == 200, res.text
    assert res.json()["username"] == "Sachin"


def test_rejects_a_whitespace_only_name(override_settings, seed_user):
    """min_length=1 accepts "   "; the UI reads username.charAt(0)."""
    user = seed_user(username="derived", createdAt=None)
    res = _client().post(
        "/api/auth/update-name",
        json={"username": "   "},
        cookies=_auth(user, override_settings),
    )
    assert res.status_code == 400, res.text
    assert seed_user.db.users._docs[str(user["_id"])]["username"] == "derived"


def test_rejects_an_empty_name(override_settings, seed_user):
    user = seed_user(username="derived", createdAt=None)
    res = _client().post(
        "/api/auth/update-name",
        json={"username": ""},
        cookies=_auth(user, override_settings),
    )
    assert res.status_code == 422, res.text


def test_rejects_an_over_long_name(override_settings, seed_user):
    user = seed_user(username="derived", createdAt=None)
    res = _client().post(
        "/api/auth/update-name",
        json={"username": "x" * 101},
        cookies=_auth(user, override_settings),
    )
    assert res.status_code == 422, res.text


def test_requires_a_session(override_settings, fake_db):
    res = _client().post("/api/auth/update-name", json={"username": "Nobody"})
    assert res.status_code == 401, res.text
