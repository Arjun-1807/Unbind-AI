"""Tests for the analysis history routes and the lawyer-directory paywall.

Same direct-call style as the other suites: handlers are awaited with a tiny
fake Request, no server and no network.

The tenancy checks here are the important ones — nothing previously verified
that one user cannot read or delete another user's analyses.
"""

import io
from datetime import datetime, timedelta, timezone

import pytest
from bson import ObjectId
from fastapi import HTTPException

from app import auth
from app.routes import analysis_routes, lawyer_routes


class _ReqWithCookiesHeaders:
    def __init__(self, cookies=None, headers=None):
        self.cookies = cookies or {}
        self.headers = headers or {}


class _FakeUpload:
    """Just enough of Starlette's UploadFile for the size-capped read."""

    def __init__(self, content: bytes, filename="contract.pdf", content_type="application/pdf"):
        self.filename = filename
        self.content_type = content_type
        self._stream = io.BytesIO(content)
        self.bytes_read = 0

    async def read(self, size: int = -1) -> bytes:
        block = self._stream.read(size)
        self.bytes_read += len(block)
        return block


def _authed_request(settings, user_id: str) -> _ReqWithCookiesHeaders:
    return _ReqWithCookiesHeaders(cookies={settings.COOKIE_NAME: auth.create_access_token(user_id)})


def _seed_analysis(db, user_id: str, *, file_name="contract.pdf", date="2026-01-01", text="body"):
    _id = ObjectId()
    db.analyses._docs[str(_id)] = {
        "_id": _id,
        "userId": user_id,
        "fileName": file_name,
        "analysisDate": date,
        "analysisResult": {"summary": "s", "clauses": []},
        "documentText": text,
    }
    return str(_id)


# ── History listing ──────────────────────────────────────────────────────────


async def test_history_omits_document_text(override_settings, seed_user):
    """The list view never renders documentText, and it dominates the payload."""
    user = seed_user()
    uid = str(user["_id"])
    _seed_analysis(seed_user.db, uid, text="a very long contract" * 1000)

    results = await analysis_routes.history(_authed_request(override_settings, uid))

    assert len(results) == 1
    assert "documentText" not in results[0]
    assert results[0]["fileName"] == "contract.pdf"


async def test_history_returns_only_the_callers_analyses(override_settings, seed_user):
    user = seed_user()
    uid = str(user["_id"])
    other = str(ObjectId())
    _seed_analysis(seed_user.db, uid, file_name="mine.pdf")
    _seed_analysis(seed_user.db, other, file_name="theirs.pdf")

    results = await analysis_routes.history(_authed_request(override_settings, uid))

    assert [r["fileName"] for r in results] == ["mine.pdf"]


async def test_history_is_newest_first_and_paginates(override_settings, seed_user):
    user = seed_user()
    uid = str(user["_id"])
    for day in ("2026-01-01", "2026-02-01", "2026-03-01"):
        _seed_analysis(seed_user.db, uid, file_name=f"{day}.pdf", date=day)

    req = _authed_request(override_settings, uid)
    page1 = await analysis_routes.history(req, limit=2, skip=0)
    page2 = await analysis_routes.history(req, limit=2, skip=2)

    assert [r["analysisDate"] for r in page1] == ["2026-03-01", "2026-02-01"]
    assert [r["analysisDate"] for r in page2] == ["2026-01-01"]


# ── Single-analysis fetch: tenancy + id validation ───────────────────────────


async def test_get_analysis_returns_full_document_text(override_settings, seed_user):
    user = seed_user()
    uid = str(user["_id"])
    analysis_id = _seed_analysis(seed_user.db, uid, text="the whole contract")

    doc = await analysis_routes.get_analysis(analysis_id, _authed_request(override_settings, uid))

    assert doc["documentText"] == "the whole contract"


async def test_cannot_read_another_users_analysis(override_settings, seed_user):
    user = seed_user()
    uid = str(user["_id"])
    victim_analysis = _seed_analysis(seed_user.db, str(ObjectId()), text="secret")

    with pytest.raises(HTTPException) as exc:
        await analysis_routes.get_analysis(victim_analysis, _authed_request(override_settings, uid))
    assert exc.value.status_code == 404


async def test_cannot_delete_another_users_analysis(override_settings, seed_user):
    user = seed_user()
    uid = str(user["_id"])
    other = str(ObjectId())
    victim_analysis = _seed_analysis(seed_user.db, other)

    with pytest.raises(HTTPException) as exc:
        await analysis_routes.delete_analysis(
            victim_analysis, _authed_request(override_settings, uid)
        )
    assert exc.value.status_code == 404
    # And it really is still there.
    assert victim_analysis in seed_user.db.analyses._docs


