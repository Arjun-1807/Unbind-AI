"""Tests for the Razorpay payment flow in app.routes.plan_routes.

Follows the direct-call style of test_auth/test_rate_limit: route/helper
functions are awaited directly with tiny fake Request objects; no httpx server
is spun up and Razorpay's HTTP API is monkeypatched so nothing hits the
network.
"""

import hashlib
import hmac
import json
from datetime import datetime, timezone
from unittest.mock import AsyncMock

import pytest
from bson import ObjectId
from fastapi import HTTPException

from app import auth
from app.routes import plan_routes
from app.routes.plan_routes import PLAN_CATALOGUE, VerifyPaymentRequest

# ── Fake request objects ──────────────────────────────────────────────────────


class _ReqWithCookiesHeaders:
    """Copy of the auth-test fake: exposes ``.cookies`` and ``.headers``."""

    def __init__(self, cookies=None, headers=None):
        self.cookies = cookies or {}
        self.headers = headers or {}


class _WebhookRequest:
    """Fake request for the webhook: async ``body()`` + a ``.headers`` dict."""

    def __init__(self, raw: bytes, signature: str):
        self._raw = raw
        self.headers = {"X-Razorpay-Signature": signature}

    async def body(self) -> bytes:
        return self._raw


# ── Helpers ───────────────────────────────────────────────────────────────────


def _authed_request(settings, user_id: str) -> _ReqWithCookiesHeaders:
    token = auth.create_access_token(user_id)
    return _ReqWithCookiesHeaders(cookies={settings.COOKIE_NAME: token})


def _sign(order_id: str, payment_id: str, secret: str = "test_secret") -> str:
    return hmac.new(
        secret.encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256
    ).hexdigest()


def _webhook_sig(raw: bytes, secret: str = "test_webhook_secret") -> str:
    return hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()


def _make_order(order_id, plan, user_id, *, status="paid", amount=None, currency="INR"):
    amt = amount if amount is not None else PLAN_CATALOGUE.get(plan, {}).get("amount", 0)
    return {
        "id": order_id,
        "status": status,
        "amount": amt,
        "currency": currency,
        "notes": {"plan": plan, "user_id": user_id},
    }


def _patch_rzp(monkeypatch, order):
    async def _fake_rzp_request(method, path, **kwargs):
        return order

    monkeypatch.setattr(plan_routes, "_rzp_request", _fake_rzp_request)


def _patch_receipt(monkeypatch):
    receipt = AsyncMock()
    monkeypatch.setattr(plan_routes, "send_payment_receipt_email", receipt)
    return receipt


# ── _verify_signature ──────────────────────────────────────────────────────────


def test_verify_signature_true_for_correct(override_settings):
    order_id, payment_id = "order_1", "pay_1"
    sig = _sign(order_id, payment_id)
    assert plan_routes._verify_signature(order_id, payment_id, sig) is True


def test_verify_signature_false_for_wrong(override_settings):
    order_id, payment_id = "order_1", "pay_1"
    assert plan_routes._verify_signature(order_id, payment_id, "deadbeef") is False


# ── verify_payment: happy paths ─────────────────────────────────────────────────


async def test_verify_happy_path_brief(override_settings, seed_user, monkeypatch):
    user = seed_user()
    user_id = str(user["_id"])
    order = _make_order("order_brief", "Brief", user_id)
    _patch_rzp(monkeypatch, order)
    receipt = _patch_receipt(monkeypatch)

    body = VerifyPaymentRequest(
        razorpay_order_id="order_brief",
        razorpay_payment_id="pay_brief",
        razorpay_signature=_sign("order_brief", "pay_brief"),
    )
    result = await plan_routes.verify_payment(_authed_request(override_settings, user_id), body)

    assert result["success"] is True
    assert result["plan"] == "Brief"
    assert result["expiresAt"] is not None

    # User doc was upgraded.
    db = seed_user.db
    stored = await db.users.find_one({"_id": user["_id"]})
    assert stored["plan"] == "Brief"
    assert stored["pro"] is True
    assert stored["lastPaymentId"] == "pay_brief"
    now = datetime.now(timezone.utc)
    delta_days = (stored["planExpiresAt"] - now).total_seconds() / 86400
    assert 29 < delta_days <= 30

    # Exactly one payment doc recorded.
    assert len(db.payments._docs) == 1
    pay = next(iter(db.payments._docs.values()))
    assert pay["razorpayPaymentId"] == "pay_brief"
    assert pay["amount"] == 10000

    # Receipt attempted once on first grant.
    assert receipt.await_count == 1


