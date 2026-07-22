import asyncio
import json
import logging
import re
from collections.abc import Callable
from functools import lru_cache
from typing import Any

from langchain_core.embeddings import Embeddings
from langsmith import traceable

from app.services.groq_service import chat_complete, generate_hypothetical_document
from app.services.pdf_processing import (
    chunk_text,
    chunk_text_with_offsets,
    convert_pdf_to_markdown,
)

logger = logging.getLogger(__name__)


# ───── Helpers ─────


def _strip_code_fence(text: str) -> str:
    """Remove optional markdown code fences while preserving JSON content."""
    cleaned = text.strip()
    # Matches fenced blocks like ```json ... ``` or ``` ... ```
    fence_match = re.match(r"^```(?:json)?\s*(.*?)\s*```$", cleaned, re.DOTALL | re.IGNORECASE)
    if fence_match:
        return fence_match.group(1).strip()
    return cleaned


def _extract_json_span(text: str) -> str | None:
    """Extract the first balanced JSON object/array from mixed text."""
    start = -1
    opening = ""
    closing = ""
    for idx, ch in enumerate(text):
        if ch == "{":
            start = idx
            opening, closing = "{", "}"
            break
        if ch == "[":
            start = idx
            opening, closing = "[", "]"
            break

    if start == -1:
        return None

    depth = 0
    in_string = False
    escaped = False
    for idx in range(start, len(text)):
        ch = text[idx]
        if escaped:
            escaped = False
            continue
        if ch == "\\":
            escaped = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == opening:
            depth += 1
        elif ch == closing:
            depth -= 1
            if depth == 0:
                return text[start : idx + 1]
    return None


def _try_parse_json(text: str) -> Any | None:
    cleaned = _strip_code_fence(text)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    candidate = _extract_json_span(cleaned)
    if candidate:
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            return None
    return None


# ───── Chunk analysis ─────


@traceable(name="analyze_chunk")
async def _analyze_chunk(
    chunk: str,
    role: str,
    user_id: str | None = None,
) -> tuple[list[dict], bool]:
    role_instruction = (
        f"The user's role is: {role}. Analyze ALL content in this chunk from their perspective."
    )
    output = await chat_complete(
        [
            {
                "role": "system",
                "content": (
                    "You help people with below-average literacy. You MUST analyze EVERY piece of content in the text chunk.\n"
                    "IMPORTANT: Do not skip any content. Every section, paragraph, or clause must be analyzed and included in your response.\n\n"
                    "For each piece of content:\n"
                    "- If it's a standard/neutral clause with NO risk at all, set riskLevel to 'No Risk' and provide only a summary explanation\n"
                    "- If it's a standard clause with minimal risk, set riskLevel to 'Negligible' and provide full explanation\n"
                    "- If there's potential harm or imbalance, assign Low/Medium/High risk levels\n"
                    "- Use simple words at about a 6th-grade level. Keep explanations clear and helpful\n\n"
                    "Required fields for each clause:\n"
                    "- clauseText: The actual text being analyzed\n"
                    "- simplifiedExplanation: 1–2 sentences explaining what this means in plain language\n"
                    "- riskLevel: One of [Low, Medium, High, Negligible, No Risk]\n"
                    "- riskReason: For No Risk, just say 'No risk identified'. For other risks, explain what could go wrong.\n"
                    "- negotiationSuggestion: For No Risk, say 'No changes needed'. For other risks, suggest improvements.\n"
                    "- suggestedRewrite: For No Risk, say 'No changes needed'. For other risks, provide a safer version.\n\n"
                    "Return JSON only with a clauses array. Make sure to cover ALL content in the chunk, not just risky parts."
                ),
            },
            {
                "role": "user",
                "content": f"{role_instruction}\n\nTEXT CHUNK TO ANALYZE:\n{chunk}\n\nAnalyze EVERY part of this text and return JSON with all clauses found.",
            },
        ],
        user_id=user_id,
    )
    parsed = _try_parse_json(output)
    if parsed and isinstance(parsed, dict):
        clauses = parsed.get("clauses", [])
        if isinstance(clauses, list):
            return clauses, False

    logger.warning("Chunk analysis JSON parse failed; output preview=%r", output[:500])
    return [], True