async def test_delete_removes_the_callers_own_analysis(override_settings, seed_user):
    user = seed_user()
    uid = str(user["_id"])
    analysis_id = _seed_analysis(seed_user.db, uid)

    result = await analysis_routes.delete_analysis(
        analysis_id, _authed_request(override_settings, uid)
    )

    assert result == {"ok": True}
    assert analysis_id not in seed_user.db.analyses._docs


@pytest.mark.parametrize("bad_id", ["not-an-objectid", "", "123"])
async def test_malformed_id_is_400_not_500(override_settings, seed_user, bad_id):
    user = seed_user()
    req = _authed_request(override_settings, str(user["_id"]))

    for handler in (analysis_routes.get_analysis, analysis_routes.delete_analysis):
        with pytest.raises(HTTPException) as exc:
            await handler(bad_id, req)
        assert exc.value.status_code == 400


async def test_missing_analysis_is_404(override_settings, seed_user):
    user = seed_user()
    uid = str(user["_id"])
    with pytest.raises(HTTPException) as exc:
        await analysis_routes.get_analysis(str(ObjectId()), _authed_request(override_settings, uid))
    assert exc.value.status_code == 404


# ── Upload size guard ────────────────────────────────────────────────────────
#
# The cap is enforced *during* the read, not on the length of bytes already
# buffered — that was the bug: len() of a fully-materialised body enforces
# nothing, so the "limit" only ever measured RAM that had already been spent.


async def test_oversized_document_is_rejected():
    upload = _FakeUpload(b"x" * (analysis_routes._MAX_DOCUMENT_BYTES + 1))
    with pytest.raises(HTTPException) as exc:
        await analysis_routes._read_upload_within_limit(
            _ReqWithCookiesHeaders(), upload, is_image=False
        )
    assert exc.value.status_code == 413
    assert exc.value.detail == "FILE_TOO_LARGE"


async def test_oversized_image_is_rejected():
    upload = _FakeUpload(b"x" * (analysis_routes._MAX_IMAGE_BYTES + 1), "photo.png", "image/png")
    with pytest.raises(HTTPException) as exc:
        await analysis_routes._read_upload_within_limit(
            _ReqWithCookiesHeaders(), upload, is_image=True
        )
    assert exc.value.status_code == 413
    assert exc.value.detail == "IMAGE_TOO_LARGE"


async def test_oversized_upload_is_abandoned_without_reading_it_all():
    """The point of the fix: a huge body must never be fully materialised."""
    limit = analysis_routes._MAX_DOCUMENT_BYTES
    upload = _FakeUpload(b"x" * (limit * 4))

    with pytest.raises(HTTPException):
        await analysis_routes._read_upload_within_limit(
            _ReqWithCookiesHeaders(), upload, is_image=False
        )

    # At most one block past the cap was ever touched.
    assert upload.bytes_read <= limit + analysis_routes._UPLOAD_BLOCK_BYTES


async def test_content_length_over_the_cap_short_circuits_before_any_read():
    upload = _FakeUpload(b"x" * 32)
    request = _ReqWithCookiesHeaders(
        headers={"content-length": str(analysis_routes._MAX_DOCUMENT_BYTES + 1)}
    )
    with pytest.raises(HTTPException) as exc:
        await analysis_routes._read_upload_within_limit(request, upload, is_image=False)
    assert exc.value.status_code == 413
    assert upload.bytes_read == 0


async def test_oversize_rejection_is_refundable():
    """A 413 costs no LLM tokens, so it must not consume the user's quota."""
    upload = _FakeUpload(b"x" * (analysis_routes._MAX_DOCUMENT_BYTES + 1))
    with pytest.raises(HTTPException) as exc:
        await analysis_routes._read_upload_within_limit(
            _ReqWithCookiesHeaders(), upload, is_image=False
        )
    assert analysis_routes._should_refund(exc.value) is True


