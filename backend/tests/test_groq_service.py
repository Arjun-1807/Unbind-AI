"""Tests for the Groq LLM wrapper.

Cover the two things that are easy to regress and expensive in production: the
ChatGroq client cache (every construction opens two unclosed httpx connection
pools, so rebuilding per call leaks sockets) and the retry loop's backoff
behaviour. No network is touched — ChatGroq is replaced with a recording stub.
"""

import asyncio

import httpx
import pytest
from groq import APIConnectionError, APITimeoutError, InternalServerError, RateLimitError

from app.services import groq_service


@pytest.fixture(autouse=True)
def clear_llm_cache():
    """Isolate the module-level client cache.

    The cache lives for the life of the process, so a client built here against
    a stubbed ChatGroq (or stubbed settings) would otherwise be handed to a
    later test. Clear on the way in and out.
    """
    groq_service._reset_llm_cache()
    yield
    groq_service._reset_llm_cache()


class FakeLLM:
    """Stand-in for a ChatGroq instance, recording how it was built."""

    def __init__(self, model=None, temperature=None, api_key=None):
        self.model = model
        self.temperature = temperature
        self.api_key = api_key
        self.calls = 0

    async def ainvoke(self, messages):
        self.calls += 1
        return type("Msg", (), {"content": "ok"})()


@pytest.fixture
def fake_chat_groq(monkeypatch):
    """Replace ChatGroq with FakeLLM and return the list of instances built."""
    built = []

    def _factory(**kwargs):
        llm = FakeLLM(**kwargs)
        built.append(llm)
        return llm

    monkeypatch.setattr(groq_service, "ChatGroq", _factory)
    return built


def _rate_limit_error(retry_after=None, message="rate limited"):
    request = httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions")
    headers = {"retry-after": str(retry_after)} if retry_after is not None else {}
    response = httpx.Response(429, headers=headers, request=request)
    return RateLimitError(message, response=response, body=None)


# ── Client cache ─────────────────────────────────────────────────────────────


def test_identical_params_reuse_one_client(fake_chat_groq):
    first = groq_service._get_llm("gsk_a", "model-x", 0.2)
    second = groq_service._get_llm("gsk_a", "model-x", 0.2)

    assert first is second
    assert len(fake_chat_groq) == 1


def test_distinct_api_keys_get_distinct_clients(fake_chat_groq):
    """The per-feature dedicated keys must never share a client, or they'd stop
    drawing on independent per-key rate limits."""
    main = groq_service._get_llm("gsk_main", "model-x", 0.2)
    hyde = groq_service._get_llm("gsk_hyde", "model-x", 0.2)

    assert main is not hyde
    assert {llm.api_key for llm in fake_chat_groq} == {"gsk_main", "gsk_hyde"}


def test_distinct_model_or_temperature_get_distinct_clients(fake_chat_groq):
    base = groq_service._get_llm("gsk_a", "model-x", 0.2)
    other_model = groq_service._get_llm("gsk_a", "model-y", 0.2)
    other_temp = groq_service._get_llm("gsk_a", "model-x", 0.9)

    assert len({id(base), id(other_model), id(other_temp)}) == 3
    assert len(fake_chat_groq) == 3


@pytest.mark.asyncio
async def test_repeated_chat_complete_builds_one_client(fake_chat_groq, monkeypatch):
    """The regression that mattered: 300 chunks used to mean 300 clients."""
    monkeypatch.setattr(groq_service, "_get_api_key", lambda: "gsk_test")

    for _ in range(5):
        result = await groq_service.chat_complete(
            [{"role": "user", "content": "hi"}], model="model-x"
        )
        assert result == "ok"

    assert len(fake_chat_groq) == 1
    assert fake_chat_groq[0].calls == 5


@pytest.mark.asyncio
async def test_features_with_dedicated_keys_do_not_share_a_client(fake_chat_groq, monkeypatch):
    monkeypatch.setattr(groq_service, "_get_api_key", lambda: "gsk_main")
    monkeypatch.setattr(groq_service, "_get_hyde_api_key", lambda: "gsk_hyde")
    monkeypatch.setattr(groq_service, "_get_negotiation_api_key", lambda: "gsk_negotiation")

    await groq_service.chat_complete([{"role": "user", "content": "hi"}], model="model-x")
    await groq_service.generate_hypothetical_document("what is the notice period?")
    await groq_service.negotiation_complete([{"role": "user", "content": "draft"}])

    assert {llm.api_key for llm in fake_chat_groq} == {
        "gsk_main",
        "gsk_hyde",
        "gsk_negotiation",
    }


