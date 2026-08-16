"""Tests for embedding-client isolation.

The point of these is not that embeddings work — it's that a hung embedding
provider can't take the rest of the process down with it. Two defences: a
request timeout, and a dedicated thread pool so a stall never eats the shared
``asyncio.to_thread`` executor that outbound SMTP also runs on.
"""

import sys
import threading
import types

import pytest

from app.services import embeddings_service


class _FakeInferenceClient:
    """Records the kwargs it was constructed with; returns a fixed vector."""

    last_kwargs: dict = {}

    def __init__(self, **kwargs):
        type(self).last_kwargs = kwargs

    def feature_extraction(self, text, model=None):
        return [0.1] * embeddings_service.EMBEDDING_DIM


@pytest.fixture
def fake_hub(monkeypatch):
    """Stand in for huggingface_hub, which is imported inside __init__."""
    module = types.ModuleType("huggingface_hub")
    module.InferenceClient = _FakeInferenceClient
    monkeypatch.setitem(sys.modules, "huggingface_hub", module)
    embeddings_service.get_embeddings.cache_clear()
    yield _FakeInferenceClient
    embeddings_service.get_embeddings.cache_clear()


# ── The timeout ──────────────────────────────────────────────────────────────


def test_inference_client_is_given_an_explicit_timeout(fake_hub):
    embeddings_service._HFInferenceEmbeddings(token="t", model="m")
    timeout = fake_hub.last_kwargs.get("timeout")
    # InferenceClient defaults to timeout=None, i.e. wait forever.
    assert timeout is not None
    assert 0 < timeout <= 60


def test_timeout_constant_is_finite():
    assert embeddings_service._EMBED_TIMEOUT_SECONDS > 0


# ── Executor isolation ───────────────────────────────────────────────────────


def test_embeddings_use_a_dedicated_bounded_executor():
    executor = embeddings_service._embed_executor
    assert executor is not None
    # Bounded, and never larger than the concurrency gate that feeds it.
    assert executor._max_workers == embeddings_service._EMBED_CONCURRENCY


async def test_embedding_work_does_not_run_on_the_default_to_thread_pool():
    """A hung embedding must not pin a thread that send_email also needs."""
    seen: list[str] = []

    def record() -> list[float]:
        seen.append(threading.current_thread().name)
        return [0.0]

    await embeddings_service._run_embed(record)
    assert seen[0].startswith("embeddings")
    # asyncio.to_thread's default pool names its threads asyncio_*.
    assert not seen[0].startswith("asyncio")


async def test_embed_texts_preserves_order_on_the_dedicated_pool(monkeypatch):
    class _Client:
        def embed_query(self, text):
            return [float(len(text))]

    monkeypatch.setattr(embeddings_service, "get_embeddings", lambda: _Client())
    out = await embeddings_service.embed_texts(["a", "bb", "ccc"])
    assert out == [[1.0], [2.0], [3.0]]


async def test_embed_texts_short_circuits_on_empty_input():
    assert await embeddings_service.embed_texts([]) == []
