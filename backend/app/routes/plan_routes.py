import asyncio
import hashlib
import hmac
import logging
from datetime import datetime, timedelta, timezone

import httpx
from bson import ObjectId
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.auth import get_current_user_id
from app.config import get_settings
from app.database import get_db
from app.services.model_selector import select_model
from app.services.plan_service import effective_plan

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/user/plan", tags=["user_plan"])

RAZORPAY_API = "https://api.razorpay.com/v1"


# ── Plan catalogue ────────────────────────────────────────────────────────────
# The price is the source of truth on the server. NEVER trust an amount sent by
# the client — the browser only ever tells us *which* plan; we look up the price
# here so a tampered request can't buy a plan for less. Amounts are in paise
# (₹1 = 100 paise), which is the smallest unit Razorpay charges in.
PLAN_CATALOGUE = {
    "Brief": {"amount": 10000, "duration_days": 30, "label": "UnBind Brief (1 month)"},
    "Motion": {"amount": 45000, "duration_days": 90, "label": "UnBind Motion (3 months)"},
    "Verdict": {"amount": 150000, "duration_days": None, "label": "UnBind Verdict (Lifetime)"},
}

PLAN_LIMITS = {
    None: 1,
    "Brief": 3,
    "Motion": 5,
    "Verdict": None,  # unlimited
}


def _rzp_auth() -> tuple[str, str]:
    """Return (key_id, key_secret), or 503 if payments aren't configured."""
    settings = get_settings()
    if not settings.RAZORPAY_KEY_ID or not settings.RAZORPAY_KEY_SECRET:
        raise HTTPException(
            status_code=503,
            detail="Payments are not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
        )
    return settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET


async def _rzp_request(
    method: str, path: str, *, json_body: dict | None = None, attempts: int = 3
) -> dict:
    """Call the Razorpay REST API directly over httpx.

    Retries transient failures (timeouts, connection errors, 5xx, or an empty/
    non-JSON body — which is what Razorpay's API returns during a brief outage).
    On a definitive error it logs the real HTTP status and body so failures are
    diagnosable instead of surfacing as an opaque JSON-decode error, then raises
    a 502.
    """
    key_id, key_secret = _rzp_auth()
    url = f"{RAZORPAY_API}{path}"
    last_detail = "unknown error"

    async with httpx.AsyncClient(
        auth=(key_id, key_secret), timeout=httpx.Timeout(30.0, connect=10.0)
    ) as client:
        for attempt in range(attempts):
            try:
                resp = await client.request(method, url, json=json_body)
            except httpx.HTTPError as e:  # timeout / connection / transport
                last_detail = f"transport error: {e!r}"
                logger.warning("Razorpay %s %s failed (attempt %d): %s", method, path, attempt + 1, last_detail)
            else:
                # 2xx with a JSON body → success.
                if resp.is_success:
                    try:
                        return resp.json()
                    except ValueError:
                        last_detail = f"200 but non-JSON body: {resp.text[:200]!r}"
                # A 4xx is a real client error (bad request/auth) — don't retry it.
                elif 400 <= resp.status_code < 500:
                    logger.error(
                        "Razorpay %s %s -> %d: %s", method, path, resp.status_code, resp.text[:500]
                    )
                    raise HTTPException(
                        status_code=502, detail="Payment provider rejected the request"
                    )
                else:  # 5xx — Razorpay-side, worth retrying
                    last_detail = f"HTTP {resp.status_code}: {resp.text[:200]!r}"
                logger.warning(
                    "Razorpay %s %s transient (attempt %d): %s", method, path, attempt + 1, last_detail
                )

            if attempt < attempts - 1:
                await asyncio.sleep(0.5 * (attempt + 1))

    logger.error("Razorpay %s %s exhausted %d attempts: %s", method, path, attempts, last_detail)
    raise HTTPException(status_code=502, detail="Payment provider is temporarily unavailable")


