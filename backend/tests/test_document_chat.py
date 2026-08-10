"""Tests for full-document Q&A: the service, persistence, and the routes.

Retrieval and the LLM are both stubbed. What's under test is the conversation
plumbing, the citation contract, and the tenancy boundary — not answer quality.
"""

import pytest
from bson import ObjectId
from fastapi import HTTPException

from app import auth
from app.routes import analysis_routes
from app.services import document_chat_service
from app.services.document_chat_service import (
    _build_citations,
    _citation_preview,
    _history_messages,
    answer_question,
    answer_standalone,
    clear_conversation,
    get_conversation,
)

DOC = "Tenant shall give thirty days written notice before vacating the premises."


class _Req:
    def __init__(self, cookies=None, headers=None):
        self.cookies = cookies or {}
        self.headers = headers or {}


def _authed(settings, user_id: str) -> _Req:
    return _Req(cookies={settings.COOKIE_NAME: auth.create_access_token(user_id)})


def _seed_analysis(db, user_id: str, text: str = DOC) -> str:
    _id = ObjectId()
    db.analyses._docs[str(_id)] = {
        "_id": _id,
        "userId": user_id,
        "fileName": "lease.pdf",
        "analysisDate": "2026-01-01",
        "analysisResult": {"summary": "s", "clauses": []},
        "documentText": text,
    }
    return str(_id)


@pytest.fixture
def stub_pipeline(monkeypatch):
    """Stub retrieval + the LLM. Records what the model was asked."""
    state = {"prompts": [], "chunks": [{"text": DOC, "start": 0, "end": len(DOC)}]}

    async def fake_retrieve(document_text, query, **kwargs):
        state["last_query"] = query
        return state["chunks"]

    async def fake_chat(messages, **kwargs):
        state["prompts"].append(messages)
        return "You must give 30 days notice [S1]."

    monkeypatch.setattr(document_chat_service, "retrieve_relevant_chunks", fake_retrieve)
    monkeypatch.setattr(document_chat_service, "chat_complete", fake_chat)
    return state


# ── Citation helpers ─────────────────────────────────────────────────────────


def test_citation_preview_collapses_whitespace():
    assert _citation_preview("a\n\n  b\tc") == "a b c"


def test_citation_preview_truncates_with_an_ellipsis():
    out = _citation_preview("x" * 500, limit=20)
    assert len(out) == 20
    assert out.endswith("…")


def test_build_citations_numbers_from_one_and_keeps_offsets():
    citations = _build_citations(
        [{"text": "first", "start": 0, "end": 5}, {"text": "second", "start": 9, "end": 15}]
    )
    assert [c["id"] for c in citations] == [1, 2]
    assert citations[1]["startIndex"] == 9
    assert citations[1]["endIndex"] == 15


def test_build_citations_marks_unlocatable_chunks():
    """start = -1 must survive so the UI renders the chip as inert."""
    citations = _build_citations([{"text": "orphan"}])
    assert citations[0]["startIndex"] == -1


# ── History shaping ──────────────────────────────────────────────────────────


def test_history_messages_keeps_roles_and_drops_citations():
    stored = [
        {"role": "user", "content": "q1"},
        {"role": "assistant", "content": "a1", "citations": [{"id": 1}]},
    ]
    assert _history_messages(stored) == [
        {"role": "user", "content": "q1"},
        {"role": "assistant", "content": "a1"},
    ]


def test_history_messages_is_capped():
    stored = [{"role": "user", "content": f"q{i}"} for i in range(100)]
    assert len(_history_messages(stored)) == document_chat_service.HISTORY_TURNS * 2


def test_history_messages_skips_empty_and_unknown_roles():
    stored = [
        {"role": "user", "content": ""},
        {"role": "system", "content": "injected"},
        {"role": "user", "content": "real"},
    ]
    assert _history_messages(stored) == [{"role": "user", "content": "real"}]


# ── Answering ────────────────────────────────────────────────────────────────


