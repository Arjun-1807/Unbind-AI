from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, SystemMessage
from app.config import get_settings
import httpx


def _get_api_key() -> str:
    key = get_settings().GROQ_API_KEY
    if not key:
        raise RuntimeError("GROQ_API_KEY is not set")
    return key


async def chat_complete(
    messages: list[dict],
    model: str = "llama-3.3-70b-versatile",
    temperature: float = 0.2,
) -> str:
    """Chat completion using LangChain's ChatGroq."""
    api_key = _get_api_key()
    llm = ChatGroq(
        model=model,
        temperature=temperature,
        api_key=api_key,
    )
    
    # Convert dict messages to LangChain message objects
    lc_messages = []
    for msg in messages:
        if msg["role"] == "system":
            lc_messages.append(SystemMessage(content=msg["content"]))
        elif msg["role"] == "user":
            lc_messages.append(HumanMessage(content=msg["content"]))
    
    # Invoke the model
    response = await llm.ainvoke(lc_messages)
    return response.content


async def embed_texts(
    texts: list[str],
    model: str = "text-embedding-3-small",
) -> list[list[float]]:
    """Text embedding via direct API (Groq doesn't have embeddings in LangChain yet)."""
    if not texts:
        return []
    api_key = _get_api_key()
    
    # Use direct API as Groq embeddings not yet in langchain-groq
    EMBEDDINGS_ENDPOINT = "https://api.groq.com/openai/v1/embeddings"
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            EMBEDDINGS_ENDPOINT,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={"model": model, "input": texts},
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Groq embeddings failed: {resp.status_code} {resp.text}")
        data = resp.json()
        return [d["embedding"] for d in data.get("data", [])]