async def test_verify_happy_path_verdict_has_no_expiry(override_settings, seed_user, monkeypatch):
    user = seed_user()
    user_id = str(user["_id"])
    order = _make_order("order_verdict", "Verdict", user_id)
    _patch_rzp(monkeypatch, order)
    _patch_receipt(monkeypatch)

    body = VerifyPaymentRequest(
        razorpay_order_id="order_verdict",
        razorpay_payment_id="pay_verdict",
        razorpay_signature=_sign("order_verdict", "pay_verdict"),
    )
    result = await plan_routes.verify_payment(_authed_request(override_settings, user_id), body)

    assert result["plan"] == "Verdict"
    assert result["expiresAt"] is None

    stored = await seed_user.db.users.find_one({"_id": user["_id"]})
    assert stored["plan"] == "Verdict"
    assert stored["planExpiresAt"] is None


# ── verify_payment: rejections ──────────────────────────────────────────────────


async def test_verify_bad_signature_400(override_settings, seed_user, monkeypatch):
    user = seed_user()
    user_id = str(user["_id"])
    # _rzp_request must never be reached; if it is, the wrong error surfaces.
    _patch_rzp(monkeypatch, _make_order("order_x", "Brief", user_id))

    body = VerifyPaymentRequest(
        razorpay_order_id="order_x",
        razorpay_payment_id="pay_x",
        razorpay_signature="not-the-real-signature",
    )
    with pytest.raises(HTTPException) as exc:
        await plan_routes.verify_payment(_authed_request(override_settings, user_id), body)
    assert exc.value.status_code == 400
    assert exc.value.detail == "Payment verification failed"


async def test_verify_order_not_paid_400(override_settings, seed_user, monkeypatch):
    user = seed_user()
    user_id = str(user["_id"])
    order = _make_order("order_np", "Brief", user_id, status="created")
    _patch_rzp(monkeypatch, order)

    body = VerifyPaymentRequest(
        razorpay_order_id="order_np",
        razorpay_payment_id="pay_np",
        razorpay_signature=_sign("order_np", "pay_np"),
    )
    with pytest.raises(HTTPException) as exc:
        await plan_routes.verify_payment(_authed_request(override_settings, user_id), body)
    assert exc.value.status_code == 400
    assert exc.value.detail == "Payment not captured"


async def test_verify_amount_mismatch_400(override_settings, seed_user, monkeypatch):
    user = seed_user()
    user_id = str(user["_id"])
    order = _make_order("order_am", "Brief", user_id, amount=1)  # catalogue is 10000
    _patch_rzp(monkeypatch, order)

    body = VerifyPaymentRequest(
        razorpay_order_id="order_am",
        razorpay_payment_id="pay_am",
        razorpay_signature=_sign("order_am", "pay_am"),
    )
    with pytest.raises(HTTPException) as exc:
        await plan_routes.verify_payment(_authed_request(override_settings, user_id), body)
    assert exc.value.status_code == 400
    assert exc.value.detail == "Order amount mismatch"


async def test_verify_unknown_plan_400(override_settings, seed_user, monkeypatch):
    user = seed_user()
    user_id = str(user["_id"])
    order = _make_order("order_up", "Platinum", user_id, amount=99999)
    _patch_rzp(monkeypatch, order)

    body = VerifyPaymentRequest(
        razorpay_order_id="order_up",
        razorpay_payment_id="pay_up",
        razorpay_signature=_sign("order_up", "pay_up"),
    )
    with pytest.raises(HTTPException) as exc:
        await plan_routes.verify_payment(_authed_request(override_settings, user_id), body)
    assert exc.value.status_code == 400
    assert exc.value.detail == "Unknown plan on order"


async def test_verify_absent_plan_400(override_settings, seed_user, monkeypatch):
    user = seed_user()
    user_id = str(user["_id"])
    order = {"id": "order_ab", "status": "paid", "amount": 10000, "notes": {"user_id": user_id}}
    _patch_rzp(monkeypatch, order)

    body = VerifyPaymentRequest(
        razorpay_order_id="order_ab",
        razorpay_payment_id="pay_ab",
        razorpay_signature=_sign("order_ab", "pay_ab"),
    )
    with pytest.raises(HTTPException) as exc:
        await plan_routes.verify_payment(_authed_request(override_settings, user_id), body)
    assert exc.value.status_code == 400
    assert exc.value.detail == "Unknown plan on order"


