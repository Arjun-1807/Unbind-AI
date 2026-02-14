"""
Contract analysis service – full port of analysisService.ts
"""

import json
import asyncio
from typing import Any, Callable, Optional
from app.services.groq_service import chat_complete, embed_texts
from app.services.pdf_processing import chunk_text, convert_pdf_to_markdown


# ───── Helpers ─────

def _try_parse_json(text: str) -> Any | None:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.lstrip("`").lstrip("json").lstrip("`")
    if cleaned.endswith("```"):
        cleaned = cleaned.rstrip("`")
    cleaned = cleaned.strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        return None


# ───── Chunk analysis ─────

async def _analyze_chunk(chunk: str, role: str) -> list[dict]:
    role_instruction = f"The user's role is: {role}. Analyze ALL content in this chunk from their perspective."
    output = await chat_complete([
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
    ])
    parsed = _try_parse_json(output)
    if parsed and isinstance(parsed, dict):
        return parsed.get("clauses", [])
    return []


# ───── Report synthesis ─────

async def _synthesize_report(clauses: list[dict], role: str) -> dict:
    role_instruction = f"The user's role is: {role}. Generate a comprehensive summary and extract all relevant information from their perspective."
    clause_context = "\n".join(
        f'Clause {i+1}:\n- Text: "{c.get("clauseText", "")}"\n- Explanation: "{c.get("simplifiedExplanation", "")}"\n- Risk: {c.get("riskLevel", "")}\n- Risk Reason: "{c.get("riskReason", "")}"\n'
        for i, c in enumerate(clauses)
    )
    output = await chat_complete([
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
    ])
    parsed = _try_parse_json(output)
    if not parsed:
        raise RuntimeError("Failed to parse synthesis JSON")
    if "chunkSummaries" not in parsed:
        parsed["chunkSummaries"] = []
    return parsed


# ───── Chunk summaries ─────

async def _create_chunk_summaries(
    chunks: list[str], clauses: list[dict], role: str
) -> list[dict]:
    summaries: list[dict] = []
    per_chunk = len(clauses) // len(chunks) + (1 if len(clauses) % len(chunks) else 0) if chunks else len(clauses)
    for i, chunk in enumerate(chunks):
        start = i * per_chunk
        end = min(start + per_chunk, len(clauses))
        chunk_clauses = clauses[start:end]
        clause_ctx = "\n".join(
            f'- {c.get("clauseText", "")[:100]}... (Risk: {c.get("riskLevel", "")})'
            for c in chunk_clauses
        )
        output = await chat_complete([
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
                    f"CHUNK {i+1} CONTENT:\n{chunk[:500]}...\n\n"
                    f"CLAUSES IN THIS CHUNK:\n{clause_ctx}\n\n"
                    "Provide a simple summary of what this chunk covers."
                ),
            },
        ])
        summaries.append({"chunkIndex": i + 1, "summary": output.strip()})
    return summaries


# ───── Public: analyse contract ─────

async def analyze_contract(
    document_text: str,
    role: str,
    on_progress: Optional[Callable[[str], None]] = None,
) -> dict:
    """Full contract analysis pipeline – mirrors analyzeContract in analysisService.ts."""

    def progress(msg: str) -> None:
        if on_progress:
            on_progress(msg)

    progress("Converting document to Markdown for better parsing...")
    markdown_text = convert_pdf_to_markdown(document_text)

    progress("Chunking document...")
    chunks = chunk_text(markdown_text)

    progress(f"Analyzing {len(chunks)} document section(s)...")
    chunk_results = await asyncio.gather(
        *[_analyze_chunk(chunk, role) for chunk in chunks]
    )
    all_clauses: list[dict] = []
    for result in chunk_results:
        all_clauses.extend(result)

    if not all_clauses:
        raise RuntimeError(
            "No legal clauses were identified in the document. "
            "It might be too short or in an unsupported format."
        )

    progress("Creating chunk summaries...")
    chunk_summaries = await _create_chunk_summaries(chunks, all_clauses, role)

    progress("Synthesizing final report...")
    final_report = await _synthesize_report(all_clauses, role)

    return {
        **final_report,
        "clauses": all_clauses,
        "chunkSummaries": chunk_summaries,
    }


# ───── Impact simulator with LangChain Chroma ─────

class GroqEmbeddingFunction:
    """Custom embedding function for Chroma using Groq API."""
    
    def __call__(self, input: list[str]) -> list[list[float]]:
        # Synchronous wrapper for async embed_texts
        import asyncio
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # If already in async context, use run_coroutine_threadsafe
            import concurrent.futures
            future = asyncio.run_coroutine_threadsafe(embed_texts(input), loop)
            return future.result()
        else:
            return loop.run_until_complete(embed_texts(input))


async def simulate_impact(document_text: str, scenario: str) -> str:
    """Vector-based impact simulation using LangChain Chroma."""
    if not scenario.strip():
        return "Please enter a scenario to simulate."
    
    # Chunk the document
    chunks = chunk_text(document_text, 1500, 200)
    
    if not chunks:
        return "Document appears to be empty or unreadable."
    
    try:
        # Create Chroma vector store with Groq embeddings
        from langchain_community.vectorstores import Chroma
        from langchain.schema import Document
        import chromadb
        
        # Create documents from chunks
        documents = [Document(page_content=chunk) for chunk in chunks]
        
        # Create ephemeral Chroma client for this request
        chroma_client = chromadb.EphemeralClient()
        
        # Create vector store with custom Groq embedding function
        embedding_function = GroqEmbeddingFunction()
        vectorstore = Chroma.from_documents(
            documents=documents,
            embedding=embedding_function,
            client=chroma_client,
            collection_name="contract_analysis"
        )
        
        # Perform similarity search
        relevant_docs = vectorstore.similarity_search(scenario, k=6)
        relevant_chunks = [doc.page_content for doc in relevant_docs]
        
        if not relevant_chunks:
            return (
                "Could not find any information in the document relevant to your scenario. "
                "Please try rephrasing your question or check if the topic is covered in the contract."
            )
        
        context = "\n\n---\n\n".join(relevant_chunks)
        output = await chat_complete(
            [
                {
                    "role": "system",
                    "content": (
                        "You help people with below-average literacy. Answer simply in plain words. "
                        'Use up to 5 bullet points, each 1–2 short sentences, no jargon. '
                        'If helpful, include 1 tiny example starting with "Example:".'
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Scenario: {scenario}\n\nContract Excerpts:\n{context}\n\n"
                        "Write the answer in very simple words. Keep it under 300 words."
                    ),
                },
            ],
            model="llama-3.3-70b-versatile",
            temperature=0.2,
        )
        return output
        
    except Exception as e:
        # Fallback to simple keyword matching if vector search fails
        scenario_lower = scenario.lower()
        relevant = [c for c in chunks if any(word in c.lower() for word in scenario_lower.split())]
        
        if not relevant:
            relevant = chunks[:6]  # Take first 6 chunks as fallback
        
        context = "\n\n---\n\n".join(relevant[:6])
        output = await chat_complete(
            [
                {
                    "role": "system",
                    "content": (
                        "You help people with below-average literacy. Answer simply in plain words. "
                        'Use up to 5 bullet points, each 1–2 short sentences, no jargon. '
                        'If helpful, include 1 tiny example starting with "Example:".'
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Scenario: {scenario}\n\nContract Excerpts:\n{context}\n\n"
                        "Write the answer in very simple words. Keep it under 300 words."
                    ),
                },
            ],
            model="llama-3.3-70b-versatile",
            temperature=0.2,
        )
        return output
