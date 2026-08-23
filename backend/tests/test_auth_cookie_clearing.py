"""A rejected session cookie must be cleared, not left on disk.

The frontend's middleware routes on cookie *presence* — it cannot verify a JWT
at the edge — so a dead-but-present cookie kept sending users to a signed-in
route that immediately bounced them back out.

These go through the real ASGI stack (rather than calling handlers directly
like the other suites) because the thing under test is an exception handler
registered on the app: calling the route function would never reach it.

The TestClient is deliberately NOT used as a context manager. That would run
the app's lifespan, and `connect_db()` opens a real MongoDB connection — which
against a populated `.env` means the developer's production cluster. Skipping
the lifespan leaves `database._db` unset, so the `fake_db` fixture supplies it
instead.
"""

from starlette.testclient import TestClient

from app.main import app


def _client() -> TestClient:
    return TestClient(app, raise_server_exceptions=False)


def test_me_with_a_bad_cookie_clears_it(override_settings, fake_db):
    res = _client().get(
        "/api/auth/me",
        cookies={override_settings.COOKIE_NAME: "not-a-real-jwt"},
    )

    assert res.status_code == 401
    set_cookie = res.headers.get("set-cookie", "")
    assert override_settings.COOKIE_NAME in set_cookie
    # An expiry in the past is how a delete is expressed on the wire.
    assert "Max-Age=0" in set_cookie or "1970" in set_cookie


def test_me_with_no_cookie_at_all_is_a_plain_401(override_settings, fake_db):
    """Nothing to clear, so nothing should be sent."""
    res = _client().get("/api/auth/me")

    assert res.status_code == 401
    assert override_settings.COOKIE_NAME not in res.headers.get("set-cookie", "")


def test_login_failure_does_not_clear_an_existing_session(override_settings, fake_db):
    """A wrong password says nothing about a session the browser already holds."""
    res = _client().post(
        "/api/auth/login",
        json={"email": "nobody@example.com", "password": "wrong-password"},
        headers={"Origin": override_settings.FRONTEND_URL},
    )

    assert res.status_code in (401, 429)
    assert override_settings.COOKIE_NAME not in res.headers.get("set-cookie", "")