# ───── Report synthesis ─────


@traceable(name="synthesize_report")
async def _synthesize_report(
    clauses: list[dict],
    role: str,
    user_id: str | None = None,
) -> dict:
    role_instruction = f"The user's role is: {role}. Generate a comprehensive summary and extract all relevant information from their perspective."
    clause_context = "\n".join(
        f'Clause {i + 1}:\n- Text: "{c.get("clauseText", "")}"\n- Explanation: "{c.get("simplifiedExplanation", "")}"\n- Risk: {c.get("riskLevel", "")}\n- Risk Reason: "{c.get("riskReason", "")}"\n'
        for i, c in enumerate(clauses)
    )
    output = await chat_complete(
        [
            {
                "role": "system",
                "content": (
                    "You help laypeople. Use simple, short sentences. Avoid jargon.\n"
                    "IMPORTANT: This document has been fully analyzed. Include information about ALL clauses, not just risky ones.\n\n"
                    "Required fields:\n"
                    "- summary: 4-6 short sentences covering the overall document\n"
                    "- keyTerms: Extract important legal/business terms with simple definitions (1 sentence each)\n"
                    "- keyDates: Extract all dates, deadlines, and time periods with descriptions\n"
                    "- missingClauses: Suggest important clauses that might be missing\n"
                    "- chunkSummaries: For each chunk of content, provide a brief summary\n\n"
                    "Return JSON only with: summary (string), keyTerms (array of {term, definition}), "
                    "keyDates (array of {date, description}), missingClauses (array of {clauseName, reason}), "
                    "chunkSummaries (array of {chunkIndex, summary})."
                ),
            },
            {
                "role": "user",
                "content": f"{role_instruction}\n\nCOMPLETE ANALYSIS ({len(clauses)} clauses analyzed):\n{clause_context}\n\nGenerate comprehensive summary covering ALL analyzed content.",
            },
        ],
        user_id=user_id,
    )
    parsed = _try_parse_json(output)
    if not parsed:
        raise RuntimeError("Failed to parse synthesis JSON")
    if "chunkSummaries" not in parsed:
        parsed["chunkSummaries"] = []
    return parsed


# ───── Chunk summaries ─────


@traceable(name="create_chunk_summaries")
async def _create_chunk_summaries(
    chunks: list[str],
    clauses: list[dict],
    role: str,
    user_id: str | None = None,
) -> list[dict]:
    summaries: list[dict] = []
    per_chunk = (
        len(clauses) // len(chunks) + (1 if len(clauses) % len(chunks) else 0)
        if chunks
        else len(clauses)
    )
    for i, chunk in enumerate(chunks):
        start = i * per_chunk
        end = min(start + per_chunk, len(clauses))
        chunk_clauses = clauses[start:end]
        clause_ctx = "\n".join(
            f"- {c.get('clauseText', '')[:100]}... (Risk: {c.get('riskLevel', '')})"
            for c in chunk_clauses
        )
        output = await chat_complete(
            [
                {
                    "role": "system",
                    "content": (
                        "You help laypeople. Create a simple 1-2 sentence summary of what this chunk covers.\n"
                        "Focus on the main topics, not individual clauses. Use plain language.\n"
                        "Return only the summary text, no JSON or formatting."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"The user's role is: {role}. Summarize what this chunk covers.\n\n"
                        f"CHUNK {i + 1} CONTENT:\n{chunk[:500]}...\n\n"
                        f"CLAUSES IN THIS CHUNK:\n{clause_ctx}\n\n"
                        "Provide a simple summary of what this chunk covers."
                    ),
                },
            ],
            user_id=user_id,
        )
        summaries.append({"chunkIndex": i + 1, "summary": output.strip()})
    return summaries


