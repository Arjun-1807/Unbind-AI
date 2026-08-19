import asyncio
import hashlib
import hmac
import json
import logging
from datetime import datetime, timedelta, timezone

import httpx
from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel
from pymongo.errors import DuplicateKeyError

from app.auth import get_current_user_id
from app.config import get_settings
from app.database import get_db
from app.services.email_service import send_payment_receipt_email
from app.services.model_selector import select_model
from app.services.plan_service import effective_plan, plan_limit, query_limit

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/user/plan", tags=["user_plan"])

RAZORPAY_API = "https://api.razorpay.com/v1"


# ── Plan catalogue ────────────────────────────────────────────────────────────
# The price is the source of truth on the server. NEVER trust an amount sent by
# the client — the browser only ever tells us *which* plan; we look up the price
# here so a tampered request can't buy a plan for less. Amounts are in paise
# (₹1 = 100 paise), which is the smallest unit Razorpay charges in.
#
# Brief and Motion are both 30-day passes that lapse and must be repurchased —
# nothing auto-renews, and the Terms page says so. They differ by daily quota
# (see plan_service.PLAN_LIMITS), not by duration. Verdict is bought once and
# never expires, which is why its duration_days is None.
PLAN_CATALOGUE = {
    "Brief": {"amount": 10000, "duration_days": 30, "label": "UnBind Brief (1 month)"},
    "Motion": {"amount": 45000, "duration_days": 30, "label": "UnBind Motion (1 month)"},
    "Verdict": {"amount": 250000, "duration_days": None, "label": "UnBind Verdict (Lifetime)"},
}

# Plan tiers, worst → best (free tier is None → 0). A purchase may extend or
# upgrade what a user has, but must never silently replace something better:
# without this ordering a ₹100 Brief bought on top of a lifetime Verdict would
# overwrite it with a 30-day expiry. Kept in sync with plan_service.PLAN_LIMITS.
PLAN_RANK: dict[str | None, int] = {None: 0, "Brief": 1, "Motion": 2, "Verdict": 3}


def _as_utc(value: datetime | None) -> datetime | None:
    """Mongo can hand back a naive datetime; treat it as the UTC we stored."""
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _better_expiry(a: datetime | None, b: datetime | None) -> datetime | None:
    """The more generous of two plan expiries. ``None`` means "never expires"
    (lifetime), so it beats every concrete date."""
    if a is None or b is None:
        return None
    return max(a, b)


def _resolve_grant(
    current_plan: str | None,
    current_expires_at: datetime | None,
    new_plan: str,
    new_expires_at: datetime | None,
) -> tuple[str, datetime | None]:
    """Merge a newly purchased plan into whatever the user already has, keeping
    the better of the two — extend or upgrade, never downgrade.

    ``current_plan`` must be the *effective* plan (see
    ``plan_service.effective_plan``), so a lapsed Brief counts as free tier and
    doesn't block a new purchase. Rules:

    * No active plan → the purchase applies as-is.
    * Purchase of a strictly lower tier → keep the existing plan and expiry
      untouched (the buyer keeps what they already paid for).
    * Same or higher tier → take the new plan name and the later of the two
      expiries, so an upgrade can never shorten access.
    """
    cur_rank = PLAN_RANK.get(current_plan, 0) if current_plan else 0
    new_rank = PLAN_RANK.get(new_plan, 0)

    if cur_rank == 0 or current_plan is None:
        return new_plan, new_expires_at

    if cur_rank > new_rank:
        return current_plan, current_expires_at

    return new_plan, _better_expiry(current_expires_at, new_expires_at)


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
                logger.warning(
                    "Razorpay %s %s failed (attempt %d): %s", method, path, attempt + 1, last_detail
                )
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
                    "Razorpay %s %s transient (attempt %d): %s",
                    method,
                    path,
                    attempt + 1,
                    last_detail,
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
    # Compared as bytes: compare_digest raises TypeError on a non-ASCII str, and
    # the signature here is attacker-supplied, so comparing raw strs would let a
    # caller turn the 400 below into a 500. See also the webhook.
    return hmac.compare_digest(expected.encode(), signature.encode("latin-1", "ignore"))


async def _send_receipt(
    db, user_id: str, plan: str, order: dict, payment_id: str, expires_at: datetime | None
) -> None:
    """Best-effort payment receipt email. A failure here must never fail the
    payment grant, so all errors are swallowed (and logged)."""
    try:
        user = await db.users.find_one({"_id": ObjectId(user_id)})
        email = user.get("email") if user else None
        if not email:
            return
        await send_payment_receipt_email(
            to_email=email,
            plan_label=PLAN_CATALOGUE[plan]["label"],
            amount=order["amount"],
            currency=order.get("currency", "INR"),
            payment_id=payment_id,
            order_id=order["id"],
            expires_at=expires_at.isoformat() if expires_at else None,
        )
    except Exception:
        logger.exception("Failed to send payment receipt for payment %s", payment_id)


