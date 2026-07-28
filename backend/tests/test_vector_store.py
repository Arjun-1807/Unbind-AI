"""Tests for the persistent per-analysis vector index.

Embeddings are stubbed with deterministic vectors so retrieval behaviour is
asserted exactly, with no network and no model. What's under test is the storage
round-trip and the ranking — not the embedding model's quality.
"""

import numpy as np
import pytest

from app.services import embeddings_service, vector_store


def _unit(*values) -> list[float]:
    """A normalised vector, so expected cosine scores are easy to reason about."""
    arr = np.asarray(values, dtype="float32")
    return (arr / np.linalg.norm(arr)).tolist()


def _index(vectors: list[list[float]], texts: list[str] | None = None) -> dict:
    """Build an in-memory index record the way build_index would store one."""
    blob, count, dim = vector_store._pack(vectors)
    chunks = [
        {"text": texts[i] if texts else f"chunk {i}", "start": i * 10, "end": i * 10 + 5}
        for i in range(count)
    ]
    return {"chunks": chunks, "vectors": blob, "count": count, "dim": dim}


# ── Packing round-trip ───────────────────────────────────────────────────────


def test_pack_unpack_round_trip():
    vectors = [_unit(1, 0, 0), _unit(0, 1, 0)]
    blob, count, dim = vector_store._pack(vectors)
    assert (count, dim) == (2, 3)

    restored = vector_store._unpack(blob, count, dim)
    assert np.allclose(restored, np.asarray(vectors, dtype="float32"), atol=1e-6)


def test_pack_normalises_rows():
    """Rows are normalised at write time so search is a plain dot product."""
    blob, count, dim = vector_store._pack([[3.0, 4.0], [0.0, 5.0]])
    restored = vector_store._unpack(blob, count, dim)
    assert np.allclose(np.linalg.norm(restored, axis=1), [1.0, 1.0], atol=1e-6)
    assert np.allclose(restored[0], [0.6, 0.8], atol=1e-6)


def test_pack_tolerates_a_zero_vector():
    """A zero row must not become NaN — that would poison every comparison."""
    blob, count, dim = vector_store._pack([[0.0, 0.0], [1.0, 0.0]])
    restored = vector_store._unpack(blob, count, dim)
    assert not np.isnan(restored).any()


def test_pack_rejects_a_ragged_matrix():
    with pytest.raises(ValueError):
        vector_store._pack([[1.0, 0.0], [1.0]])


def test_packed_blob_is_half_the_size_of_bson_doubles():
    """float32 packing is the reason to use Binary over a list of doubles."""
    vectors = [[float(i)] * 384 for i in range(1, 51)]
    blob, count, dim = vector_store._pack(vectors)
    assert len(bytes(blob)) == count * dim * 4  # 4 bytes/float, not 8


# ── Ranking ──────────────────────────────────────────────────────────────────


def test_search_ranks_by_cosine_similarity():
    index = _index(
        [_unit(1, 0, 0), _unit(0, 1, 0), _unit(0, 0, 1)],
        texts=["x-axis", "y-axis", "z-axis"],
    )
    results = vector_store.search_index(index, _unit(0.9, 0.1, 0), k=3)

    assert [r["text"] for r in results] == ["x-axis", "y-axis", "z-axis"]
    # Scores descend, and the best is a near-perfect match.
    assert results[0]["score"] > results[1]["score"] > results[2]["score"]
    assert results[0]["score"] == pytest.approx(0.994, abs=0.01)


def test_search_respects_k():
    index = _index([_unit(1, 0), _unit(0, 1), _unit(1, 1)])
    assert len(vector_store.search_index(index, _unit(1, 0), k=2)) == 2


def test_search_k_is_clamped_to_the_index_size():
    """Asking for more neighbours than exist must not error or pad."""
    index = _index([_unit(1, 0), _unit(0, 1)])
    assert len(vector_store.search_index(index, _unit(1, 0), k=99)) == 2


def test_search_carries_offsets_through():
    """Citations depend on these offsets surviving retrieval."""
    index = _index([_unit(1, 0), _unit(0, 1)])
    top = vector_store.search_index(index, _unit(0, 1), k=1)[0]
    assert (top["start"], top["end"]) == (10, 15)


def test_search_on_an_empty_index_returns_nothing():
    assert vector_store.search_index({"count": 0}, _unit(1, 0), k=3) == []


def test_search_with_a_zero_query_returns_nothing():
    """A zero query has no direction, so no ranking is meaningful."""
    index = _index([_unit(1, 0)])
    assert vector_store.search_index(index, [0.0, 0.0], k=1) == []


def test_search_rejects_a_dimension_mismatch():
    """Silently comparing across vector spaces would return confident nonsense."""
    index = _index([_unit(1, 0, 0)])
    with pytest.raises(ValueError, match="does not match index dim"):
        vector_store.search_index(index, _unit(1, 0), k=1)