async def test_verify_user_mismatch_403(override_settings, seed_user, monkeypatch):
    user = seed_user()
    user_id = str(user["_id"])
    other_id = str(ObjectId())
    order = _make_order("order_mm", "Brief", other_id)  # notes belong to someone else
    _patch_rzp(monkeypatch, order)

    body = VerifyPaymentRequest(
        razorpay_order_id="order_mm",
        razorpay_payment_id="pay_mm",
        razorpay_signature=_sign("order_mm", "pay_mm"),
    )
    with pytest.raises(HTTPException) as exc:
        await plan_routes.verify_payment(_authed_request(override_settings, user_id), body)
    assert exc.value.status_code == 403
    assert exc.value.detail == "Order does not belong to this user"


# ── Idempotency / replay ────────────────────────────────────────────────────────


async def test_verify_replay_grants_once(override_settings, seed_user, monkeypatch):
    user = seed_user()
    user_id = str(user["_id"])
    order = _make_order("order_rp", "Brief", user_id)
    _patch_rzp(monkeypatch, order)
    receipt = _patch_receipt(monkeypatch)

    body = VerifyPaymentRequest(
        razorpay_order_id="order_rp",
        razorpay_payment_id="pay_rp",
        razorpay_signature=_sign("order_rp", "pay_rp"),
    )
    req = _authed_request(override_settings, user_id)

    first = await plan_routes.verify_payment(req, body)
    db = seed_user.db
    stored_after_first = await db.users.find_one({"_id": user["_id"]})
    activated_at = stored_after_first["planActivatedAt"]

    second = await plan_routes.verify_payment(req, body)

    assert first["success"] is True
    assert second["success"] is True
    # Only one payment doc despite two verify calls.
    assert len(db.payments._docs) == 1
    # planActivatedAt untouched by the replay.
    stored_after_second = await db.users.find_one({"_id": user["_id"]})
    assert stored_after_second["planActivatedAt"] == activated_at
    # Receipt sent only on the first grant.
    assert receipt.await_count == 1


async def test_grant_plan_returns_already_processed_when_payment_exists(
    override_settings, seed_user, monkeypatch
):
    user = seed_user()
    user_id = str(user["_id"])
    db = seed_user.db
    receipt = _patch_receipt(monkeypatch)

    # Pre-insert a payment with the id we're about to grant.
    await db.payments.insert_one(
        {
            "userId": ObjectId(user_id),
            "plan": "Brief",
            "razorpayPaymentId": "pay_dup",
            "planExpiresAt": None,
        }
    )
    order = _make_order("order_dup", "Brief", user_id)
    result = await plan_routes._grant_plan(db, user_id, "Brief", order, "pay_dup")

    assert result["alreadyProcessed"] is True
    assert result["success"] is True
    # No second payment doc and no receipt on the already-processed path.
    assert len(db.payments._docs) == 1
    assert receipt.await_count == 0


# ── webhook ─────────────────────────────────────────────────────────────────────


async def test_webhook_unconfigured_secret_503(override_settings, monkeypatch):
    monkeypatch.setattr(override_settings, "RAZORPAY_WEBHOOK_SECRET", "")
    raw = json.dumps({"event": "payment.captured"}).encode()
    req = _WebhookRequest(raw, "whatever")
    with pytest.raises(HTTPException) as exc:
        await plan_routes.razorpay_webhook(req)
    assert exc.value.status_code == 503


async def test_webhook_bad_signature_400(override_settings):
    raw = json.dumps({"event": "payment.captured"}).encode()
    req = _WebhookRequest(raw, "bad-signature")
    with pytest.raises(HTTPException) as exc:
        await plan_routes.razorpay_webhook(req)
    assert exc.value.status_code == 400
    assert exc.value.detail == "Invalid webhook signature"


async def test_webhook_ignored_event(override_settings):
    raw = json.dumps({"event": "payment.failed"}).encode()
    req = _WebhookRequest(raw, _webhook_sig(raw))
    result = await plan_routes.razorpay_webhook(req)
    assert result == {"status": "ignored"}


