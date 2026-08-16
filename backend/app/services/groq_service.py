import asyncio
import logging
import re
from functools import lru_cache
from typing import Any

from bson import ObjectId
from groq import APIConnectionError, APITimeoutError, InternalServerError, RateLimitError
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
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

# The negotiation copilot runs on its own Groq key (NEGOTIATION_API_KEY) with a
# dedicated concurrency gate, for the same reason as HyDE — independent per-key
# rate limits so drafting never throttles (or is throttled by) analysis calls.
_NEGOTIATION_SEMAPHORE = asyncio.Semaphore(2)

# Vision OCR (reading photographed/scanned contracts) runs on its own Groq key
# (GROQ_VISION_API_KEY) with a dedicated concurrency gate — same rationale.
_OCR_SEMAPHORE = asyncio.Semaphore(2)

_MAX_RETRIES = 5

# Transient failures worth another attempt. A dropped connection, a read
# timeout or a Groq-side 5xx says nothing about the request itself, and a long
# analysis is dozens of sequential calls — failing the whole job on one blip
# wastes every call already paid for. 4xx errors other than 429 stay fatal:
# retrying a malformed request just burns time.
_RETRYABLE_ERRORS = (
    RateLimitError,
    APIConnectionError,  # APITimeoutError subclasses this; listed for clarity
    APITimeoutError,
    InternalServerError,
)

# Ceiling on a server-supplied Retry-After. Groq occasionally advertises waits
# measured in minutes or hours (e.g. a daily quota); honouring those verbatim
# would hang the request — and the caller's HTTP request — for that long. Past
# a minute it's better to exhaust the retries and surface the failure.
_MAX_RETRY_AFTER_SECONDS = 60.0

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


def _retry_after_seconds(err: Exception) -> float:
    """Best-effort extraction of how long to wait before retrying, clamped.

    The hint comes from upstream and is therefore untrusted input: it is capped
    at ``_MAX_RETRY_AFTER_SECONDS`` so a large advertised wait can't stall the
    process. Returns 0.0 when no hint is available, letting the caller fall back
    to exponential backoff.
    """
    # Groq sends a Retry-After header; fall back to the "try again in Xs" hint.
    try:
        header = err.response.headers.get("retry-after")
        if header:
            return min(float(header), _MAX_RETRY_AFTER_SECONDS)
    except Exception:
        pass
    match = re.search(r"try again in ([\d.]+)s", str(err))
    if match:
        return min(float(match.group(1)), _MAX_RETRY_AFTER_SECONDS)
    return 0.0


# Bounded so a runaway variety of (key, model, temperature) triples can't grow
# without limit; in practice only a handful of combinations are ever used.
@lru_cache(maxsize=32)
def _get_llm(api_key: str, model: str, temperature: float) -> ChatGroq:
    """Return a shared ChatGroq for this (key, model, temperature) triple.

    Constructing ChatGroq is not cheap or free-standing: its validator builds
    BOTH a ``groq.Groq`` and a ``groq.AsyncGroq``, each owning an httpx client
    and connection pool that nothing ever closes. Building one per LLM call
    leaked hundreds of pooled clients per analysis (only reclaimed whenever GC
    ran the finalizers), exhausted file descriptors under load, and forced a
    fresh TLS handshake on every request. One instance per distinct
    configuration keeps the pools alive and reused.

    ``api_key`` is part of the key on purpose: each feature runs on its own
    dedicated Groq key (HyDE / negotiation / vision) so it draws on a separate
    per-key rate limit, and sharing one client across keys would collapse that.
    """
    return ChatGroq(model=model, temperature=temperature, api_key=api_key)


def _reset_llm_cache() -> None:
    """Drop every cached client. For tests — a client built against a patched
    ChatGroq or patched settings must not leak into the next test."""
    _get_llm.cache_clear()


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


def _get_negotiation_api_key() -> str:
    """API key for the negotiation copilot.

    Prefers the dedicated NEGOTIATION_API_KEY so drafting draws on its own
    per-key rate limit; falls back to GROQ_API_KEY when no separate key is set.
    """
    settings = get_settings()
    key = settings.NEGOTIATION_API_KEY or settings.GROQ_API_KEY
    if not key:
        raise RuntimeError("Neither NEGOTIATION_API_KEY nor GROQ_API_KEY is set")
    return key


