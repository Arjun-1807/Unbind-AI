import logging

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.config import get_settings

logger = logging.getLogger(__name__)

_client: AsyncIOMotorClient | None = None
_db: AsyncIOMotorDatabase | None = None


async def _ensure_indexes(db: AsyncIOMotorDatabase) -> None:
    """Create the indexes the app relies on. Idempotent and best-effort: a
    failure here (e.g. a pre-existing conflicting index) is logged, not fatal.

    The unique index on ``payments.razorpayPaymentId`` is the race-safe backstop
    that guarantees a Razorpay payment can be recorded at most once, so a
    replayed /verify or a duplicate webhook can't grant a plan twice.
    """
    try:
        await db.payments.create_index("razorpayPaymentId", unique=True)
        await db.payments.create_index([("userId", 1), ("createdAt", -1)])
    except Exception:
        logger.exception("Failed to create one or more MongoDB indexes")


async def connect_db() -> None:
    global _client, _db
    settings = get_settings()
    _client = AsyncIOMotorClient(settings.MONGODB_URI)
    _db = _client.get_default_database(default="unbindai")
    # Verify connection
    await _client.admin.command("ping")
    await _ensure_indexes(_db)
    print("Connected to MongoDB")


async def close_db() -> None:
    global _client
    if _client:
        _client.close()
        print("MongoDB connection closed")


def get_db() -> AsyncIOMotorDatabase:
    if _db is None:
        raise RuntimeError("Database not initialised – call connect_db() first")
    return _db
