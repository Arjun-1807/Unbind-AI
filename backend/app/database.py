import logging

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.config import get_settings

logger = logging.getLogger(__name__)

_client: AsyncIOMotorClient | None = None
_db: AsyncIOMotorDatabase | None = None


async def _ensure_indexes(db: AsyncIOMotorDatabase) -> None:
    """Create the indexes the app relies on. Idempotent and best-effort: a
    failure here (e.g. a pre-existing conflicting index) is logged, not fatal.

    Two of these are correctness guarantees, not just speed:

    * ``payments.razorpayPaymentId`` unique is the race-safe backstop that lets a
      Razorpay payment be recorded at most once, so a replayed /verify or a
      duplicate webhook can't grant a plan twice.
    * ``users.email`` unique closes the check-then-insert race in signup, where
      two concurrent requests could each find no existing account and both
      insert one for the same address.

    Each index is created independently so one failure (a pre-existing duplicate
    blocking a unique build, say) doesn't silently skip the rest.
    """
    specs: list[tuple[str, tuple, dict]] = [
        ("payments", ("razorpayPaymentId",), {"unique": True}),
        ("payments", ([("userId", 1), ("createdAt", -1)],), {}),
        # Every dashboard load queries analyses by owner, newest first.
        ("analyses", ([("userId", 1), ("analysisDate", -1)],), {}),
        ("users", ("email",), {"unique": True}),
        # One vector index and one conversation per (analysis, owner). Unique so a
        # concurrent double-build can't leave two records that read back
        # non-deterministically.
        ("document_vectors", ([("analysisId", 1), ("userId", 1)],), {"unique": True}),
        ("document_chats", ([("analysisId", 1), ("userId", 1)],), {"unique": True}),
        # Unique on the identity of a deadline, so re-generating for an analysis
        # can't create duplicate reminders (and duplicate emails).
        (
            "reminders",
            ([("userId", 1), ("analysisId", 1), ("description", 1), ("dueDate", 1)],),
            {"unique": True},
        ),
        # The sweep's query: schedulable reminders inside the lead-time window.
        ("reminders", ([("schedulable", 1), ("dueDate", 1)],), {}),
        ("lawyers", ("email",), {"unique": True}),
        ("lawyers", ("specializations",), {}),
    ]
    for collection, args, kwargs in specs:
        try:
            await db[collection].create_index(*args, **kwargs)
        except Exception:
            logger.exception(
                "Failed to create index %s on %s — the guarantee it provides is NOT in effect",
                args[0],
                collection,
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