def test_reset_llm_cache_drops_cached_clients(fake_chat_groq):
    first = groq_service._get_llm("gsk_a", "model-x", 0.2)
    groq_service._reset_llm_cache()
    second = groq_service._get_llm("gsk_a", "model-x", 0.2)

    assert first is not second


# ── Retry-After handling ─────────────────────────────────────────────────────


def test_retry_after_header_is_clamped():
    """An upstream telling us to wait an hour must not hang the request."""
    wait = groq_service._retry_after_seconds(_rate_limit_error(retry_after=3600))
    assert wait == groq_service._MAX_RETRY_AFTER_SECONDS


def test_retry_after_message_hint_is_clamped():
    err = _rate_limit_error(message="Rate limit reached, try again in 900.5s")
    assert groq_service._retry_after_seconds(err) == groq_service._MAX_RETRY_AFTER_SECONDS


def test_short_retry_after_is_honoured_verbatim():
    assert groq_service._retry_after_seconds(_rate_limit_error(retry_after=7)) == 7.0


def test_missing_retry_after_falls_back_to_zero():
    assert groq_service._retry_after_seconds(_rate_limit_error()) == 0.0


def test_retry_after_on_error_without_response():
    """Connection errors carry no Retry-After; the caller then backs off."""
    request = httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions")
    assert groq_service._retry_after_seconds(APIConnectionError(request=request)) == 0.0


# ── Retry loop ───────────────────────────────────────────────────────────────


class FlakyLLM:
    """Raises the given errors in order, then succeeds."""

    def __init__(self, errors):
        self._errors = list(errors)
        self.attempts = 0

    async def ainvoke(self, messages):
        self.attempts += 1
        if self._errors:
            raise self._errors.pop(0)
        return type("Msg", (), {"content": "ok"})()


async def _no_sleep(seconds):
    """Stand-in for asyncio.sleep so backoff tests run instantly."""
    return None


def _transient_errors():
    request = httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions")
    return [
        APIConnectionError(request=request),
        APITimeoutError(request=request),
        InternalServerError("boom", response=httpx.Response(500, request=request), body=None),
        _rate_limit_error(retry_after=1),
    ]


@pytest.mark.asyncio
@pytest.mark.parametrize("error", _transient_errors(), ids=lambda e: type(e).__name__)
async def test_transient_errors_are_retried(error, monkeypatch):
    """A single blip must not fail a whole multi-call analysis."""
    monkeypatch.setattr(groq_service.asyncio, "sleep", _no_sleep)
    llm = FlakyLLM([error])

    result = await groq_service._invoke_with_retry(llm, [], asyncio.Semaphore(2))

    assert result == "ok"
    assert llm.attempts == 2


@pytest.mark.asyncio
async def test_non_retryable_error_propagates_immediately(monkeypatch):
    monkeypatch.setattr(groq_service.asyncio, "sleep", _no_sleep)
    llm = FlakyLLM([ValueError("bad request")])

    with pytest.raises(ValueError):
        await groq_service._invoke_with_retry(llm, [], asyncio.Semaphore(2))

    assert llm.attempts == 1


@pytest.mark.asyncio
async def test_retries_are_exhausted_and_the_error_surfaces(monkeypatch):
    monkeypatch.setattr(groq_service.asyncio, "sleep", _no_sleep)
    llm = FlakyLLM([_rate_limit_error(retry_after=1) for _ in range(groq_service._MAX_RETRIES)])

    with pytest.raises(RateLimitError):
        await groq_service._invoke_with_retry(llm, [], asyncio.Semaphore(2))

    assert llm.attempts == groq_service._MAX_RETRIES


@pytest.mark.asyncio
async def test_semaphore_is_released_while_backing_off(monkeypatch):
    """Holding a permit across the sleep would park half the process's
    concurrency for the whole backoff."""
    semaphore = asyncio.Semaphore(2)
    permits_free_during_sleep = []

    async def _record_sleep(seconds):
        permits_free_during_sleep.append(semaphore._value)

    monkeypatch.setattr(groq_service.asyncio, "sleep", _record_sleep)
    llm = FlakyLLM([_rate_limit_error(retry_after=1)])

    await groq_service._invoke_with_retry(llm, [], semaphore)

    assert permits_free_during_sleep == [2]
