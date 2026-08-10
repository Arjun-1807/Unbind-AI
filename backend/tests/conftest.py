"""Shared test fixtures.

Everything here runs against in-memory fakes — no real MongoDB, no network,
and no dependency on a populated ``.env``. Settings are overridden to known
test values and the async Mongo ``get_db()`` is backed by a tiny fake.
"""

import copy

import pytest
from bson import ObjectId
from pymongo.errors import DuplicateKeyError

from app import config, database

# ── Settings override ────────────────────────────────────────────────────────

TEST_SETTINGS_OVERRIDES = {
    # Explicit, so the production validator is skipped and cookies are built
    # with dev flags. JWT_SECRET has no default in Settings, so it must be
    # supplied here or constructing Settings raises.
    "ENVIRONMENT": "development",
    "JWT_SECRET": "test-secret-key-for-unit-tests-only-0123456789abcdef",
    "JWT_ALGORITHM": "HS256",
    "JWT_EXPIRE_DAYS": 7,
    "GROQ_API_KEY": "gsk_test_key",
    "FRONTEND_URL": "http://localhost:3000",
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
    # Modules that do ``from app.config import get_settings`` hold their own
    # bound reference, so patching ``config.get_settings`` alone doesn't reach
    # them — they'd read the real lru_cached .env settings. Patch each one.
    from app.routes import plan_routes, reminder_routes

    monkeypatch.setattr(plan_routes, "get_settings", _get_settings)
    monkeypatch.setattr(reminder_routes, "get_settings", _get_settings)
    yield test_settings
    # NB: don't touch config.get_settings here — monkeypatch reverts it after
    # this finalizer, and the patched stand-in has no cache_clear().


# ── Fake async MongoDB ───────────────────────────────────────────────────────


_MISSING = object()


def _matches_condition(value, condition) -> bool:
    """Evaluate one field condition, which is either a literal or an operator doc."""
    if not isinstance(condition, dict) or not any(k.startswith("$") for k in condition):
        return value == condition

    for op, operand in condition.items():
        if op == "$ne":
            if value is _MISSING:
                # Mongo treats a missing field as not-equal to any value.
                if operand is not None:
                    continue
                return False
            if value == operand:
                return False
        elif op == "$exists":
            if (value is not _MISSING) != bool(operand):
                return False
        elif op in ("$lt", "$lte", "$gt", "$gte"):
            # Comparisons never match a missing field, as in Mongo. None is
            # likewise not comparable, and Mongo won't match it either.
            if value is _MISSING or value is None:
                return False
            try:
                if op == "$lt" and not value < operand:
                    return False
                if op == "$lte" and not value <= operand:
                    return False
                if op == "$gt" and not value > operand:
                    return False
                if op == "$gte" and not value >= operand:
                    return False
            except TypeError:
                # Mismatched types don't match, rather than blowing up.
                return False
        elif op == "$in":
            if value is _MISSING:
                return False
            haystack = value if isinstance(value, list) else [value]
            if not any(item in haystack for item in operand):
                return False
        else:  # pragma: no cover - unsupported operator is a test-authoring bug
            raise NotImplementedError(f"FakeCollection does not support {op}")
    return True


def _matches(doc, query) -> bool:
    """Match ``doc`` against a query supporting literals, $or and the operators above."""
    for key, condition in (query or {}).items():
        if key == "$or":
            if not any(_matches(doc, sub) for sub in condition):
                return False
            continue
        value = doc.get(key, _MISSING)
        if key == "_id" and value is not _MISSING:
            # ObjectId identity differs across instances; compare by string.
            if not isinstance(condition, dict):
                if str(value) != str(condition):
                    return False
                continue
        if not _matches_condition(value, condition):
            return False
    return True


def _apply_update(doc, update) -> None:
    for op, changes in update.items():
        if op == "$set":
            doc.update(changes)
        elif op == "$inc":
            for field, delta in changes.items():
                doc[field] = doc.get(field, 0) + delta
        elif op == "$push":
            for field, spec in changes.items():
                target = doc.setdefault(field, [])
                if isinstance(spec, dict) and "$each" in spec:
                    target.extend(spec["$each"])
                    limit = spec.get("$slice")
                    if limit is not None:
                        # Mongo's $slice keeps the last N when negative.
                        doc[field] = target[limit:] if limit < 0 else target[:limit]
                else:
                    target.append(spec)
        elif op == "$setOnInsert":
            # Handled by update_one on the insert path; a no-op on update.
            pass
        else:  # pragma: no cover
            raise NotImplementedError(f"FakeCollection does not support {op}")


class FakeCollection:
    """Minimal async stand-in for a Motor collection keyed by ``_id``."""

    def __init__(self, docs=None, unique_on=None):
        # store keyed by str(_id) for easy lookup regardless of ObjectId identity
        self._docs = {}
        for doc in docs or []:
            self._docs[str(doc["_id"])] = copy.deepcopy(doc)
        self.update_calls = []
        # Field tuples that must be unique, mirroring a real unique index. Set
        # this in a test whose behaviour *depends* on the index (e.g. idempotent
        # inserts), so the guarantee is actually exercised rather than assumed.
        self.unique_on = list(unique_on or [])

    def _first_match(self, query):
        """Return the live (not copied) doc matching ``query``, or None."""
        _id = query.get("_id")
        if _id is not None and not isinstance(_id, dict):
            doc = self._docs.get(str(_id))
            return doc if doc is not None and _matches(doc, query) else None
        for doc in self._docs.values():
            if _matches(doc, query):
                return doc
        return None

    async def find_one(self, query, projection=None):
        doc = self._first_match(query)
        return _project(copy.deepcopy(doc), projection) if doc else None

    async def update_one(self, query, update, upsert=False):
        self.update_calls.append((query, update))
        doc = self._first_match(query)
        if doc is None:
            if not upsert:

                class _NoMatch:
                    matched_count = 0
                    modified_count = 0

                return _NoMatch()
            # Seed the new doc from the query's literal equality terms, the way
            # Mongo does, then apply $setOnInsert and the rest of the update.
            doc = {k: v for k, v in query.items() if not isinstance(v, dict) and k != "$or"}
            doc.setdefault("_id", ObjectId())
            doc.update(update.get("$setOnInsert", {}))
            self._docs[str(doc["_id"])] = doc
        _apply_update(doc, update)

        class _Result:
            matched_count = 1
            modified_count = 1

        return _Result()

    async def find_one_and_update(self, query, update):
        """Atomic in Mongo; here it just returns the pre-update doc, or None if
        the filter didn't match — which is the signal callers gate on."""
        self.update_calls.append((query, update))
        doc = self._first_match(query)
        if doc is None:
            return None
        before = copy.deepcopy(doc)
        _apply_update(doc, update)
        return before

    async def insert_one(self, doc):
        for fields in self.unique_on:
            key = tuple(doc.get(f) for f in fields)
            for existing in self._docs.values():
                if tuple(existing.get(f) for f in fields) == key:
                    raise DuplicateKeyError(f"duplicate key on {fields}")

        # Real Mongo mints an ObjectId, and code under test round-trips these
        # ids through ObjectId() — a plain counter string would raise InvalidId.
        _id = doc.get("_id") or ObjectId()
        stored = copy.deepcopy(doc)
        stored["_id"] = _id
        self._docs[str(_id)] = stored

        class _Result:
            inserted_id = _id

        return _Result()

    async def delete_one(self, query):
        doc = self._first_match(query)
        deleted = 0
        if doc is not None:
            del self._docs[str(doc["_id"])]
            deleted = 1

        class _Result:
            deleted_count = deleted

        return _Result()

    async def delete_many(self, query):
        matched = [doc for doc in self._docs.values() if _matches(doc, query or {})]
        for doc in matched:
            del self._docs[str(doc["_id"])]

        class _Result:
            deleted_count = len(matched)

        return _Result()

    def find(self, query=None, projection=None):
        """Return a cursor over docs matching ``query``.

        Supports the read paths used by the list endpoints: chained
        ``.sort(field, direction)`` / ``.skip(n)`` / ``.limit(n)`` and async
        iteration, plus an exclusion projection.
        """
        matched = [
            _project(copy.deepcopy(doc), projection)
            for doc in self._docs.values()
            if _matches(doc, query or {})
        ]
        return _FakeCursor(matched)


def _project(doc, projection):
    """Apply an exclusion projection (``{"field": 0}``) to a doc."""
    if doc is None or not projection:
        return doc
    for field, include in projection.items():
        if not include:
            doc.pop(field, None)
    return doc


def _pagination_arg(n, fallback):
    """Resolve a skip/limit argument to an int.

    Tests call route handlers directly rather than through the app, so FastAPI
    never resolves the ``Query(...)`` defaults and the raw FieldInfo arrives
    here — use the default it declares.
    """
    if isinstance(n, int):
        return n
    default = getattr(n, "default", None)
    return default if isinstance(default, int) else fallback


class _FakeCursor:
    """Minimal async cursor: chainable ``.sort``/``.skip``/``.limit`` + async iteration."""

    def __init__(self, docs):
        self._docs = docs

    def sort(self, field, direction=1):
        self._docs.sort(key=lambda d: d.get(field), reverse=direction == -1)
        return self

    def skip(self, n):
        self._docs = self._docs[_pagination_arg(n, 0) :]
        return self

    def limit(self, n):
        self._docs = self._docs[: _pagination_arg(n, len(self._docs))]
        return self

    async def __aiter__(self):
        for doc in self._docs:
            yield doc


class FakeDB:
    def __init__(self, users=None, analyses=None, payments=None, lawyers=None):
        self.users = FakeCollection(users)
        self.analyses = FakeCollection(analyses)
        self.payments = FakeCollection(payments)
        self.lawyers = FakeCollection(lawyers)
        self.lawyer_contact_requests = FakeCollection()

    def __getitem__(self, name):
        """Support ``db["collection"]`` access, creating collections on demand.

        Motor creates a collection handle for any name; mirroring that means a
        test doesn't have to pre-declare every collection the code touches.
        """
        if not hasattr(self, name):
            setattr(self, name, FakeCollection())
        return getattr(self, name)


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