# ───── Legal document validation ─────
@traceable(name="validate_document")
async def validate_legal_document(
    text: str,
    user_id: str | None = None,
) -> bool:
    """Validate if the provided text is a legal document.

    Returns True if the text appears to be a legal document (contract, agreement, NDA, etc.).
    Defaults to True if parsing fails (fail open).
    """
    MAX_START = 700
    MAX_END = 300

    sample = (
        text[:MAX_START]
        if len(text) <= MAX_START + MAX_END
        else text[:MAX_START] + "\n\n...\n\n" + text[-MAX_END:]
    )
    output = await chat_complete(
        [
            {
                "role": "system",
                "content": (
                    "You are a legal document classifier. Determine if the provided text is a legal document "
                    "such as a contract, agreement, NDA, terms of service, lease, employment agreement, or similar legal document.\n\n"
                    'Respond ONLY with a JSON object: {"isLegal": true} or {"isLegal": false}. '
                    "Nothing else."
                ),
            },
            {
                "role": "user",
                "content": f"Is this text a legal document?\n\n{sample}",
            },
        ],
        user_id=user_id,
    )

    parsed = _try_parse_json(output)
    if parsed and isinstance(parsed, dict):
        return parsed.get("isLegal", True)

    # Fail open: if parsing fails, default to True (don't block valid documents)
    return True


# ───── Public: analyse contract ─────


@traceable(name="analyze_contract_pipeline")
async def analyze_contract(
    document_text: str,
    role: str,
    user_id: str | None = None,
    on_progress: Callable[[str, dict], None] | None = None,
) -> dict:
    """Full contract analysis pipeline"""

    def progress(stage: str, **detail: Any) -> None:
        if on_progress:
            on_progress(stage, detail)

    progress("converting", message="Converting document to Markdown for better parsing...")
    markdown_text = convert_pdf_to_markdown(document_text)

    progress("validating", message="Validating legal document...")
    is_legal = await validate_legal_document(markdown_text, user_id=user_id)
    if not is_legal:
        raise ValueError("NOT_A_LEGAL_DOCUMENT")

    progress("chunking", message="Chunking document...")
    # Smaller chunks keep each per-chunk clause analysis within the model's
    # output-token limit, avoiding truncated (unparseable) JSON responses.
    chunks = chunk_text(markdown_text, 2000, 200)
    total_chunks = len(chunks)

    progress(
        "analyzing_start",
        message=f"Analyzing {total_chunks} document section(s)...",
        total=total_chunks,
        completed=0,
    )

    completed = 0

    async def _analyze_chunk_tracked(index: int, chunk: str) -> tuple[list[dict], bool]:
        nonlocal completed
        result = await _analyze_chunk(chunk, role, user_id=user_id)
        completed += 1
        progress(
            "analyzing_clause",
            message=f"Analysing clause {completed} of {total_chunks}...",
            total=total_chunks,
            completed=completed,
            index=index,
        )
        return result

    chunk_results = await asyncio.gather(
        *[_analyze_chunk_tracked(i, chunk) for i, chunk in enumerate(chunks)]
    )
    all_clauses: list[dict] = []
    parse_failures = 0
    for clauses, had_parse_failure in chunk_results:
        all_clauses.extend(clauses)
        if had_parse_failure:
            parse_failures += 1

    if not all_clauses:
        if parse_failures > 0:
            raise RuntimeError(
                "The AI model returned output in an unexpected format, so clauses could not be parsed. "
                "Please retry, switch model, or contact support if this persists."
            )
        raise RuntimeError(
            "No legal clauses were identified in the document. "
            "It might be too short or in an unsupported format."
        )

    progress("summarizing", message="Creating chunk summaries...")
    chunk_summaries = await _create_chunk_summaries(
        chunks,
        all_clauses,
        role,
        user_id=user_id,
    )

    progress("synthesizing", message="Synthesizing final report...")
    final_report = await _synthesize_report(all_clauses, role, user_id=user_id)

    return {
        **final_report,
        "clauses": all_clauses,
        "chunkSummaries": chunk_summaries,
    }


# ───── Impact simulator with LangChain Chroma (HuggingFace hosted embeddings) ─────