def _get_ocr_api_key() -> str:
    """API key for vision OCR.

    Prefers the dedicated GROQ_VISION_API_KEY so OCR draws on its own per-key
    rate limit; falls back to GROQ_API_KEY when no separate key is set.
    """
    settings = get_settings()
    key = settings.GROQ_VISION_API_KEY or settings.GROQ_API_KEY
    if not key:
        raise RuntimeError("Neither GROQ_VISION_API_KEY nor GROQ_API_KEY is set")
    return key


def _to_lc_messages(messages: list[dict]) -> list:
    """Convert dict messages to LangChain message objects.

    ``assistant`` is mapped as well as ``system``/``user``, so multi-turn
    conversations can replay prior turns — dropping them (as this used to) makes
    the model treat every follow-up as the first question and lose the thread.
    An unrecognised role raises rather than being silently discarded.
    """
    lc_messages = []
    for msg in messages:
        role = msg["role"]
        if role == "system":
            lc_messages.append(SystemMessage(content=msg["content"]))
        elif role == "user":
            lc_messages.append(HumanMessage(content=msg["content"]))
        elif role == "assistant":
            lc_messages.append(AIMessage(content=msg["content"]))
        else:
            raise ValueError(f"unsupported message role: {role!r}")
    return lc_messages


async def _invoke_with_retry(
    llm: ChatGroq,
    lc_messages: list,
    semaphore: asyncio.Semaphore,
) -> str:
    """Invoke the model under a concurrency gate, retrying transient failures.

    Bounds concurrency + backs off on rate limits so a burst of calls doesn't
    blow the free-tier tokens-per-minute limit and fail the whole request.
    """
    for attempt in range(_MAX_RETRIES):
        try:
            # The gate is held for the request only, never across the backoff
            # sleep. With just a couple of permits process-wide, sleeping while
            # holding one would park a large slice of the global concurrency
            # doing nothing — one rate-limited call would stall unrelated ones
            # that could have proceeded.
            async with semaphore:
                response = await llm.ainvoke(lc_messages)
            return response.content
        except _RETRYABLE_ERRORS as err:
            if attempt == _MAX_RETRIES - 1:
                raise
            # Honor the server's suggested wait; otherwise exponential backoff.
            wait = _retry_after_seconds(err) or min(2**attempt, 30)
            wait += 0.5  # small cushion so we're clear of the window
            logger.warning(
                "Groq call failed with %s (attempt %d/%d); retrying in %.1fs",
                type(err).__name__,
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
    llm = _get_llm(api_key, resolved_model, temperature)
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
    llm = _get_llm(api_key, FREE_MODEL, temperature)
    lc_messages = _to_lc_messages(
        [
            {"role": "system", "content": _HYDE_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    f"Scenario/question: {scenario}\n\nWrite the hypothetical contract passage:"
                ),
            },
        ]
    )
    return await _invoke_with_retry(llm, lc_messages, _HYDE_SEMAPHORE)


@traceable(name="negotiation_complete")
async def negotiation_complete(
    messages: list[dict],
    temperature: float = 0.4,
) -> str:
    """Chat completion for the negotiation copilot.

    Uses a ChatGroq instance built with the dedicated negotiation key
    (NEGOTIATION_API_KEY) and its own concurrency gate, so drafting messages
    uses a separate per-key rate limit from the main analysis calls. A slightly
    higher default temperature suits natural-sounding prose.
    """
    api_key = _get_negotiation_api_key()
    llm = _get_llm(api_key, FREE_MODEL, temperature)
    lc_messages = _to_lc_messages(messages)
    return await _invoke_with_retry(llm, lc_messages, _NEGOTIATION_SEMAPHORE)


@traceable(name="ocr_complete")
async def ocr_complete(
    image_data_url: str,
    prompt: str,
    temperature: float = 0.0,
) -> str:
    """Vision OCR: transcribe an image to text via a Groq vision model.

    Uses a ChatGroq instance built with the dedicated vision key
    (GROQ_VISION_API_KEY) and its own concurrency gate, so OCR draws on a
    separate per-key rate limit from the main analysis calls. ``image_data_url``
    is a ``data:image/...;base64,...`` URL. Temperature defaults to 0 for a
    faithful transcription.
    """
    api_key = _get_ocr_api_key()
    llm = _get_llm(api_key, get_settings().OCR_MODEL, temperature)
    # Multimodal message: a text instruction plus the image. Built directly
    # because _to_lc_messages only handles plain string content.
    lc_messages = [
        HumanMessage(
            content=[
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": image_data_url}},
            ]
        )
    ]
    return await _invoke_with_retry(llm, lc_messages, _OCR_SEMAPHORE)
