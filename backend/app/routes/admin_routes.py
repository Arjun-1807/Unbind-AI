"""Minimal back-office.

Scope is deliberately one job: promoting a registered lawyer to ``verified``.

That gap was load-bearing. ``POST /api/lawyer-register/`` writes every
submission with ``verified: False``, and every read in ``lawyer_routes``
filters on ``verified: True`` — but nothing anywhere set it true, so the
directory was permanently empty. It is the headline feature of the ₹2,500
Verdict plan, which made it a feature that was sold and could not be
delivered.

Access is a boolean ``isAdmin`` on the user document rather than a role system:
there is exactly one privilege here, and a role table for one privilege is
structure without payoff. Promote an account by hand, once::

    db.users.updateOne({email: "you@example.com"}, {$set: {isAdmin: true}})

The flag is never settable through the API — there is no endpoint that writes
``isAdmin``, so a compromised session cannot escalate to one.
"""

import logging

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, HTTPException, Query, Request

from app.auth import get_current_user_id
from app.database import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin", tags=["admin"])


async def _require_admin(request: Request) -> str:
    """Resolve the caller and refuse anyone without ``isAdmin``.

    Returns the admin's user id so callers can attribute the change.
    """
    user_id = await get_current_user_id(request)
    db = get_db()
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if not user.get("isAdmin"):
        # 404 rather than 403: an admin surface shouldn't confirm its own
        # existence to a signed-in stranger probing for it.
        raise HTTPException(status_code=404, detail="Not found")
    return user_id


def _object_id(value: str, what: str) -> ObjectId:
    """Parse an id, answering 400 rather than 500 on a malformed one."""
    try:
        return ObjectId(value)
    except (InvalidId, TypeError) as e:
        raise HTTPException(status_code=400, detail=f"Invalid {what} id") from e


@router.get("/lawyers")
async def list_lawyers_for_review(
    request: Request,
    # Plain default rather than Query(...): FastAPI still exposes it as an
    # optional query parameter, and it stays a real ``None`` when the handler
    # is called directly (as the tests do) instead of a FieldInfo sentinel.
    verified: bool | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    skip: int = Query(default=0, ge=0),
):
    """List lawyer registrations, newest first.

    Unlike the public directory this does NOT filter to verified only — the
    whole point is seeing the pending queue.
    """
    await _require_admin(request)
    db = get_db()

    query: dict = {}
    if verified is not None:
        query["verified"] = verified

    cursor = db.lawyers.find(query).sort("createdAt", -1).skip(skip).limit(limit)

    lawyers = []
    async for lawyer in cursor:
        lawyers.append(
            {
                "id": str(lawyer["_id"]),
                "name": lawyer.get("name"),
                "email": lawyer.get("email"),
                "specializations": lawyer.get("specializations", []),
                "bio": lawyer.get("bio"),
                "experienceYears": lawyer.get("experienceYears"),
                "city": lawyer.get("city"),
                "phone": lawyer.get("phone"),
                "verified": bool(lawyer.get("verified")),
                "createdAt": (lawyer["createdAt"].isoformat() if lawyer.get("createdAt") else None),
            }
        )
    return lawyers


@router.patch("/lawyers/{lawyer_id}")
async def set_lawyer_verified(
    lawyer_id: str,
    request: Request,
    verified: bool = Query(description="Whether this lawyer appears in the paid directory."),
):
    """Promote a registration into the directory, or withdraw it.

    Reversible on purpose: ``verified=false`` is how a lawyer who turns out not
    to check out gets pulled, and there is no other way to do it without shell
    access to production.
    """
    admin_id = await _require_admin(request)
    db = get_db()

    result = await db.lawyers.update_one(
        {"_id": _object_id(lawyer_id, "lawyer")},
        {"$set": {"verified": verified}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Lawyer not found")

    # Worth a log line: this is the action that makes a profile publicly
    # contactable by paying users, so it should be attributable after the fact.
    logger.info(
        "Admin %s set lawyer %s verified=%s",
        admin_id,
        lawyer_id,
        verified,
    )
    return {"success": True, "lawyerId": lawyer_id, "verified": verified}
