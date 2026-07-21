import asyncio
import logging
import re
from typing import Any

from bson import ObjectId
from groq import RateLimitError
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_groq import ChatGroq
from langsmith import traceable

from app.config import get_settings
from app.database import get_db
from app.services.model_selector import FREE_MODEL, select_model

logger = logging.getLogger(__name__)

# Cap how many chat completions can hit Groq at once. The free tier is limited
# by tokens-per-minute, so firing every document chunk concurrently instantly
# trips a 429. A small ceiling keeps bursts under the TPM limit while still
# giving useful parallelism. Shared across the whole process.
_CHAT_SEMAPHORE = asyncio.Semaphore(2)

# HyDE generation runs on a separate Groq key (HYDE_API_KEY), so it gets its
# own concurrency gate independent of the main analysis calls — the two keys
# have independent per-key rate limits and shouldn't throttle each other.
_HYDE_SEMAPHORE = asyncio.Semaphore(2)

_MAX_RETRIES = 5

# HyDE (Hypothetical Document Embeddings): rather than embed the user's short,
# keyword-y question, we first draft a plausible contract passage that would
# answer it, then embed THAT. Its clause-style wording lands much closer to real
# contract text in embedding space, so retrieval finds the right chunks more
# often.
_HYDE_SYSTEM_PROMPT = (
    "You generate a hypothetical document for retrieval (HyDE). Given a user's "
    "question about a legal contract, write a short, plausible passage — as if "
    "excerpted from such a contract — that would directly answer the question. "
    "Use the formal clause-style language and terminology a real contract would "
    "use. Do not answer the user or add commentary; output only the hypothetical "
    "passage. Keep it under 120 words."
)


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


def _get_hyde_api_key() -> str:
    """API key for the HyDE agent.

    Prefers the dedicated HYDE_API_KEY so HyDE draws on its own per-key rate
    limit; falls back to GROQ_API_KEY so HyDE still works when no separate key
    is configured.
    """
    settings = get_settings()
    key = settings.HYDE_API_KEY or settings.GROQ_API_KEY
    if not key:
        raise RuntimeError("Neither HYDE_API_KEY nor GROQ_API_KEY is set")
    return key


def _to_lc_messages(messages: list[dict]) -> list:
    """Convert dict messages to LangChain message objects."""
    lc_messages = []
    for msg in messages:
        if msg["role"] == "system":
            lc_messages.append(SystemMessage(content=msg["content"]))
        elif msg["role"] == "user":
            lc_messages.append(HumanMessage(content=msg["content"]))
    return lc_messages


async def _invoke_with_retry(
    llm: ChatGroq,
    lc_messages: list,
    semaphore: asyncio.Semaphore,
) -> str:
    """Invoke the model under a concurrency gate, retrying on 429s.

    Bounds concurrency + backs off on rate limits so a burst of calls doesn't
    blow the free-tier tokens-per-minute limit and fail the whole request.
    """
    async with semaphore:
        for attempt in range(_MAX_RETRIES):
            try:
                response = await llm.ainvoke(lc_messages)
                return response.content
            except RateLimitError as err:
                if attempt == _MAX_RETRIES - 1:
                    raise
                # Honor the server's suggested wait; otherwise exponential backoff.
                wait = _retry_after_seconds(err) or min(2**attempt, 30)
                wait += 0.5  # small cushion so we're clear of the window
                logger.warning(
                    "Groq rate limited (attempt %d/%d); retrying in %.1fs",
                    attempt + 1,
                    _MAX_RETRIES,
                    wait,
                )
                await asyncio.sleep(wait)
    # Unreachable: the loop either returns or raises on the final attempt.
    raise RuntimeError("chat completion failed without a response")


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
    lc_messages = _to_lc_messages(messages)
    return await _invoke_with_retry(llm, lc_messages, _CHAT_SEMAPHORE)


@traceable(name="generate_hypothetical_document")
async def generate_hypothetical_document(
    scenario: str,
    temperature: float = 0.3,
) -> str:
    """HyDE agent: draft a hypothetical contract passage that answers the query.

    Runs on its own ChatGroq instance built with a dedicated Groq key
    (HYDE_API_KEY) and its own concurrency gate, so this extra retrieval-time
    generation uses a separate per-key rate limit and never competes with the
    main analysis/summary calls for the same quota.
    """
    api_key = _get_hyde_api_key()
    llm = ChatGroq(
        model=FREE_MODEL,
        temperature=temperature,
        api_key=api_key,
    )
    lc_messages = _to_lc_messages(
        [
            {"role": "system", "content": _HYDE_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    f"Scenario/question: {scenario}\n\n"
                    "Write the hypothetical contract passage:"
                ),
            },
        ]
    )
    return await _invoke_with_retry(llm, lc_messages, _HYDE_SEMAPHORE)