async def test_answer_returns_answer_and_citations(fake_db, stub_pipeline):
    result = await answer_question("a1", "u1", DOC, "How much notice must I give?")

    assert "[S1]" in result["answer"]
    assert len(result["citations"]) == 1
    assert result["citations"][0]["startIndex"] == 0


async def test_answer_persists_the_turn(fake_db, stub_pipeline):
    await answer_question("a1", "u1", DOC, "How much notice?")
    stored = await get_conversation("a1", "u1")

    assert [m["role"] for m in stored] == ["user", "assistant"]
    assert stored[0]["content"] == "How much notice?"
    assert stored[1]["citations"][0]["id"] == 1


async def test_conversation_accumulates_across_turns(fake_db, stub_pipeline):
    await answer_question("a1", "u1", DOC, "first?")
    await answer_question("a1", "u1", DOC, "second?")

    stored = await get_conversation("a1", "u1")
    assert [m["content"] for m in stored if m["role"] == "user"] == ["first?", "second?"]


async def test_prior_turns_are_replayed_to_the_model(fake_db, stub_pipeline):
    """Without this, every follow-up reads as a fresh first question."""
    await answer_question("a1", "u1", DOC, "What is the notice period?")
    await answer_question("a1", "u1", DOC, "And if I'm late?")

    last_prompt = stub_pipeline["prompts"][-1]
    replayed = [m["content"] for m in last_prompt if m["role"] == "assistant"]
    assert replayed, "the previous answer was not replayed"
    assert any("What is the notice period?" in m["content"] for m in last_prompt)


async def test_followup_retrieval_includes_the_previous_question(fake_db, stub_pipeline):
    """A bare follow-up embeds poorly alone, so it's expanded with context."""
    await answer_question("a1", "u1", DOC, "What is the notice period?")
    await answer_question("a1", "u1", DOC, "and for pets?")

    assert "notice period" in stub_pipeline["last_query"]
    assert "pets" in stub_pipeline["last_query"]


async def test_excerpts_are_labelled_for_the_model(fake_db, stub_pipeline):
    stub_pipeline["chunks"] = [
        {"text": "first clause", "start": 0, "end": 12},
        {"text": "second clause", "start": 20, "end": 33},
    ]
    await answer_question("a1", "u1", DOC, "anything?")

    prompt = stub_pipeline["prompts"][-1][-1]["content"]
    assert "[S1] first clause" in prompt
    assert "[S2] second clause" in prompt


async def test_persist_false_writes_nothing(fake_db, stub_pipeline):
    await answer_question("a1", "u1", DOC, "How much notice?", persist=False)
    assert await get_conversation("a1", "u1") == []


async def test_no_retrieval_hits_gives_an_honest_answer(fake_db, stub_pipeline):
    """Silence in the document must not be answered from general knowledge."""
    stub_pipeline["chunks"] = []
    result = await answer_question("a1", "u1", DOC, "Does this cover parking?")

    assert result["citations"] == []
    assert "couldn't find" in result["answer"].lower()
    # The LLM should never have been asked.
    assert stub_pipeline["prompts"] == []


async def test_blank_question_is_rejected_without_calling_the_model(fake_db, stub_pipeline):
    result = await answer_question("a1", "u1", DOC, "   ")
    assert result["citations"] == []
    assert stub_pipeline["prompts"] == []


async def test_empty_document_is_reported_not_answered(fake_db, stub_pipeline):
    result = await answer_question("a1", "u1", "  ", "anything?")
    assert result["citations"] == []
    assert stub_pipeline["prompts"] == []


async def test_conversations_are_scoped_per_analysis(fake_db, stub_pipeline):
    await answer_question("a1", "u1", DOC, "about a1")
    await answer_question("a2", "u1", DOC, "about a2")

    a1 = [m["content"] for m in await get_conversation("a1", "u1") if m["role"] == "user"]
    a2 = [m["content"] for m in await get_conversation("a2", "u1") if m["role"] == "user"]
    assert a1 == ["about a1"]
    assert a2 == ["about a2"]


