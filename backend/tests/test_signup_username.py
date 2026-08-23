"""Signup no longer collects a display name — the server must derive one.

The web form dropped its username field, so `SignupRequest.username` became
optional. That makes two things worth pinning: an account created without one
still gets a sensible, non-empty name (there is no endpoint to rename an
account later, so whatever lands here is permanent), and the CLI — which still
prompts for a name — keeps having its value respected.

Goes through the real ASGI stack for the same reason as the cookie suite, and
likewise skips the lifespan so `connect_db()` never touches a real cluster.
"""

import pytest
from starlette.testclient import TestClient

from app.main import app

PASSWORD = "hunter2hunter2"


def _client() -> TestClient:
    return TestClient(app, raise_server_exceptions=False)


def _signup(**body):
    return _client().post("/api/auth/signup", json={"password": PASSWORD, **body})


@pytest.mark.parametrize(
    "email,expected",
    [
        ("Sachin@CapMobFinance.com", "sachin"),  # local part, lower-cased
        ("a.b+tag@example.co.uk", "a.b+tag"),
    ],
)
def test_signup_without_a_username_derives_one_from_the_email(
    override_settings, fake_db, email, expected
):
    res = _signup(email=email)
    assert res.status_code == 200, res.text
    body = res.json()
    # Must not come back null: the UI calls user.username.charAt(0).
    assert body["username"] == expected
    assert body["email"] == email.lower()


def test_an_explicitly_supplied_username_still_wins(override_settings, fake_db):
    res = _signup(username="Saul", email="cli@example.com")
    assert res.status_code == 200, res.text
    assert res.json()["username"] == "Saul"


def test_a_blank_username_falls_back_instead_of_storing_empty(override_settings, fake_db):
    res = _signup(username="   ", email="blank@example.com")
    assert res.status_code == 200, res.text
    assert res.json()["username"] == "blank"


def test_the_response_returns_the_derived_name_rather_than_null(override_settings, fake_db):
    res = _signup(email="stored@example.com")
    assert res.status_code == 200, res.text
    # The response used to echo body.username, which is now None when the
    # form omits it — handing the client a user with no display name while the
    # stored document was fine. That divergence is what this guards.
    assert res.json()["username"] == "stored"
