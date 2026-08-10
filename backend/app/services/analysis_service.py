import asyncio
import json
import logging
import re
from collections.abc import Callable
from typing import Any

from langsmith import traceable

from app.services import vector_store
from app.services.embeddings_service import embed_query, embed_texts
from app.services.groq_service import chat_complete, generate_hypothetical_document
from app.services.pdf_processing import (
    chunk_text,
    chunk_text_with_offsets,
    convert_pdf_to_markdown,
)

logger = logging.getLogger(__name__)


class ClauseExtractionError(RuntimeError):
    """The pipeline ran but produced nothing usable.

    Subclasses ``RuntimeError`` so existing handlers still catch it, and exists
    so a route can tell "this message was written for the user" apart from an
    arbitrary internal ``RuntimeError`` (a missing API key, say) whose text must
    never reach a client.
    """


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

    Fails **closed**: an unreadable verdict is treated as "not a legal document".
    See the comment at the return for why.
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
    if isinstance(parsed, dict) and "isLegal" in parsed:
        return bool(parsed["isLegal"])

    # Fail closed. This used to default to True, which meant an unreadable
    # one-word verdict admitted arbitrary text to the full pipeline — hundreds of
    # chunk completions, all billed, for input we never established was a
    # contract. Failing closed costs the user one cheap retry of a call that is
    # asked for nothing but `{"isLegal": true}` and whose response is also mined
    # for an embedded JSON span, so an unparseable answer is genuinely rare.
    logger.warning(
        "Legal-document validation returned unparseable output; treating as "
        "not-a-legal-document. preview=%r",
        (output or "")[:200],
    )
    return False


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
            raise ClauseExtractionError(
                "The AI model returned output in an unexpected format, so clauses could not be parsed. "
                "Please retry, switch model, or contact support if this persists."
            )
        raise ClauseExtractionError(
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


# ───── Retrieval (shared by every question-answering path) ─────


async def retrieve_relevant_chunks(
    document_text: str,
    query: str,
    *,
    analysis_id: str | None,
    user_id: str | None,
    k: int = 6,
    use_hyde: bool = True,
) -> list[dict]:
    """Find the ``k`` passages of ``document_text`` most relevant to ``query``.

    When ``analysis_id`` and ``user_id`` are known the document's embeddings are
    persisted and reused across questions; otherwise the search still works but
    has to embed the document on the spot (the path legacy CLI callers take,
    since they send raw text with no analysis to key an index on).

    Degrades rather than fails: HyDE failure falls back to embedding the raw
    query, and a retrieval failure falls back to keyword matching. Both keep
    character offsets intact so citations still point at the right passage.
    """
    search_query = query
    if use_hyde:
        # HyDE: draft a hypothetical contract passage that would answer the query
        # and embed that alongside the raw query. Clause-style wording sits closer
        # to real contract text in embedding space, so retrieval finds the right
        # passages more often than embedding a short question alone. Runs on a
        # dedicated Groq key with its own rate limit.
        try:
            hypothetical = await generate_hypothetical_document(query)
            search_query = f"{query}\n\n{hypothetical}"
        except Exception as e:
            logger.warning("HyDE generation failed, embedding the raw query: %s", e)

    if analysis_id and user_id:
        try:
            return await vector_store.search(analysis_id, user_id, document_text, search_query, k=k)
        except Exception as e:
            logger.warning("Vector search failed, falling back to keyword matching: %s", e)
            return await vector_store.keyword_fallback(document_text, query, k=k)

    # No analysis to key an index on (e.g. an ad-hoc call) — embed in-memory.
    try:
        chunks = chunk_text_with_offsets(
            document_text, vector_store.CHUNK_SIZE, vector_store.CHUNK_OVERLAP
        )
        if not chunks:
            return []
        vectors = await embed_texts([c["text"] for c in chunks])
        blob, count, dim = vector_store._pack(vectors)
        index = {"chunks": chunks, "vectors": blob, "count": count, "dim": dim}
        query_vector = await embed_query(search_query)
        return vector_store.search_index(index, query_vector, k)
    except Exception as e:
        logger.warning("Ad-hoc vector search failed, falling back to keyword matching: %s", e)
        return await vector_store.keyword_fallback(document_text, query, k=k)