async def test_conversations_are_scoped_per_user(fake_db, stub_pipeline):
    await answer_question("a1", "owner", DOC, "private question")
    assert await get_conversation("a1", "intruder") == []


async def test_clear_conversation_empties_it(fake_db, stub_pipeline):
    await answer_question("a1", "u1", DOC, "q?")
    await clear_conversation("a1", "u1")
    assert await get_conversation("a1", "u1") == []


async def test_stored_history_is_capped(fake_db, stub_pipeline, monkeypatch):
    monkeypatch.setattr(document_chat_service, "MAX_STORED_MESSAGES", 4)
    for i in range(5):
        await answer_question("a1", "u1", DOC, f"q{i}")

    stored = await get_conversation("a1", "u1")
    assert len(stored) == 4
    # The oldest turns are dropped, the newest kept.
    assert stored[0]["content"] == "q3"


# ── Routes ───────────────────────────────────────────────────────────────────


async def test_chat_route_answers_and_charges_a_query(override_settings, seed_user, stub_pipeline):
    user = seed_user(plan=None)
    uid = str(user["_id"])
    analysis_id = _seed_analysis(seed_user.db, uid)

    from app.schemas import DocumentQuestionRequest

    result = await analysis_routes.ask_document(
        analysis_id,
        DocumentQuestionRequest(question="How much notice?"),
        _authed(override_settings, uid),
    )

    assert "[S1]" in result["answer"]
    assert seed_user.db.users._docs[uid]["dailyQueryCount"] == 1


async def test_chat_route_rejects_another_users_analysis(
    override_settings, seed_user, stub_pipeline
):
    user = seed_user()
    uid = str(user["_id"])
    victim = _seed_analysis(seed_user.db, str(ObjectId()), text="someone else's contract")

    from app.schemas import DocumentQuestionRequest

    with pytest.raises(HTTPException) as exc:
        await analysis_routes.ask_document(
            victim,
            DocumentQuestionRequest(question="what does it say?"),
            _authed(override_settings, uid),
        )
    assert exc.value.status_code == 404
    # No quota consumed for a request that was refused.
    assert seed_user.db.users._docs[uid].get("dailyQueryCount") is None


async def test_chat_route_refunds_the_quota_when_the_upstream_is_down(
    override_settings, seed_user, monkeypatch
):
    """An outage on our side must not cost the user a query."""
    import httpx

    user = seed_user(plan=None)
    uid = str(user["_id"])
    analysis_id = _seed_analysis(seed_user.db, uid)

    async def boom(*args, **kwargs):
        raise httpx.ConnectTimeout("groq unreachable")

    monkeypatch.setattr(document_chat_service, "answer_question", boom)

    from app.schemas import DocumentQuestionRequest

    with pytest.raises(httpx.ConnectTimeout):
        await analysis_routes.ask_document(
            analysis_id,
            DocumentQuestionRequest(question="How much notice?"),
            _authed(override_settings, uid),
        )
    assert seed_user.db.users._docs[uid]["dailyQueryCount"] == 0
    # The attempt, however, is never handed back — that is what bounds a loop.
    assert seed_user.db.users._docs[uid]["dailyQueryAttemptCount"] == 1


async def test_chat_route_keeps_the_quota_when_the_failure_came_after_the_llm_ran(
    override_settings, seed_user, monkeypatch
):
    """A failure we can't attribute to an outage is assumed to have been billed.

    Refunding indiscriminately is what made a failure loop free: the counter
    returned to where it started, so the gate never closed.
    """
    user = seed_user(plan=None)
    uid = str(user["_id"])
    analysis_id = _seed_analysis(seed_user.db, uid)

    async def boom(*args, **kwargs):
        raise RuntimeError("model returned something unusable")

    monkeypatch.setattr(document_chat_service, "answer_question", boom)

    from app.schemas import DocumentQuestionRequest

    with pytest.raises(RuntimeError):
        await analysis_routes.ask_document(
            analysis_id,
            DocumentQuestionRequest(question="How much notice?"),
            _authed(override_settings, uid),
        )
    assert seed_user.db.users._docs[uid]["dailyQueryCount"] == 1


