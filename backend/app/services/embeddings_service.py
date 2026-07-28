"""Text embeddings via HuggingFace's hosted Inference API.

Split out of ``analysis_service`` so the vector store can depend on embeddings
without importing the analysis pipeline (which depends on the vector store).

Nothing runs locally: no torch, no GPU, no model download, so the serverless
deployment stays small and cold starts stay fast.
"""

import asyncio
import logging
from functools import lru_cache

from langchain_core.embeddings import Embeddings

logger = logging.getLogger(__name__)

# Small, fast & free embedding model served via HuggingFace's hosted Inference
# API. 384-dim with a ~256-token input limit, which is why retrieval chunks are
# kept small — anything longer would be silently truncated.
EMBEDDING_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
EMBEDDING_DIM = 384

# How many embedding requests may be in flight at once. The API is per-request,
# so a document's chunks would otherwise be embedded one round-trip at a time —
# for a 40-chunk contract that is 40 sequential HTTP calls. Bounded rather than
# unlimited so a long document doesn't open hundreds of sockets or trip the
# provider's rate limit.
_EMBED_CONCURRENCY = 8


class _HFInferenceEmbeddings(Embeddings):
    """LangChain embeddings backed by huggingface_hub's InferenceClient.

    We use InferenceClient directly (not langchain-community's
    HuggingFaceInferenceAPIEmbeddings) because the latter hardcodes the retired
    ``api-inference.huggingface.co`` host, which no longer resolves. The modern
    client targets ``router.huggingface.co`` and needs only huggingface_hub.
    """

    def __init__(self, token: str, model: str) -> None:
        from huggingface_hub import InferenceClient

        self._model = model
        self._client = InferenceClient(model=model, token=token, provider="hf-inference")

    def _embed_one(self, text: str) -> list[float]:
        import numpy as np

        vec = self._client.feature_extraction(text, model=self._model)
        arr = np.asarray(vec, dtype="float32")
        # Some models return per-token vectors (seq_len, dim); mean-pool them
        # down to a single sentence vector. Sentence-transformers models
        # usually already return the pooled (dim,) vector.
        if arr.ndim == 2:
            arr = arr.mean(axis=0)
        elif arr.ndim > 2:
            arr = arr.reshape(-1, arr.shape[-1]).mean(axis=0)
        return arr.astype("float32").tolist()

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._embed_one(t) for t in texts]

    def embed_query(self, text: str) -> list[float]:
        return self._embed_one(text)


@lru_cache(maxsize=1)
def get_embeddings() -> Embeddings:
    """Build the HuggingFace Inference-API embedding client once per process."""
    from app.config import get_settings

    token = get_settings().HUGGINGFACEHUB_API_TOKEN
    if not token:
        raise RuntimeError("HUGGINGFACEHUB_API_TOKEN is not set")

    return _HFInferenceEmbeddings(token=token, model=EMBEDDING_MODEL_NAME)


async def embed_query(text: str) -> list[float]:
    """Embed a single query string off the event loop."""
    client = get_embeddings()
    return await asyncio.to_thread(client.embed_query, text)


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed many texts concurrently, preserving input order.

    Each call is a blocking HTTP request, so they run in threads with a bounded
    gate. Order is preserved by writing into a pre-sized list rather than relying
    on completion order.
    """
    if not texts:
        return []

    client = get_embeddings()
    results: list[list[float] | None] = [None] * len(texts)
    gate = asyncio.Semaphore(_EMBED_CONCURRENCY)

    async def one(index: int, text: str) -> None:
        async with gate:
            results[index] = await asyncio.to_thread(client.embed_query, text)

    await asyncio.gather(*(one(i, t) for i, t in enumerate(texts)))

    missing = [i for i, vec in enumerate(results) if vec is None]
    if missing:  # pragma: no cover - gather would have raised first
        raise RuntimeError(f"embedding failed for chunks {missing}")
    return [vec for vec in results if vec is not None]
