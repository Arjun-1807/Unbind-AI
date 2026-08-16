"""Persistent per-analysis embedding index with exact similarity search.

**Why there is no vector database here.** Retrieval in this product is always
scoped to a *single* contract — we never search across a corpus. One document is
tens to a few hundred chunks of 384-dim vectors, so an exact brute-force cosine
scan in numpy costs microseconds: less than the network round-trip to an external
index would, and *exact* rather than approximate. A dedicated vector service
(Chroma Cloud, Atlas Vector Search) would add cost, an operational dependency,
and approximation to solve a problem at a scale that doesn't have it.

What matters for performance is not the search — it's the *embedding*. Building
the index means one API call per chunk, which is why it is done once per analysis
and reused. The previous implementation rebuilt an ephemeral index on every
question, so asking five questions about one contract embedded it five times.

Vectors are stored as packed float32 bytes in a BSON ``Binary`` rather than a
list of BSON doubles: half the size on the wire and in memory, and it loads
straight into numpy with no per-element Python conversion.
"""

import logging
from datetime import datetime, timezone
from typing import Any

from bson import Binary

from app.database import get_db
from app.services.embeddings_service import EMBEDDING_MODEL_NAME, embed_texts
from app.services.pdf_processing import chunk_text_with_offsets

logger = logging.getLogger(__name__)

COLLECTION = "document_vectors"

# ~1000-char chunks (~250 tokens) sit just under the embedding model's 256-token
# limit, so every chunk is embedded in full with no silent truncation. The 150
# overlap keeps a clause that straddles a boundary retrievable from either side.
CHUNK_SIZE = 1000
CHUNK_OVERLAP = 150

# Hard ceiling on chunks per document. At 1000 chars/chunk this covers ~800k
# characters — beyond the 600k input cap — so it should never bind in practice.
# It exists so a pathological document can't drive unbounded embedding calls.
MAX_CHUNKS = 800


def _pack(vectors: list[list[float]]) -> tuple[Binary, int, int]:
    """Flatten vectors to packed float32 bytes. Returns (blob, count, dim)."""
    import numpy as np

    matrix = np.asarray(vectors, dtype="float32")
    if matrix.ndim != 2:
        raise ValueError(f"expected a 2-D embedding matrix, got shape {matrix.shape}")
    # Normalise once at write time so search is a plain dot product instead of a
    # division per query. Zero-norm rows (an empty chunk) are left alone rather
    # than producing NaNs that would poison every later comparison.
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    np.divide(matrix, norms, out=matrix, where=norms > 0)
    count, dim = matrix.shape
    return Binary(matrix.tobytes()), count, dim


def _unpack(blob: bytes, count: int, dim: int):
    import numpy as np

    return np.frombuffer(blob, dtype="float32").reshape(count, dim)


async def _load(analysis_id: str, user_id: str) -> dict[str, Any] | None:
    """Fetch a stored index, scoped to its owner."""
    db = get_db()
    return await db[COLLECTION].find_one({"analysisId": analysis_id, "userId": user_id})


async def build_index(analysis_id: str, user_id: str, document_text: str) -> dict[str, Any] | None:
    """Chunk, embed and persist ``document_text``. Returns the stored record.

    Returns None when the document yields no chunks. Upserts, so rebuilding after
    a model change or a re-analysis replaces the old vectors rather than
    accumulating duplicates.
    """
    chunks = chunk_text_with_offsets(document_text, CHUNK_SIZE, CHUNK_OVERLAP)
    if not chunks:
        return None
    if len(chunks) > MAX_CHUNKS:
        logger.warning(
            "Document for analysis %s produced %d chunks; indexing the first %d",
            analysis_id,
            len(chunks),
            MAX_CHUNKS,
        )
        chunks = chunks[:MAX_CHUNKS]

    vectors = await embed_texts([c["text"] for c in chunks])
    blob, count, dim = _pack(vectors)

    record = {
        "analysisId": analysis_id,
        "userId": user_id,
        "chunks": chunks,
        "vectors": blob,
        "count": count,
        "dim": dim,
        "model": EMBEDDING_MODEL_NAME,
        "createdAt": datetime.now(timezone.utc),
    }
    db = get_db()
    await db[COLLECTION].update_one(
        {"analysisId": analysis_id, "userId": user_id},
        {"$set": record},
        upsert=True,
    )
    logger.info("Built vector index for analysis %s (%d chunks)", analysis_id, count)
    return record