def _verify_signature(order_id: str, payment_id: str, signature: str) -> bool:
    """Razorpay signs "<order_id>|<payment_id>" with HMAC-SHA256 keyed by the
    secret. Recomputing it and comparing is how we prove the callback is genuine
    and wasn't forged by the client."""
    _, key_secret = _rzp_auth()
    expected = hmac.new(
        key_secret.encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


class CreateOrderRequest(BaseModel):
    plan: str


class VerifyPaymentRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


@router.post("/create-order")
async def create_order(request: Request, body: CreateOrderRequest):
    """Create a Razorpay order for the chosen plan and return the details the
    frontend Checkout needs. No plan is granted here — that only happens in
    /verify after the payment signature checks out."""
    user_id = await get_current_user_id(request)

    plan = body.plan
    if plan not in PLAN_CATALOGUE:
        raise HTTPException(status_code=400, detail="Invalid plan")

    settings = get_settings()
    catalogue = PLAN_CATALOGUE[plan]

    order = await _rzp_request(
        "POST",
        "/orders",
        json_body={
            "amount": catalogue["amount"],
            "currency": "INR",
            # receipt is capped at 40 chars by Razorpay.
            "receipt": f"plan_{plan}_{user_id}"[:40],
            "notes": {"user_id": user_id, "plan": plan},
        },
    )

    return {
        "orderId": order["id"],
        "amount": order["amount"],
        "currency": order["currency"],
        "keyId": settings.RAZORPAY_KEY_ID,  # public key — safe to expose
        "plan": plan,
        "description": catalogue["label"],
    }


@router.post("/verify")
async def verify_payment(request: Request, body: VerifyPaymentRequest):
    """Verify the Razorpay payment signature and, only if genuine, activate the
    plan tied to the order. The signature is an HMAC-SHA256 of
    "order_id|payment_id" keyed with the secret — a client cannot forge it."""
    user_id = await get_current_user_id(request)

    # 1) Cryptographically verify the callback really came from Razorpay.
    if not _verify_signature(
        body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature
    ):
        raise HTTPException(status_code=400, detail="Payment verification failed")

    # 2) Re-fetch the order from Razorpay so the plan/amount come from a trusted
    #    source, not the client. Guards against a verified payment for one plan
    #    being replayed to unlock a more expensive one.
    order = await _rzp_request("GET", f"/orders/{body.razorpay_order_id}")

    plan = (order.get("notes") or {}).get("plan")
    if plan not in PLAN_CATALOGUE:
        raise HTTPException(status_code=400, detail="Unknown plan on order")
    if order.get("amount") != PLAN_CATALOGUE[plan]["amount"]:
        raise HTTPException(status_code=400, detail="Order amount mismatch")

    # 3) Grant the plan.
    now = datetime.now(timezone.utc)
    duration = PLAN_CATALOGUE[plan]["duration_days"]
    expires_at = now + timedelta(days=duration) if duration is not None else None

    db = get_db()
    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {
            "$set": {
                "plan": plan,
                "pro": True,
                "planActivatedAt": now,
                "planExpiresAt": expires_at,
                "lastPaymentId": body.razorpay_payment_id,
            }
        },
    )

    # Keep an immutable record of the payment for reconciliation/audit.
    await db.payments.insert_one(
        {
            "userId": ObjectId(user_id),
            "plan": plan,
            "amount": order["amount"],
            "currency": order.get("currency", "INR"),
            "razorpayOrderId": body.razorpay_order_id,
            "razorpayPaymentId": body.razorpay_payment_id,
            "createdAt": now,
        }
    )

    return {"success": True, "plan": plan, "expiresAt": expires_at.isoformat() if expires_at else None}


@router.post("/cancel")
async def cancel_plan(request: Request):
    user_id = await get_current_user_id(request)
    db = get_db()
    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"plan": None, "pro": False, "planExpiresAt": None}},
    )
    return {"success": True}


@router.get("/")
async def get_plan(request: Request):
    user_id = await get_current_user_id(request)
    db = get_db()
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # A time-limited plan (Brief/Motion) reverts to the free tier once it lapses;
    # lifetime (Verdict) never expires.
    plan = effective_plan(user)
    limit = PLAN_LIMITS.get(plan, 1)

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    last_date = user.get("lastAnalysisDate", "")
    daily_count = user.get("dailyAnalysisCount", 0) if last_date == today else 0

    return {
        "plan": plan,
        "isPro": bool(plan),
        "aiModel": select_model(user),
        "dailyCount": daily_count,
        "dailyLimit": limit,  # None means unlimited
        "limitReached": False if limit is None else daily_count >= limit,
    }
