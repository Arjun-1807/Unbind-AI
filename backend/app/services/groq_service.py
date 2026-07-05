import asyncio
import logging
import re
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, SystemMessage
from langsmith import traceable
from groq import RateLimitError
from app.config import get_settings
from app.database import get_db
from typing import Any
from bson import ObjectId
from app.services.model_selector import FREE_MODEL, select_model


logger = logging.getLogger(__name__)

# Cap how many chat completions can hit Groq at once. The free tier is limited
# by tokens-per-minute, so firing every document chunk concurrently instantly
# trips a 429. A small ceiling keeps bursts under the TPM limit while still
# giving useful parallelism. Shared across the whole process.
_CHAT_SEMAPHORE = asyncio.Semaphore(2)

_MAX_RETRIES = 5


def _retry_after_seconds(err: RateLimitError) -> float:
    """Best-effort extraction of how long to wait before retrying a 429."""
    # Groq sends a Retry-After header; fall back to the "try again in Xs" hint.
    try:
        header = err.response.headers.get("retry-after")
        if header:
            return float(header)
    except Exception:
        pass
    match = re.search(r"try again in ([\d.]+)s", str(err))
    if match:
        return float(match.group(1))
    return 0.0


def _get_api_key() -> str:
    key = get_settings().GROQ_API_KEY
    if not key:
        raise RuntimeError("GROQ_API_KEY is not set")
    return key

async def get_user_by_id(user_id: str) -> dict[str, Any] | None:
    db = get_db()
    try:
        return await db.users.find_one({"_id": ObjectId(user_id)})
    except Exception:
        return None


async def resolve_model(user_id: str | None) -> str:
    if not user_id:
        return FREE_MODEL
    user = await get_user_by_id(user_id)
    return select_model(user)


@traceable(name="chat_complete")
async def chat_complete(
    messages: list[dict],
    model: str | None = None,
    user_id: str | None = None,
    temperature: float = 0.2,
) -> str:
    """Chat completion using LangChain's ChatGroq."""
    resolved_model = model or await resolve_model(user_id)
    api_key = _get_api_key()
    llm = ChatGroq(
        model=resolved_model,
        temperature=temperature,
        api_key=api_key,
    )
    
    # Convert dict messages to LangChain message objects
    lc_messages = []
    for msg in messages:
        if msg["role"] == "system":
            lc_messages.append(SystemMessage(content=msg["content"]))
        elif msg["role"] == "user":
            lc_messages.append(HumanMessage(content=msg["content"]))

    # Bound concurrency + retry on 429 so a burst of chunk analyses doesn't blow
    # the free-tier tokens-per-minute limit and fail the whole request.
    async with _CHAT_SEMAPHORE:
        for attempt in range(_MAX_RETRIES):
            try:
                response = await llm.ainvoke(lc_messages)
                return response.content
            except RateLimitError as err:
                if attempt == _MAX_RETRIES - 1:
                    raise
                # Honor the server's suggested wait; otherwise exponential backoff.
                wait = _retry_after_seconds(err) or min(2 ** attempt, 30)
                wait += 0.5  # small cushion so we're clear of the window
                logger.warning(
                    "Groq rate limited (attempt %d/%d); retrying in %.1fs",
                    attempt + 1, _MAX_RETRIES, wait,
                )
                await asyncio.sleep(wait)