# Small, fast & free embedding model served via HuggingFace's hosted Inference
# API — nothing runs locally, so no torch/GPU and it works the same in
# deployment. 384-dim, ~256-token input limit, which is why the retrieval chunks
# below are kept small so nothing gets silently truncated.
EMBEDDING_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"


class _HFInferenceEmbeddings(Embeddings):
    """LangChain embeddings backed by huggingface_hub's InferenceClient.

    We use InferenceClient directly (not langchain-community's
    HuggingFaceInferenceAPIEmbeddings) because the latter hardcodes the retired
    ``api-inference.huggingface.co`` host, which no longer resolves. The modern
    client targets ``router.huggingface.co`` and needs only huggingface_hub —
    no local torch/transformers.
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
def _get_embeddings() -> Embeddings:
    """Build the HuggingFace Inference-API embedding client once per process."""
    from app.config import get_settings

    token = get_settings().HUGGINGFACEHUB_API_TOKEN
    if not token:
        raise RuntimeError("HUGGINGFACEHUB_API_TOKEN is not set")

    return _HFInferenceEmbeddings(token=token, model=EMBEDDING_MODEL_NAME)


def _run_vector_search(indexed_chunks: list[dict], query: str, k: int) -> list[dict]:
    """Build an ephemeral Chroma index and return the top-k relevant chunks.

    ``indexed_chunks`` are ``{text, start, end}`` dicts (see
    ``chunk_text_with_offsets``); the character offsets ride along as Chroma
    metadata so retrieved chunks can be traced back to their exact spot in the
    document for citations. ``query`` is the text embedded to score chunks —
    with HyDE this is the hypothetical passage rather than the raw scenario.
    Synchronous and CPU-bound (model inference), so call it via
    ``asyncio.to_thread`` from async code to avoid blocking the event loop.
    """
    import chromadb
    from chromadb.config import Settings as ChromaSettings
    from langchain_community.vectorstores import Chroma
    from langchain_core.documents import Document

    documents = [
        Document(
            page_content=chunk["text"],
            metadata={"start": chunk["start"], "end": chunk["end"]},
        )
        for chunk in indexed_chunks
    ]
    # Disable Chroma's anonymized telemetry — it otherwise spams noisy
    # "Failed to send telemetry event" logs on every request.
    chroma_client = chromadb.EphemeralClient(settings=ChromaSettings(anonymized_telemetry=False))
    vectorstore = Chroma.from_documents(
        documents=documents,
        embedding=_get_embeddings(),
        client=chroma_client,
        collection_name="contract_analysis",
    )
    try:
        relevant_docs = vectorstore.similarity_search(query, k=k)
        return [
            {
                "text": doc.page_content,
                "start": doc.metadata.get("start", -1),
                "end": doc.metadata.get("end", -1),
            }
            for doc in relevant_docs
        ]
    finally:
        # Drop the in-memory collection so repeated requests never collide.
        try:
            chroma_client.delete_collection("contract_analysis")
        except Exception:
            pass


# System prompt shared by the answer builder. The [n] citation contract is what
# lets the frontend turn markers into clickable jumps to the exact source span.
_SIMULATE_SYSTEM_PROMPT = (
    "You help people with below-average literacy. Answer simply in plain words. "
    "Use up to 5 bullet points, each 1–2 short sentences, no jargon. "
    'If helpful, include 1 tiny example starting with "Example:". '
    "The contract excerpts below are labelled [S1], [S2], and so on. When a "
    "point is based on an excerpt, put that excerpt's label in square brackets "
    'right after the point, e.g. "You could lose your deposit [S2]." Cite ONLY '
    "labels that actually appear below (e.g. if only [S1] is shown, never write "
    "[S2]). These [S#] labels are the ONLY citations — never turn a clause "
    'number from the contract (like "2." or "Section 3") into a citation.'
)


def _citation_preview(text: str, limit: int = 180) -> str:
    """Short single-line preview of a chunk for the citation's Sources list."""
    collapsed = " ".join(text.split())
    if len(collapsed) <= limit:
        return collapsed
    return collapsed[: limit - 1].rstrip() + "…"