async def test_webhook_ignored_when_ids_missing(override_settings):
    raw = json.dumps({"event": "payment.captured", "payload": {}}).encode()
    req = _WebhookRequest(raw, _webhook_sig(raw))
    result = await plan_routes.razorpay_webhook(req)
    assert result == {"status": "ignored"}


async def test_webhook_valid_payment_captured_grants(override_settings, seed_user, monkeypatch):
    user = seed_user()
    user_id = str(user["_id"])
    order = _make_order("order_wh", "Motion", user_id)
    _patch_rzp(monkeypatch, order)
    _patch_receipt(monkeypatch)

    event = {
        "event": "payment.captured",
        "payload": {"payment": {"entity": {"id": "pay_wh", "order_id": "order_wh"}}},
    }
    raw = json.dumps(event).encode()
    req = _WebhookRequest(raw, _webhook_sig(raw))

    result = await plan_routes.razorpay_webhook(req)
    assert result == {"status": "ok"}

    db = seed_user.db
    assert len(db.payments._docs) == 1
    pay = next(iter(db.payments._docs.values()))
    assert pay["razorpayPaymentId"] == "pay_wh"
    assert pay["plan"] == "Motion"
    stored = await db.users.find_one({"_id": user["_id"]})
    assert stored["plan"] == "Motion"
    assert stored["pro"] is True


async def test_webhook_duplicate_is_idempotent(override_settings, seed_user, monkeypatch):
    user = seed_user()
    user_id = str(user["_id"])
    order = _make_order("order_whd", "Brief", user_id)
    _patch_rzp(monkeypatch, order)
    _patch_receipt(monkeypatch)

    event = {
        "event": "payment.captured",
        "payload": {"payment": {"entity": {"id": "pay_whd", "order_id": "order_whd"}}},
    }
    raw = json.dumps(event).encode()
    req = _WebhookRequest(raw, _webhook_sig(raw))

    await plan_routes.razorpay_webhook(req)
    await plan_routes.razorpay_webhook(req)

    assert len(seed_user.db.payments._docs) == 1


# ── list_payments ───────────────────────────────────────────────────────────────


async def test_list_payments_returns_only_callers_newest_first(
    override_settings, seed_user, monkeypatch
):
    user = seed_user()
    user_id = str(user["_id"])
    other_id = str(ObjectId())
    db = seed_user.db

    older = datetime(2026, 1, 1, tzinfo=timezone.utc)
    newer = datetime(2026, 6, 1, tzinfo=timezone.utc)
    expiry = datetime(2026, 7, 1, tzinfo=timezone.utc)

    await db.payments.insert_one(
        {
            "userId": ObjectId(user_id),
            "plan": "Brief",
            "amount": 10000,
            "currency": "INR",
            "razorpayPaymentId": "pay_old",
            "razorpayOrderId": "order_old",
            "planExpiresAt": expiry,
            "createdAt": older,
        }
    )
    await db.payments.insert_one(
        {
            "userId": ObjectId(user_id),
            "plan": "Verdict",
            "amount": 150000,
            "currency": "INR",
            "razorpayPaymentId": "pay_new",
            "razorpayOrderId": "order_new",
            "planExpiresAt": None,
            "createdAt": newer,
        }
    )
    await db.payments.insert_one(
        {
            "userId": ObjectId(other_id),
            "plan": "Motion",
            "amount": 45000,
            "currency": "INR",
            "razorpayPaymentId": "pay_other",
            "razorpayOrderId": "order_other",
            "planExpiresAt": None,
            "createdAt": newer,
        }
    )

    result = await plan_routes.list_payments(_authed_request(override_settings, user_id))

    assert [p["razorpayPaymentId"] for p in result] == ["pay_new", "pay_old"]
    # Shape / ISO serialisation of the newest item.
    top = result[0]
    assert top["plan"] == "Verdict"
    assert top["amount"] == 150000
    assert top["currency"] == "INR"
    assert top["razorpayOrderId"] == "order_new"
    assert top["createdAt"] == newer.isoformat()
    assert top["expiresAt"] is None
    assert isinstance(top["id"], str)
    # The expiring plan serialises its expiry to ISO.
    assert result[1]["expiresAt"] == expiry.isoformat()


async def test_list_payments_unauthenticated_401(override_settings):
    with pytest.raises(HTTPException) as exc:
        await plan_routes.list_payments(_ReqWithCookiesHeaders())
    assert exc.value.status_code == 401