async def _grant_plan(db, user_id: str, plan: str, order: dict, payment_id: str) -> dict:
    """Idempotently grant ``plan`` to ``user_id`` for a paid ``order``.

    Keyed on the Razorpay payment id: if this payment was already recorded we
    return the existing grant without re-applying it, so a replayed /verify call
    or a duplicate webhook can't extend the plan or double-count a purchase. The
    unique index on ``payments.razorpayPaymentId`` is the race-safe backstop for
    two concurrent grants of the same payment.

    The grant itself only ever improves the user's standing: ``_resolve_grant``
    keeps the higher tier and the later expiry, so buying a cheaper plan on top
    of an active better one can't clobber it (see ``PLAN_RANK``).
    """
    existing = await db.payments.find_one({"razorpayPaymentId": payment_id})
    if existing:
        exp = existing.get("planExpiresAt")
        return {
            "success": True,
            # grantedPlan is what the user actually ended up with, which differs
            # from the purchased plan when the purchase was a no-op downgrade.
            "plan": existing.get("grantedPlan") or existing.get("plan", plan),
            "expiresAt": exp.isoformat() if hasattr(exp, "isoformat") else exp,
            "alreadyProcessed": True,
        }

    now = datetime.now(timezone.utc)
    duration = PLAN_CATALOGUE[plan]["duration_days"]
    expires_at = now + timedelta(days=duration) if duration is not None else None

    user = await db.users.find_one({"_id": ObjectId(user_id)})

    if user and user.get("lastPaymentId") == payment_id:
        # This exact payment was already applied to the user, but we crashed
        # before recording it in `payments` below. Re-running the merge would
        # push the expiry out a second time, so carry the existing grant through
        # unchanged and just let the payment record catch up.
        granted_plan = user.get("plan") or plan
        granted_expires_at = _as_utc(user.get("planExpiresAt"))
    else:
        # effective_plan (not user["plan"]) so an already-lapsed plan doesn't
        # count as "better" than the plan just bought.
        granted_plan, granted_expires_at = _resolve_grant(
            effective_plan(user),
            _as_utc(user.get("planExpiresAt")) if user else None,
            plan,
            expires_at,
        )

    # Grant the plan first. The $set is idempotent and this ordering guarantees a
    # paying user is never left un-granted: if we crash before recording the
    # payment below, a replay simply re-grants and records it (self-healing).
    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {
            "$set": {
                "plan": granted_plan,
                "pro": True,
                "planActivatedAt": now,
                "planExpiresAt": granted_expires_at,
                "lastPaymentId": payment_id,
            }
        },
    )

    # Record the payment. The unique index on razorpayPaymentId is the race-safe
    # backstop: if a concurrent grant already inserted it, we bail out without
    # sending a second receipt.
    try:
        await db.payments.insert_one(
            {
                "userId": ObjectId(user_id),
                # `plan` is what was bought (drives the receipt/history line);
                # `grantedPlan` is what the account ended up on, which differs
                # when the purchase was a lower tier than the active plan.
                "plan": plan,
                "grantedPlan": granted_plan,
                "amount": order["amount"],
                "currency": order.get("currency", "INR"),
                "razorpayOrderId": order["id"],
                "razorpayPaymentId": payment_id,
                "planExpiresAt": granted_expires_at,
                "createdAt": now,
            }
        )
    except DuplicateKeyError:
        return {
            "success": True,
            "plan": granted_plan,
            "expiresAt": granted_expires_at.isoformat() if granted_expires_at else None,
            "alreadyProcessed": True,
        }

    await _send_receipt(db, user_id, plan, order, payment_id, granted_expires_at)

    return {
        "success": True,
        "plan": granted_plan,
        "expiresAt": granted_expires_at.isoformat() if granted_expires_at else None,
        "alreadyProcessed": False,
    }


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

    # 2) Re-fetch the order from Razorpay so the plan/amount/owner come from a
    #    trusted source, not the client. Guards against a verified payment for
    #    one plan being replayed to unlock a more expensive one.
    order = await _rzp_request("GET", f"/orders/{body.razorpay_order_id}")

    # 2a) The signature only proves the handshake is genuine — confirm the order
    #     was actually paid before granting anything.
    if order.get("status") != "paid":
        raise HTTPException(status_code=400, detail="Payment not captured")

    notes = order.get("notes") or {}
    plan = notes.get("plan")
    if plan not in PLAN_CATALOGUE:
        raise HTTPException(status_code=400, detail="Unknown plan on order")
    if order.get("amount") != PLAN_CATALOGUE[plan]["amount"]:
        raise HTTPException(status_code=400, detail="Order amount mismatch")

    # 2b) The order must belong to the caller — a captured payment can only ever
    #     unlock the account that created the order.
    if notes.get("user_id") != user_id:
        raise HTTPException(status_code=403, detail="Order does not belong to this user")

    # 3) Grant the plan idempotently (records the payment, emails a receipt).
    db = get_db()
    result = await _grant_plan(db, user_id, plan, order, body.razorpay_payment_id)

    return {
        "success": True,
        "plan": result["plan"],
        "expiresAt": result["expiresAt"],
    }