async def get_or_build_index(
    analysis_id: str, user_id: str, document_text: str
) -> dict[str, Any] | None:
    """Return the stored index, building it on first use.

    Lazy rather than eager so analyses created before this feature existed — and
    any whose indexing failed — work on their next question instead of needing a
    migration. A model change also invalidates: a record embedded with a
    different model is rebuilt rather than silently compared across vector
    spaces, which would return confident nonsense.
    """
    existing = await _load(analysis_id, user_id)
    if existing and existing.get("model") == EMBEDDING_MODEL_NAME and existing.get("count"):
        return existing
    if existing:
        logger.info(
            "Rebuilding vector index for analysis %s (stored model %r != current %r)",
            analysis_id,
            existing.get("model"),
            EMBEDDING_MODEL_NAME,
        )
    return await build_index(analysis_id, user_id, document_text)


def search_index(index: dict[str, Any], query_vector: list[float], k: int) -> list[dict[str, Any]]:
    """Return the ``k`` chunks most similar to ``query_vector``, best first.

    Exact cosine similarity. Stored vectors are pre-normalised, so this is a
    single matrix-vector product plus a partial sort — microseconds for any
    document this product accepts. Synchronous because at this size the work is
    genuinely negligible; there is nothing worth handing to a thread.
    """
    import numpy as np

    count = index.get("count", 0)
    if not count:
        return []

    matrix = _unpack(index["vectors"], count, index["dim"])
    query = np.asarray(query_vector, dtype="float32")
    if query.shape != (index["dim"],):
        raise ValueError(f"query dim {query.shape} does not match index dim {index['dim']}")

    norm = float(np.linalg.norm(query))
    if norm == 0:
        return []
    query = query / norm

    scores = matrix @ query
    k = max(1, min(k, count))
    # argpartition finds the top-k without sorting the whole array, then we sort
    # just those k so the best-scoring chunk is first.
    top = np.argpartition(-scores, k - 1)[:k]
    top = top[np.argsort(-scores[top])]

    chunks = index["chunks"]
    results = []
    for i in top:
        chunk = chunks[int(i)]
        results.append(
            {
                "text": chunk["text"],
                "start": chunk.get("start", -1),
                "end": chunk.get("end", -1),
                "score": float(scores[int(i)]),
            }
        )
    return results


async def search(
    analysis_id: str,
    user_id: str,
    document_text: str,
    query_text: str,
    k: int = 6,
) -> list[dict[str, Any]]:
    """Embed ``query_text`` and return the most relevant chunks of the document."""
    from app.services.embeddings_service import embed_query

    index = await get_or_build_index(analysis_id, user_id, document_text)
    if not index:
        return []
    query_vector = await embed_query(query_text)
    return search_index(index, query_vector, k)


async def delete_index(analysis_id: str, user_id: str) -> None:
    """Drop a document's vectors. Best-effort: called when an analysis is deleted.

    A failure here leaves orphaned vectors, which is wasted storage but not a
    correctness problem — every read is scoped by analysisId, so orphans are
    unreachable. Not worth failing the user's delete over.
    """
    try:
        db = get_db()
        await db[COLLECTION].delete_one({"analysisId": analysis_id, "userId": user_id})
    except Exception:
        logger.exception("Failed to delete vector index for analysis %s", analysis_id)


async def keyword_fallback(document_text: str, query_text: str, k: int = 6) -> list[dict[str, Any]]:
    """Offset-preserving keyword match, for when embedding is unavailable.

    Used when the embedding provider is down or unconfigured: a degraded answer
    grounded in real excerpts beats no answer, and because offsets survive, the
    citations still jump to the right place in the document.

    Returns [] when no query word matches anything. It used to hand back "the
    first k chunks", which the answering prompt then presents as *the relevant
    excerpts* — so a question the document is silent on came back confidently
    cited to whatever happens to be on page one. No match is information; the
    caller turns it into "I couldn't find anything about this".
    """
    chunks = chunk_text_with_offsets(document_text, CHUNK_SIZE, CHUNK_OVERLAP)
    if not chunks:
        return []

    words = {w for w in query_text.lower().split() if len(w) > 3}
    if not words:
        return []

    scored = []
    for chunk in chunks:
        lowered = chunk["text"].lower()
        hits = sum(1 for w in words if w in lowered)
        if hits:
            scored.append((hits, chunk))
    if not scored:
        return []

    scored.sort(key=lambda pair: -pair[0])
    return [{**chunk, "score": 0.0} for _, chunk in scored[:k]]
