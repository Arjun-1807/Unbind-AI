"""Tests for the negotiation copilot (app.services.negotiation_service).

Pure draft parsing is tested directly; the service is exercised with the Groq
call monkeypatched so nothing hits the network (mirrors the direct-call style of
the other tests).
"""

import pytest
from pydantic import ValidationError

from app.schemas import (
    MAX_CLAUSE_CHARS,
    MAX_NEGOTIATION_TOTAL_CHARS,
    NegotiationDraftRequest,
    NegotiationPoint,
)
from app.services import negotiation_service
from app.services.negotiation_service import _parse_draft, draft_negotiation_message


class TestParseDraft:
    def test_subject_line_format(self):
        raw = (
            "Subject: Request to adjust lease\n\n"
            "Dear Landlord,\n\nPlease consider a change.\n\nBest,\nPriya"
        )
        out = _parse_draft(raw)
        assert out["subject"] == "Request to adjust lease"
        assert out["body"].startswith("Dear Landlord,")
        assert "Subject:" not in out["body"]

    def test_empty_subject_for_message(self):
        raw = "Subject:\n\nHi, can we tweak a couple of things in the contract?"
        out = _parse_draft(raw)
        assert out["subject"] == ""
        assert out["body"].startswith("Hi, can we")

    def test_strips_code_fences(self):
        raw = "```\nSubject: Hello\n\nBody here\n```"
        out = _parse_draft(raw)
        assert out["subject"] == "Hello"
        assert out["body"] == "Body here"

    def test_valid_json_fallback(self):
        raw = '{"subject": "Hi", "body": "One line body"}'
        out = _parse_draft(raw)
        assert out["subject"] == "Hi"
        assert out["body"] == "One line body"

    def test_malformed_json_with_newlines_is_recovered(self):
        # Unescaped newlines inside the body make this invalid JSON; the regex
        # fallback should still recover clean prose instead of leaking braces.
        raw = (
            '{\n"subject": "Adjustments",\n'
            '"body": "Dear Landlord,\nPlease change clause 2.\nThanks"\n}'
        )
        out = _parse_draft(raw)
        assert out["subject"] == "Adjustments"
        assert "Dear Landlord," in out["body"]
        assert not out["body"].lstrip().startswith("{")

    def test_plain_text_last_resort(self):
        raw = "Just a plain message with no subject marker."
        out = _parse_draft(raw)
        assert out["subject"] == ""
        assert out["body"] == raw


async def test_empty_points_short_circuits(monkeypatch):
    called = False

    async def _fake_complete(messages, temperature=0.4):
        nonlocal called
        called = True
        return "Subject: x\n\ny"

    monkeypatch.setattr(negotiation_service, "negotiation_complete", _fake_complete)
    out = await draft_negotiation_message(
        NegotiationDraftRequest(points=[], tone="polite", format="email")
    )
    assert out == {"subject": "", "body": ""}
    assert called is False  # never call the model when there is nothing to draft


# ── Aggregate size cap ───────────────────────────────────────────────────────
#
# The per-field caps multiply: 50 points x 4 x 20k chars is ~4M characters in
# one request, which the drafter would concatenate into a single prompt.


class TestAggregateCap:
    def test_many_max_size_points_are_rejected(self):
        """The old worst case: individually legal points, collectively absurd."""
        point = NegotiationPoint(
            clauseText="x" * MAX_CLAUSE_CHARS,
            concern="y" * MAX_CLAUSE_CHARS,
            request="z" * MAX_CLAUSE_CHARS,
            desiredRewrite="w" * MAX_CLAUSE_CHARS,
        )
        with pytest.raises(ValidationError) as exc:
            NegotiationDraftRequest(points=[point] * 50)
        assert "exceeds" in str(exc.value)

    def test_just_over_the_cap_is_rejected(self):
        with pytest.raises(ValidationError):
            NegotiationDraftRequest(
                points=[
                    NegotiationPoint(clauseText="a" * MAX_CLAUSE_CHARS)
                    for _ in range(MAX_NEGOTIATION_TOTAL_CHARS // MAX_CLAUSE_CHARS + 1)
                ]
            )

    def test_realistic_request_still_passes(self):
        req = NegotiationDraftRequest(
            points=[
                NegotiationPoint(
                    clauseText="The tenant forfeits the deposit on early exit.",
                    concern="Disproportionate.",
                    request="Pro-rate the forfeiture.",
                )
                for _ in range(10)
            ]
        )
        assert len(req.points) == 10

    def test_exactly_at_the_cap_is_allowed(self):
        req = NegotiationDraftRequest(
            points=[
                NegotiationPoint(clauseText="a" * MAX_CLAUSE_CHARS)
                for _ in range(MAX_NEGOTIATION_TOTAL_CHARS // MAX_CLAUSE_CHARS)
            ]
        )
        assert req.points


async def test_service_truncates_oversized_points_defensively(monkeypatch):
    """Internal callers bypass FastAPI validation, so the service caps too."""
    captured = {}

    async def _fake_complete(messages, temperature=0.4):
        captured["messages"] = messages
        return "Subject: x\n\nbody"

    monkeypatch.setattr(negotiation_service, "negotiation_complete", _fake_complete)

    # Built without running the validator, the way an internal caller
    # assembling the model field-by-field could.
    req = NegotiationDraftRequest.model_construct(
        points=[NegotiationPoint(clauseText="a" * MAX_CLAUSE_CHARS) for _ in range(50)],
        tone="polite",
        format="email",
        counterparty="",
        senderName="",
    )
    await draft_negotiation_message(req)
    user_msg = captured["messages"][-1]["content"]
    assert len(user_msg) < 2 * MAX_NEGOTIATION_TOTAL_CHARS


async def test_draft_builds_prompt_and_parses(monkeypatch):
    captured = {}

    async def _fake_complete(messages, temperature=0.4):
        captured["messages"] = messages
        return "Subject: Lease changes\n\nDear Landlord,\n\n1. Reduce the fee.\n\nBest,\nSam"

    monkeypatch.setattr(negotiation_service, "negotiation_complete", _fake_complete)
    req = NegotiationDraftRequest(
        points=[
            NegotiationPoint(
                clauseText="Early termination costs two months' rent.",
                concern="Too steep.",
                request="Reduce to one month.",
                desiredRewrite="One month's rent.",
            ),
        ],
        tone="firm",
        format="email",
        counterparty="Landlord",
        senderName="Sam",
    )
    out = await draft_negotiation_message(req)
    assert out["subject"] == "Lease changes"
    assert out["body"].startswith("Dear Landlord,")
    # The user prompt should carry the clause text, recipient, and sign-off name.
    user_msg = captured["messages"][-1]["content"]
    assert "Early termination costs two months' rent." in user_msg
    assert "Landlord" in user_msg
    assert 'Sign off as "Sam".' in user_msg


async def test_blank_clause_points_are_dropped(monkeypatch):
    async def _fake_complete(messages, temperature=0.4):
        return "Subject:\n\nbody"

    monkeypatch.setattr(negotiation_service, "negotiation_complete", _fake_complete)
    # Only whitespace clauseText -> treated as no usable points.
    out = await draft_negotiation_message(
        NegotiationDraftRequest(
            points=[NegotiationPoint(clauseText="   ")],
            tone="polite",
            format="message",
        )
    )
    assert out == {"subject": "", "body": ""}