@router.post("/webhook")
async def razorpay_webhook(request: Request):
    """Server-to-server payment confirmation from Razorpay.

    This is the reliable source of truth: even if the browser never calls
    /verify (tab closed, network dropped after paying), Razorpay still delivers
    the ``payment.captured`` / ``order.paid`` event here and the plan is
    granted. The X-Razorpay-Signature header is an HMAC-SHA256 of the *raw*
    request body keyed with the webhook secret — recomputing it proves the event
    is genuine. Grants are idempotent, so overlap with /verify is harmless.
    """
    settings = get_settings()
    secret = settings.RAZORPAY_WEBHOOK_SECRET
    if not secret:
        raise HTTPException(status_code=503, detail="Webhook is not configured")

    raw = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")
    expected = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    # Bytes, not str: Starlette decodes headers as latin-1, so a signature header
    # containing a non-ASCII byte produces a str that compare_digest rejects with
    # TypeError — a 500 (and a stack trace) where an unauthenticated caller
    # should only ever get the 400 below.
    if not hmac.compare_digest(expected.encode(), signature.encode("latin-1", "ignore")):
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    try:
        event = json.loads(raw)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid webhook body") from None

    if event.get("event") not in ("payment.captured", "order.paid"):
        return {"status": "ignored"}

    entity = (((event.get("payload") or {}).get("payment") or {}).get("entity")) or {}
    payment_id = entity.get("id")
    order_id = entity.get("order_id")
    if not payment_id or not order_id:
        return {"status": "ignored"}

    # Re-fetch the order so plan/amount/owner come from Razorpay, not the payload.
    order = await _rzp_request("GET", f"/orders/{order_id}")
    notes = order.get("notes") or {}
    plan = notes.get("plan")
    notes_user_id = notes.get("user_id")

    if (
        plan in PLAN_CATALOGUE
        and notes_user_id
        and order.get("amount") == PLAN_CATALOGUE[plan]["amount"]
    ):
        db = get_db()
        await _grant_plan(db, notes_user_id, plan, order, payment_id)

    return {"status": "ok"}


@router.get("/payments")
async def list_payments(
    request: Request,
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
):
    """Return a page of the authenticated user's payment history, newest first."""
    user_id = await get_current_user_id(request)
    db = get_db()
    cursor = (
        db.payments.find({"userId": ObjectId(user_id)})
        .sort("createdAt", -1)
        .skip(skip)
        .limit(limit)
    )
    payments = []
    async for p in cursor:
        created = p.get("createdAt")
        expires = p.get("planExpiresAt")
        payments.append(
            {
                "id": str(p["_id"]),
                "plan": p.get("plan"),
                "amount": p.get("amount"),
                "currency": p.get("currency", "INR"),
                "razorpayPaymentId": p.get("razorpayPaymentId"),
                "razorpayOrderId": p.get("razorpayOrderId"),
                "createdAt": created.isoformat() if hasattr(created, "isoformat") else created,
                "expiresAt": expires.isoformat() if hasattr(expires, "isoformat") else expires,
            }
        )
    return payments


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
    limit = plan_limit(plan)
    q_limit = query_limit(plan)

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    daily_count = user.get("dailyAnalysisCount", 0) if user.get("lastAnalysisDate") == today else 0
    query_count = user.get("dailyQueryCount", 0) if user.get("lastQueryDate") == today else 0

    # Brief and Motion are 30-day passes that lapse and must be repurchased —
    # nothing auto-renews. The UI needs two things this endpoint is the only
    # place to get: when an active plan runs out (so it can warn before the
    # user hits a 429), and which plan just ended (so a lapsed user is told
    # what happened instead of silently dropping to free-tier quota).
    stored_plan = user.get("plan")
    expires_at = _as_utc(user.get("planExpiresAt"))
    lapsed_plan = stored_plan if stored_plan and plan is None else None

    return {
        "plan": plan,
        "isPro": bool(plan),
        # ISO-8601, or null for a lifetime plan / no plan at all.
        "expiresAt": expires_at.isoformat() if expires_at else None,
        "lapsedPlan": lapsed_plan,
        "aiModel": select_model(user),
        "dailyCount": daily_count,
        "dailyLimit": limit,  # None means unlimited
        "limitReached": False if limit is None else daily_count >= limit,
        # Follow-up AI queries (impact simulator, negotiation drafting) are
        # metered separately from full analyses.
        "queryCount": query_count,
        "queryLimit": q_limit,
        "queryLimitReached": False if q_limit is None else query_count >= q_limit,
    }
