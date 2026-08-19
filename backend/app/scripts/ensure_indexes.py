"""Build every index the application relies on.

Run as a deploy step, not on boot::

    python -m app.scripts.ensure_indexes

Index creation moved out of ``connect_db`` because on serverless it ran on
every cold start — ten round-trips to Atlas before the first request could be
served, measured at ~11s against production. It belongs here: once per deploy,
where a failure is a deploy failure rather than a user-facing timeout.

Idempotent, so re-running is free. Exits non-zero if a correctness-critical
unique index cannot be built, so a deploy pipeline stops rather than shipping
an app whose double-grant and duplicate-account guards are silently off.
"""

import asyncio
import logging
import sys

from app.database import close_db, connect_db, ensure_indexes_once

logging.basicConfig(level="INFO", format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger(__name__)


async def main() -> int:
    await connect_db()
    try:
        await ensure_indexes_once()
    except RuntimeError:
        logger.exception("Index creation failed")
        return 1
    finally:
        await close_db()
    logger.info("All indexes are in place")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