async def test_chat_route_enforces_the_query_quota(override_settings, seed_user, stub_pipeline):
    user = seed_user(plan=None, dailyQueryCount=10, lastQueryDate=None)
    uid = str(user["_id"])
    analysis_id = _seed_analysis(seed_user.db, uid)
    # Stamp today's date so the counter isn't treated as stale.
    from app.services.quota_service import _today

    seed_user.db.users._docs[uid]["lastQueryDate"] = _today()

    from app.schemas import DocumentQuestionRequest

    with pytest.raises(HTTPException) as exc:
        await analysis_routes.ask_document(
            analysis_id,
            DocumentQuestionRequest(question="How much notice?"),
            _authed(override_settings, uid),
        )
    assert exc.value.status_code == 429


async def test_get_chat_route_returns_serialised_history(
    override_settings, seed_user, stub_pipeline
):
    user = seed_user()
    uid = str(user["_id"])
    analysis_id = _seed_analysis(seed_user.db, uid)
    await answer_question(analysis_id, uid, DOC, "How much notice?")

    history = await analysis_routes.get_document_chat(analysis_id, _authed(override_settings, uid))

    assert [m["role"] for m in history] == ["user", "assistant"]
    # createdAt is serialised to a string, not left as a datetime.
    assert isinstance(history[0]["createdAt"], str)


async def test_get_chat_route_denies_another_users_analysis(override_settings, seed_user):
    user = seed_user()
    uid = str(user["_id"])
    victim = _seed_analysis(seed_user.db, str(ObjectId()))

    with pytest.raises(HTTPException) as exc:
        await analysis_routes.get_document_chat(victim, _authed(override_settings, uid))
    assert exc.value.status_code == 404


async def test_clear_chat_route(override_settings, seed_user, stub_pipeline):
    user = seed_user()
    uid = str(user["_id"])
    analysis_id = _seed_analysis(seed_user.db, uid)
    await answer_question(analysis_id, uid, DOC, "q?")

    result = await analysis_routes.clear_document_chat(analysis_id, _authed(override_settings, uid))

    assert result == {"ok": True}
    assert await get_conversation(analysis_id, uid) == []


async def test_deleting_an_analysis_clears_its_chat_and_vectors(
    override_settings, seed_user, stub_pipeline
):
    """Deleting a document must delete what we derived from it."""
    user = seed_user()
    uid = str(user["_id"])
    analysis_id = _seed_analysis(seed_user.db, uid)
    await answer_question(analysis_id, uid, DOC, "q?")
    seed_user.db["document_vectors"]._docs["v1"] = {
        "_id": "v1",
        "analysisId": analysis_id,
        "userId": uid,
    }

    await analysis_routes.delete_analysis(analysis_id, _authed(override_settings, uid))

    assert await get_conversation(analysis_id, uid) == []
    assert seed_user.db["document_vectors"]._docs == {}


async def test_chat_route_rejects_a_malformed_analysis_id(override_settings, seed_user):
    user = seed_user()
    with pytest.raises(HTTPException) as exc:
        await analysis_routes.get_document_chat(
            "not-an-objectid", _authed(override_settings, str(user["_id"]))
        )
    assert exc.value.status_code == 400


# ── One path for both question shapes ────────────────────────────────────────
#
# Fact questions and "what if" scenarios used to be separate features with
# separate prompts. These pin down that they now share one prompt and one
# answering path, so a scenario is not treated as a second-class question.