async def _answer_with_citations(
    scenario: str,
    chunks: list[dict],
    user_id: str | None,
) -> dict:
    """Ask the LLM to answer the scenario, citing numbered excerpts inline.

    Returns ``{"answer": str, "citations": [...]}`` where each citation carries
    the character span (``startIndex``/``endIndex``) of the excerpt in the
    original document so the UI can jump to the exact passage.
    """
    numbered_context = "\n\n".join(f"[S{i + 1}] {chunk['text']}" for i, chunk in enumerate(chunks))
    answer = await chat_complete(
        [
            {"role": "system", "content": _SIMULATE_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    f"Scenario: {scenario}\n\nContract Excerpts:\n{numbered_context}\n\n"
                    "Write the answer in very simple words. Keep it under 300 words. "
                    "Add the [number] citations inline where they apply."
                ),
            },
        ],
        user_id=user_id,
        temperature=0.2,
    )
    citations = [
        {
            "id": i + 1,
            "snippet": _citation_preview(chunk["text"]),
            "startIndex": chunk["start"],
            "endIndex": chunk["end"],
        }
        for i, chunk in enumerate(chunks)
    ]
    return {"answer": answer, "citations": citations}


@traceable(name="simulate_impact")
async def simulate_impact(
    document_text: str,
    scenario: str,
    user_id: str | None = None,
) -> dict:
    """Vector-based impact simulation with clause-level citations.

    Returns ``{"answer": str, "citations": [...]}``. Each citation carries the
    character span of the source excerpt in ``document_text`` so the UI can jump
    to the exact passage the answer relied on.
    """
    if not scenario.strip():
        return {"answer": "Please enter a scenario to simulate.", "citations": []}

    # ~1000-char chunks (~250 tokens) sit just under the embedding model's
    # 256-token limit, so each chunk is embedded in full — no truncation, which
    # keeps retrieval accurate even for a 3–5 page document. Offsets ride along
    # so retrieved chunks map back to their exact place in the document.
    indexed_chunks = chunk_text_with_offsets(document_text, 1000, 150)

    if not indexed_chunks:
        return {"answer": "Document appears to be empty or unreadable.", "citations": []}

    try:
        # Never ask for more neighbours than we have chunks (avoids edge errors
        # on short docs), but cap at 6 to keep the LLM context focused.
        k = min(6, len(indexed_chunks))

        # HyDE: draft a hypothetical contract passage that would answer the
        # scenario and embed that alongside the raw scenario. The clause-style
        # wording sits closer to real contract text in embedding space, so
        # retrieval finds the right chunks more often than embedding the short
        # scenario alone. Runs on a dedicated Groq key (separate rate limit);
        # if generation fails we fall back to embedding just the scenario.
        try:
            hypothetical = await generate_hypothetical_document(scenario)
            search_query = f"{scenario}\n\n{hypothetical}"
        except Exception as e:
            logger.warning("HyDE generation failed, embedding raw scenario: %s", e)
            search_query = scenario

        relevant_chunks = await asyncio.to_thread(
            _run_vector_search, indexed_chunks, search_query, k
        )

        if not relevant_chunks:
            return {
                "answer": (
                    "Could not find any information in the document relevant to your scenario. "
                    "Please try rephrasing your question or check if the topic is covered in the "
                    "contract."
                ),
                "citations": [],
            }

        return await _answer_with_citations(scenario, relevant_chunks, user_id)

    except Exception as e:
        logger.warning(
            "simulate_impact vector search failed, falling back to keyword matching: %s", e
        )
        # Fallback to simple keyword matching if vector search fails. Offsets are
        # preserved so citations still jump to the right place.
        scenario_lower = scenario.lower()
        relevant = [
            c
            for c in indexed_chunks
            if any(word in c["text"].lower() for word in scenario_lower.split())
        ]

        if not relevant:
            relevant = indexed_chunks[:6]  # Take first 6 chunks as fallback

        return await _answer_with_citations(scenario, relevant[:6], user_id)