# ── Build / reuse / invalidate ───────────────────────────────────────────────


@pytest.fixture
def stub_embeddings(monkeypatch):
    """Embed deterministically from text length — no network, no model."""
    calls = {"count": 0}

    async def fake_embed_texts(texts):
        calls["count"] += len(texts)
        return [_unit(len(t) % 7 + 1, len(t) % 5 + 1, 1) for t in texts]

    async def fake_embed_query(text):
        return _unit(len(text) % 7 + 1, len(text) % 5 + 1, 1)

    monkeypatch.setattr(vector_store, "embed_texts", fake_embed_texts)
    monkeypatch.setattr(embeddings_service, "embed_query", fake_embed_query)
    return calls


async def test_build_index_persists_vectors(fake_db, stub_embeddings):
    text = "This is a rental agreement. " * 200
    record = await vector_store.build_index("a1", "u1", text)

    assert record is not None
    assert record["count"] > 1
    assert record["dim"] == 3
    assert record["model"] == vector_store.EMBEDDING_MODEL_NAME

    stored = await fake_db["document_vectors"].find_one({"analysisId": "a1", "userId": "u1"})
    assert stored is not None
    assert stored["count"] == record["count"]


async def test_build_index_on_empty_text_returns_none(fake_db, stub_embeddings):
    assert await vector_store.build_index("a1", "u1", "") is None


async def test_get_or_build_reuses_a_stored_index(fake_db, stub_embeddings):
    """The whole point of persisting: a second question re-embeds nothing."""
    text = "Tenant shall pay rent monthly. " * 100
    await vector_store.get_or_build_index("a1", "u1", text)
    after_first = stub_embeddings["count"]
    assert after_first > 0

    await vector_store.get_or_build_index("a1", "u1", text)
    assert stub_embeddings["count"] == after_first, "index was rebuilt instead of reused"


async def test_stale_model_triggers_a_rebuild(fake_db, stub_embeddings):
    """Comparing vectors from two different models would be meaningless."""
    text = "Tenant shall pay rent monthly. " * 100
    await vector_store.build_index("a1", "u1", text)
    await fake_db["document_vectors"].update_one(
        {"analysisId": "a1", "userId": "u1"},
        {"$set": {"model": "some-old-model"}},
    )
    before = stub_embeddings["count"]

    record = await vector_store.get_or_build_index("a1", "u1", text)
    assert stub_embeddings["count"] > before
    assert record["model"] == vector_store.EMBEDDING_MODEL_NAME


async def test_index_is_scoped_to_its_owner(fake_db, stub_embeddings):
    """One user's stored vectors must be invisible to another."""
    text = "Confidential terms. " * 100
    await vector_store.build_index("a1", "owner", text)

    assert await vector_store._load("a1", "owner") is not None
    assert await vector_store._load("a1", "intruder") is None


async def test_delete_index_removes_the_vectors(fake_db, stub_embeddings):
    text = "Termination clause. " * 100
    await vector_store.build_index("a1", "u1", text)
    await vector_store.delete_index("a1", "u1")
    assert await vector_store._load("a1", "u1") is None


async def test_delete_index_never_raises(monkeypatch):
    """Cleanup must not fail a user's delete."""

    def boom():
        raise RuntimeError("db down")

    monkeypatch.setattr(vector_store, "get_db", boom)
    await vector_store.delete_index("a1", "u1")  # must not raise


async def test_search_end_to_end(fake_db, stub_embeddings):
    text = "Rent is due on the first. " * 100
    results = await vector_store.search("a1", "u1", text, "when is rent due", k=3)
    assert results
    assert all("text" in r and "start" in r for r in results)


# ── Keyword fallback ─────────────────────────────────────────────────────────


async def test_keyword_fallback_prefers_chunks_containing_query_words():
    text = ("Payment terms are net thirty. " * 40) + ("Subletting is prohibited entirely. " * 40)
    results = await vector_store.keyword_fallback(text, "subletting prohibited", k=2)
    assert results
    assert "ubletting" in results[0]["text"]


async def test_keyword_fallback_returns_leading_chunks_when_nothing_matches():
    text = "Payment terms are net thirty. " * 100
    results = await vector_store.keyword_fallback(text, "zzzz nonexistent", k=3)
    assert len(results) == 3


async def test_keyword_fallback_preserves_offsets():
    """Degraded retrieval still has to produce jumpable citations."""
    text = "Termination requires notice. " * 100
    results = await vector_store.keyword_fallback(text, "termination notice", k=1)
    assert results[0]["start"] >= 0
    assert results[0]["end"] > results[0]["start"]


async def test_keyword_fallback_on_empty_text():
    assert await vector_store.keyword_fallback("", "anything") == []