@pytest.mark.parametrize(
    "question",
    [
        "What is the notice period?",  # fact
        "What happens if I move out early?",  # hypothetical
        "what if I pay late",  # hypothetical, no punctuation
    ],
)
async def test_both_question_shapes_use_the_same_prompt(fake_db, stub_pipeline, question):
    await answer_question("a1", "u1", DOC, question)

    system = stub_pipeline["prompts"][-1][0]
    assert system["role"] == "system"
    # The one prompt explicitly covers both shapes.
    assert "what if" in system["content"].lower()
    assert "what the contract SAYS" in system["content"]


async def test_the_prompt_warns_against_answering_hypotheticals_from_general_knowledge(
    fake_db, stub_pipeline
):
    """The failure mode for what-ifs is describing what *usually* happens."""
    await answer_question("a1", "u1", DOC, "what if I leave early?")

    system = stub_pipeline["prompts"][-1][0]["content"]
    assert "rather than what THIS contract says happens" in system


# ── Standalone answering (the CLI's path) ────────────────────────────────────


async def test_answer_standalone_returns_answer_and_citations(fake_db, stub_pipeline):
    result = await answer_standalone(DOC, "How much notice must I give?")

    assert "[S1]" in result["answer"]
    assert result["citations"][0]["startIndex"] == 0


async def test_answer_standalone_uses_the_same_prompt(fake_db, stub_pipeline):
    """The CLI must not get a divergent, staler prompt."""
    await answer_standalone(DOC, "How much notice?")
    standalone_system = stub_pipeline["prompts"][-1][0]["content"]

    await answer_question("a1", "u1", DOC, "How much notice?")
    conversational_system = stub_pipeline["prompts"][-1][0]["content"]

    assert standalone_system == conversational_system


async def test_answer_standalone_persists_nothing(fake_db, stub_pipeline):
    """A CLI caller has no conversation, and must not create one."""
    await answer_standalone(DOC, "How much notice?", analysis_id="a1", user_id="u1")
    assert await get_conversation("a1", "u1") == []


async def test_answer_standalone_sends_no_history(fake_db, stub_pipeline):
    await answer_standalone(DOC, "How much notice?")
    roles = [m["role"] for m in stub_pipeline["prompts"][-1]]
    assert roles == ["system", "user"]


async def test_answer_standalone_handles_no_retrieval_hits(fake_db, stub_pipeline):
    stub_pipeline["chunks"] = []
    result = await answer_standalone(DOC, "does this cover parking?")
    assert result["citations"] == []
    assert stub_pipeline["prompts"] == []


@pytest.mark.parametrize("bad", ["", "   "])
async def test_answer_standalone_rejects_a_blank_question(fake_db, stub_pipeline, bad):
    result = await answer_standalone(DOC, bad)
    assert result["citations"] == []
    assert stub_pipeline["prompts"] == []


async def test_answer_standalone_reports_an_empty_document(fake_db, stub_pipeline):
    result = await answer_standalone("  ", "anything?")
    assert result["citations"] == []
    assert stub_pipeline["prompts"] == []


async def test_simulate_route_keeps_its_legacy_response_shape(
    override_settings, seed_user, stub_pipeline
):
    """The published CLI reads `result`; renaming it would break installed copies."""
    from app.schemas import SimulateRequest

    user = seed_user(plan=None)
    uid = str(user["_id"])

    response = await analysis_routes.simulate(
        SimulateRequest(documentText=DOC, scenario="What if I move out early?"),
        _authed(override_settings, uid),
    )

    assert set(response) == {"result", "citations"}
    assert "[S1]" in response["result"]
    assert response["citations"][0]["id"] == 1


async def test_simulate_route_is_metered(override_settings, seed_user, stub_pipeline):
    from app.schemas import SimulateRequest

    user = seed_user(plan=None)
    uid = str(user["_id"])
    await analysis_routes.simulate(
        SimulateRequest(documentText=DOC, scenario="anything?"),
        _authed(override_settings, uid),
    )
    assert seed_user.db.users._docs[uid]["dailyQueryCount"] == 1
