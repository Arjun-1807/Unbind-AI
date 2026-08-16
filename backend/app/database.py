import logging
from typing import NamedTuple

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.config import get_settings

logger = logging.getLogger(__name__)

_client: AsyncIOMotorClient | None = None
_db: AsyncIOMotorDatabase | None = None


class _IndexSpec(NamedTuple):
    """One index to build.

    ``critical`` marks an index that application code *relies on for
    correctness* rather than for speed — see :func:`_ensure_indexes`.
    """

    collection: str
    args: tuple
    kwargs: dict
    critical: bool = False


async def _ensure_indexes(db: AsyncIOMotorDatabase) -> None:
    """Create the indexes the app relies on. Idempotent.

    Failure handling is deliberately split by what the index is *for*:

    * Performance-only indexes are best-effort — a failure (e.g. a pre-existing
      conflicting index) is logged and the app still starts, because the worst
      case is a slow query.
    * ``critical=True`` indexes ARE the correctness guarantee, and code
      elsewhere has no second line of defence. Swallowing those failures means
      booting a healthy-looking app with the guarantee silently off, so they
      abort startup instead.

    The critical ones, and what depends on them:

    * ``payments.razorpayPaymentId`` unique is the race-safe backstop that lets a
      Razorpay payment be recorded at most once, so a replayed /verify or a
      duplicate webhook can't grant a plan twice. plan_routes' webhook handler
      catches ``DuplicateKeyError`` as its *sole* concurrency guard.
    * ``users.email`` unique closes the check-then-insert race in signup, where
      two concurrent requests could each find no existing account and both
      insert one for the same address.
    * The remaining unique indexes are the same shape of guarantee for vector
      stores, chats, reminders and lawyer accounts: without them a concurrent
      double-write leaves duplicates that read back non-deterministically (or,
      for reminders, send duplicate emails).

    Each index is created independently so one failure doesn't silently skip the
    rest; critical failures are collected and raised together at the end, so the
    logs name every broken guarantee rather than only the first.
    """
    specs: list[_IndexSpec] = [
        _IndexSpec("payments", ("razorpayPaymentId",), {"unique": True}, critical=True),
        _IndexSpec("payments", ([("userId", 1), ("createdAt", -1)],), {}),
        # Every dashboard load queries analyses by owner, newest first.
        _IndexSpec("analyses", ([("userId", 1), ("analysisDate", -1)],), {}),
        _IndexSpec("users", ("email",), {"unique": True}, critical=True),
        # One vector index and one conversation per (analysis, owner). Unique so a
        # concurrent double-build can't leave two records that read back
        # non-deterministically.
        _IndexSpec(
            "document_vectors",
            ([("analysisId", 1), ("userId", 1)],),
            {"unique": True},
            critical=True,
        ),
        _IndexSpec(
            "document_chats",
            ([("analysisId", 1), ("userId", 1)],),
            {"unique": True},
            critical=True,
        ),
        # Unique on the identity of a deadline, so re-generating for an analysis
        # can't create duplicate reminders (and duplicate emails).
        _IndexSpec(
            "reminders",
            ([("userId", 1), ("analysisId", 1), ("description", 1), ("dueDate", 1)],),
            {"unique": True},
            critical=True,
        ),
        # The sweep's query: schedulable reminders inside the lead-time window.
        _IndexSpec("reminders", ([("schedulable", 1), ("dueDate", 1)],), {}),
        _IndexSpec("lawyers", ("email",), {"unique": True}, critical=True),
        _IndexSpec("lawyers", ("specializations",), {}),
    ]
    failed_critical: list[str] = []
    for spec in specs:
        try:
            await db[spec.collection].create_index(*spec.args, **spec.kwargs)
        except Exception:
            logger.exception(
                "Failed to create index %s on %s — the guarantee it provides is NOT in effect",
                spec.args[0],
                spec.collection,
            )
            if spec.critical:
                failed_critical.append(f"{spec.collection}.{spec.args[0]}")

    if failed_critical:
        # Refuse to serve. A missing unique index doesn't degrade a feature, it
        # removes the only thing preventing double-granted plans and duplicate
        # accounts — failing the boot is how that stays visible.
        raise RuntimeError(
            "Could not create correctness-critical unique index(es): "
            + ", ".join(failed_critical)
            + ". Resolve the conflict (usually pre-existing duplicate documents) "
            "before starting the app."
        )


async def connect_db() -> None:
    global _client, _db
    settings = get_settings()
    _client = AsyncIOMotorClient(settings.MONGODB_URI)
    _db = _client.get_default_database(default="unbindai")
    # Verify connection
    await _client.admin.command("ping")
    await _ensure_indexes(_db)
    logger.info("Connected to MongoDB")


async def close_db() -> None:
    global _client
    if _client:
        _client.close()
        logger.info("MongoDB connection closed")


async def ping_db() -> bool:
    """Return True if the database answers a ping. Used by the health check."""
    if _client is None:
        return False
    try:
        await _client.admin.command("ping")
        return True
    except Exception:
        logger.warning("MongoDB ping failed", exc_info=True)
        return False


def get_db() -> AsyncIOMotorDatabase:
    if _db is None:
        raise RuntimeError("Database not initialised – call connect_db() first")
    return _db