async def test_multi_block_upload_under_the_cap_is_returned_intact():
    payload = b"abc" * (analysis_routes._UPLOAD_BLOCK_BYTES // 2)  # spans blocks
    upload = _FakeUpload(payload)
    content = await analysis_routes._read_upload_within_limit(
        _ReqWithCookiesHeaders(), upload, is_image=False
    )
    assert content == payload


async def test_image_is_judged_against_the_image_cap_only():
    # An image between the two caps must be rejected; a document that size is fine.
    between = b"x" * (analysis_routes._MAX_IMAGE_BYTES + 1)
    with pytest.raises(HTTPException):
        await analysis_routes._read_upload_within_limit(
            _ReqWithCookiesHeaders(), _FakeUpload(between, "photo.png", "image/png"), is_image=True
        )
    assert (
        await analysis_routes._read_upload_within_limit(
            _ReqWithCookiesHeaders(), _FakeUpload(between), is_image=False
        )
        == between
    )


# ── What earns a quota refund ────────────────────────────────────────────────
#
# The rule is one question: did we already pay Groq for this? Refunding a
# failure that had already been billed is what turned a failure loop into an
# unbounded LLM budget.


def test_failures_that_already_cost_tokens_are_not_refunded():
    from app.services.analysis_service import ClauseExtractionError

    already_billed = [
        # The classifier reached this verdict with a completion.
        ValueError("NOT_A_LEGAL_DOCUMENT"),
        # Up to a few hundred chunk completions preceded this.
        ClauseExtractionError("unparseable model output"),
        # The vision call ran; it just didn't find enough text.
        HTTPException(status_code=422, detail="OCR_INSUFFICIENT_TEXT"),
    ]
    for exc in already_billed:
        assert analysis_routes._should_refund(exc) is False, exc


def test_infrastructure_failures_are_refunded():
    import httpx
    from pymongo.errors import PyMongoError

    for exc in (
        httpx.ConnectTimeout("timed out"),
        PyMongoError("replica set unavailable"),
        TimeoutError(),
        HTTPException(status_code=503, detail="upstream unavailable"),
    ):
        assert analysis_routes._should_refund(exc) is True, exc


def test_image_rejected_before_the_vision_call_is_refunded():
    from app.services.ocr_service import OcrError

    # HEIC, undecodable bytes and decompression bombs are all raised before
    # ocr_complete, so nothing was billed.
    assert analysis_routes._should_refund(OcrError("HEIC_UNSUPPORTED", "no")) is True


def test_unrecognised_failures_default_to_no_refund():
    """Being wrong here costs one unit of quota; the other way costs money."""
    assert analysis_routes._should_refund(RuntimeError("GROQ_API_KEY is not set")) is False
    assert analysis_routes._should_refund(HTTPException(status_code=422, detail="nope")) is False


# ── /upload: what the quota actually does on each outcome ────────────────────


def _text_upload(body: str = "A" * 400) -> _FakeUpload:
    return _FakeUpload(body.encode(), filename="contract.txt", content_type="text/plain")


async def test_oversized_upload_costs_no_quota_at_all(override_settings, seed_user):
    """The 413 is raised before the reservation, so nothing is even claimed."""
    user = seed_user(plan=None)
    uid = str(user["_id"])
    upload = _FakeUpload(b"x" * (analysis_routes._MAX_DOCUMENT_BYTES + 1))

    with pytest.raises(HTTPException) as exc:
        await analysis_routes.upload_and_analyze(
            _authed_request(override_settings, uid), file=upload, role=""
        )

    assert exc.value.status_code == 413
    stored = seed_user.db.users._docs[uid]
    assert stored.get("dailyAnalysisCount") is None
    assert stored.get("dailyAnalysisAttemptCount") is None


async def test_rejected_document_keeps_the_quota_spent(override_settings, seed_user, monkeypatch):
    """NOT_A_LEGAL_DOCUMENT cost a classifier completion, so it is not refunded.

    Refunding it was the hole: the counter went back to zero every time, so a
    loop of junk uploads could run forever, each pass billing Groq.
    """
    user = seed_user(plan=None)
    uid = str(user["_id"])

    async def not_legal(*args, **kwargs):
        raise ValueError("NOT_A_LEGAL_DOCUMENT")

    monkeypatch.setattr(analysis_routes, "analyze_contract", not_legal)

    with pytest.raises(HTTPException) as exc:
        await analysis_routes.upload_and_analyze(
            _authed_request(override_settings, uid), file=_text_upload(), role=""
        )

    assert exc.value.status_code == 422
    assert exc.value.detail == "NOT_A_LEGAL_DOCUMENT"
    stored = seed_user.db.users._docs[uid]
    assert stored["dailyAnalysisCount"] == 1
    assert stored["dailyAnalysisAttemptCount"] == 1

    # And the free tier's single daily analysis really is gone.
    with pytest.raises(HTTPException) as second:
        await analysis_routes.upload_and_analyze(
            _authed_request(override_settings, uid), file=_text_upload(), role=""
        )
    assert second.value.status_code == 429


async def test_unreadable_document_refunds_but_still_burns_an_attempt(override_settings, seed_user):
    """A file we couldn't get text out of cost no tokens, so the quota comes back."""
    user = seed_user(plan=None)
    uid = str(user["_id"])

    with pytest.raises(HTTPException) as exc:
        await analysis_routes.upload_and_analyze(
            _authed_request(override_settings, uid), file=_text_upload("short"), role=""
        )

    assert exc.value.status_code == 422
    stored = seed_user.db.users._docs[uid]
    assert stored["dailyAnalysisCount"] == 0  # refunded
    assert stored["dailyAnalysisAttemptCount"] == 1  # never refunded


async def test_internal_failure_does_not_leak_its_message(
    override_settings, seed_user, monkeypatch
):
    """A misconfigured deploy must not tell the client what is misconfigured."""
    user = seed_user(plan=None)
    uid = str(user["_id"])

    async def misconfigured(*args, **kwargs):
        raise RuntimeError("GROQ_API_KEY is not set")

    monkeypatch.setattr(analysis_routes, "analyze_contract", misconfigured)

    with pytest.raises(HTTPException) as exc:
        await analysis_routes.upload_and_analyze(
            _authed_request(override_settings, uid), file=_text_upload(), role=""
        )

    assert exc.value.status_code == 500
    assert "GROQ_API_KEY" not in exc.value.detail
    assert exc.value.detail == analysis_routes._GENERIC_ERROR_DETAIL


# ── /simulate ownership ──────────────────────────────────────────────────────


async def test_simulate_rejects_an_analysis_id_the_caller_does_not_own(
    override_settings, seed_user
):
    """An unchecked analysisId lets a caller mint index rows under foreign ids."""
    from app.schemas import SimulateRequest

    user = seed_user(plan=None)
    uid = str(user["_id"])
    victim = _seed_analysis(seed_user.db, str(ObjectId()))

    with pytest.raises(HTTPException) as exc:
        await analysis_routes.simulate(
            SimulateRequest(documentText="body", scenario="what if?", analysisId=victim),
            _authed_request(override_settings, uid),
        )

    assert exc.value.status_code == 404
    # Refused before metering, so no query quota was spent either.
    assert seed_user.db.users._docs[uid].get("dailyQueryCount") is None


async def test_simulate_still_serves_the_cli_with_no_analysis_id(
    override_settings, seed_user, monkeypatch
):
    """The published CLI posts raw text and no id — that path must keep working."""
    from app.schemas import SimulateRequest
    from app.services import document_chat_service

    user = seed_user(plan=None)
    uid = str(user["_id"])

    async def answer(*args, **kwargs):
        return {"answer": "it depends", "citations": []}

    monkeypatch.setattr(document_chat_service, "answer_standalone", answer)

    result = await analysis_routes.simulate(
        SimulateRequest(documentText="body", scenario="what if?"),
        _authed_request(override_settings, uid),
    )

    assert result == {"result": "it depends", "citations": []}


# ── Lawyer directory paywall ─────────────────────────────────────────────────


@pytest.mark.parametrize("plan", [None, "Brief", "Motion"])
async def test_non_verdict_plans_are_denied_the_directory(seed_user, plan):
    user = seed_user(plan=plan)
    with pytest.raises(HTTPException) as exc:
        await lawyer_routes._require_verdict_plan(str(user["_id"]))
    assert exc.value.status_code == 403


async def test_verdict_plan_is_allowed_the_directory(seed_user):
    user = seed_user(plan="Verdict")
    await lawyer_routes._require_verdict_plan(str(user["_id"]))  # must not raise


async def test_expired_verdict_plan_is_denied_the_directory(seed_user):
    """The gate must honour expiry, not just read user["plan"] raw.

    Verdict is sold as lifetime today, but a Verdict record carrying an expiry
    (a refund, a trial, a future time-limited tier) must lose access like any
    other lapsed plan — that is the whole point of routing through
    effective_plan.
    """
    user = seed_user(plan="Verdict", planExpiresAt=datetime.now(timezone.utc) - timedelta(days=1))
    with pytest.raises(HTTPException) as exc:
        await lawyer_routes._require_verdict_plan(str(user["_id"]))
    assert exc.value.status_code == 403


async def test_unknown_user_is_401_not_403(fake_db):
    with pytest.raises(HTTPException) as exc:
        await lawyer_routes._require_verdict_plan(str(ObjectId()))
    assert exc.value.status_code == 401
