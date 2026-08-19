"""A rejected session cookie must be cleared, not left on disk.

The frontend's middleware routes on cookie *presence* — it cannot verify a JWT
at the edge — so a dead-but-present cookie kept sending users to a signed-in
route that immediately bounced them back out.
"""

from starlette.testclient import TestClient

from app.main import app


def _client():
    return TestClient(app, raise_server_exceptions=False)


def test_me_with_a_bad_cookie_clears_it(override_settings):
    with _client() as client:
        res = client.get(
            "/api/auth/me",
            cookies={override_settings.COOKIE_NAME: "not-a-real-jwt"},
        )

    assert res.status_code == 401
    set_cookie = res.headers.get("set-cookie", "")
    assert override_settings.COOKIE_NAME in set_cookie
    # An expiry in the past is how a delete is expressed on the wire.
    assert "Max-Age=0" in set_cookie or "1970" in set_cookie


def test_login_failure_does_not_clear_an_existing_session(override_settings):
    """A wrong password says nothing about a session the browser already holds."""
    with _client() as client:
        res = client.post(
            "/api/auth/login",
            json={"email": "nobody@example.com", "password": "wrong-password"},
            headers={"Origin": override_settings.FRONTEND_URL},
        )

    assert res.status_code in (401, 429)
    assert override_settings.COOKIE_NAME not in res.headers.get("set-cookie", "")
