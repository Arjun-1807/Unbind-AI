"""Shared test fixtures.

Everything here runs against in-memory fakes — no real MongoDB, no network,
and no dependency on a populated ``.env``. Settings are overridden to known
test values and the async Mongo ``get_db()`` is backed by a tiny fake.
"""

import copy

import pytest

from app import config, database

# ── Settings override ────────────────────────────────────────────────────────

TEST_SETTINGS_OVERRIDES = {
    "JWT_SECRET": "test-secret-key-for-unit-tests-only-0123456789abcdef",
    "JWT_ALGORITHM": "HS256",
    "JWT_EXPIRE_DAYS": 7,
    "GROQ_API_KEY": "gsk_test_key",
    "FRONTEND_URL": "http://localhost:3000",  # local dev → skips prod validator
    "COOKIE_NAME": "unbind_token",
    # Razorpay (payments) — deterministic test values so signatures/webhooks are
    # reproducible and never depend on a populated .env.
    "RAZORPAY_KEY_ID": "rzp_test_key",
    "RAZORPAY_KEY_SECRET": "test_secret",
    "RAZORPAY_WEBHOOK_SECRET": "test_webhook_secret",
}


@pytest.fixture(autouse=True)
def override_settings(monkeypatch):
    """Force deterministic settings for every test and reset the lru_cache.

    We build a real ``Settings`` object (so validators run) but seed it with
    known values, then patch ``get_settings`` everywhere it is consumed.
    """
    config.get_settings.cache_clear()
    test_settings = config.Settings(**TEST_SETTINGS_OVERRIDES)

    def _get_settings():
        return test_settings

    monkeypatch.setattr(config, "get_settings", _get_settings)
    # ``auth`` imports the symbol directly: ``from app.config import get_settings``
    from app import auth

    monkeypatch.setattr(auth, "get_settings", _get_settings)
    # ``plan_routes`` also does ``from app.config import get_settings``, so its
    # bound reference must be patched too (otherwise _rzp_auth/_verify_signature
    # and the webhook secret would read the real lru_cached .env settings).
    from app.routes import plan_routes

    monkeypatch.setattr(plan_routes, "get_settings", _get_settings)
    yield test_settings
    # NB: don't touch config.get_settings here — monkeypatch reverts it after
    # this finalizer, and the patched stand-in has no cache_clear().


# ── Fake async MongoDB ───────────────────────────────────────────────────────


class FakeCollection:
    """Minimal async stand-in for a Motor collection keyed by ``_id``."""

    def __init__(self, docs=None):
        # store keyed by str(_id) for easy lookup regardless of ObjectId identity
        self._docs = {}
        for doc in docs or []:
            self._docs[str(doc["_id"])] = copy.deepcopy(doc)
        self.update_calls = []

    async def find_one(self, query):
        _id = query.get("_id")
        if _id is not None:
            doc = self._docs.get(str(_id))
            return copy.deepcopy(doc) if doc else None
        # fall back to matching all provided fields
        for doc in self._docs.values():
            if all(doc.get(k) == v for k, v in query.items()):
                return copy.deepcopy(doc)
        return None

    async def update_one(self, query, update):
        self.update_calls.append((query, update))
        _id = query.get("_id")
        doc = self._docs.get(str(_id))
        if doc is None:
            return None
        for op, changes in update.items():
            if op == "$set":
                doc.update(changes)
        return None

    async def insert_one(self, doc):
        _id = doc.get("_id", str(len(self._docs) + 1))
        stored = copy.deepcopy(doc)
        stored["_id"] = _id
        self._docs[str(_id)] = stored

        class _Result:
            inserted_id = _id

        return _Result()

    def find(self, query=None):
        """Return a cursor over docs matching every field in ``query``.

        Supports the read path used by ``list_payments``: a chained
        ``.sort(field, direction)`` and ``async for`` iteration.
        """
        query = query or {}
        matched = [
            copy.deepcopy(doc)
            for doc in self._docs.values()
            if all(doc.get(k) == v for k, v in query.items())
        ]
        return _FakeCursor(matched)


class _FakeCursor:
    """Minimal async cursor: chainable ``.sort`` + async iteration."""

    def __init__(self, docs):
        self._docs = docs

    def sort(self, field, direction=1):
        self._docs.sort(key=lambda d: d.get(field), reverse=direction == -1)
        return self

    async def __aiter__(self):
        for doc in self._docs:
            yield doc


class FakeDB:
    def __init__(self, users=None, analyses=None, payments=None):
        self.users = FakeCollection(users)
        self.analyses = FakeCollection(analyses)
        self.payments = FakeCollection(payments)


@pytest.fixture
def fake_db(monkeypatch):
    """Install a FakeDB as the module-level ``_db`` so ``get_db()`` works.

    Returns the FakeDB instance; seed it via ``fake_db.users`` in a test or use
    the ``seed_user`` helper fixture.
    """
    db = FakeDB()
    monkeypatch.setattr(database, "_db", db)
    return db


@pytest.fixture
def seed_user(fake_db):
    """Return a helper that inserts a user doc and returns its FakeDB."""

    def _seed(**fields):
        from bson import ObjectId

        user = {"_id": ObjectId(), "email": "user@example.com"}
        user.update(fields)
        fake_db.users._docs[str(user["_id"])] = user
        return user

    _seed.db = fake_db
    return _seed
