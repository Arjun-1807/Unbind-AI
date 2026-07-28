import logging
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query, Request

from app.auth import get_current_user_id
from app.database import get_db
from app.schemas import ContactLawyerRequest, LawyerProfile
from app.services.email_service import send_lawyer_contact_email
from app.services.plan_service import effective_plan, plan_limit

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/lawyers", tags=["lawyers"])


async def _require_verdict_plan(user_id: str) -> None:
    """Check if the user has the Verdict plan.

    Raises HTTP 403 if the user does not have the Verdict plan.
    """
    db = get_db()
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # effective_plan treats an expired paid plan as the free tier, matching the
    # analysis rate limiter — reading user["plan"] raw would let a lapsed plan
    # keep directory access.
    plan: str | None = effective_plan(user)
    limit = plan_limit(plan)

    # Only Verdict plan has unlimited access (None)
    if limit is not None:
        raise HTTPException(
            status_code=403,
            detail=(
                f"Access to lawyer directory requires the Verdict plan. "
                f"Your current plan is {'Free' if plan is None else plan}. "
                f"Please upgrade your plan to access this feature."
            ),
        )


@router.get("/", response_model=list[LawyerProfile])
async def list_lawyers(
    request: Request,
    specialization: str | None = Query(None, description="Filter lawyers by specialization"),
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
):
    """List lawyers, optionally filtered by specialization."""
    user_id = await get_current_user_id(request)
    await _require_verdict_plan(user_id)

    db = get_db()

    # Build query filter
    query = {}
    if specialization:
        query["specializations"] = {"$in": [specialization]}

    # Fetch lawyers
    lawyers_cursor = db.lawyers.find(query).skip(skip).limit(limit)
    lawyers = []
    async for lawyer_doc in lawyers_cursor:
        lawyers.append(
            LawyerProfile(
                id=str(lawyer_doc["_id"]),
                name=lawyer_doc["name"],
                specializations=lawyer_doc["specializations"],
                bio=lawyer_doc["bio"],
                experienceYears=lawyer_doc["experienceYears"],
                city=lawyer_doc["city"],
                email=lawyer_doc["email"],
                phone=lawyer_doc.get("phone"),
                rating=lawyer_doc.get("rating", 0.0),
                verified=lawyer_doc.get("verified", False),
                createdAt=lawyer_doc["createdAt"],
            )
        )

    return lawyers


@router.get("/{lawyer_id}", response_model=LawyerProfile)
async def get_lawyer(lawyer_id: str, request: Request):
    """Get details of a specific lawyer."""
    user_id = await get_current_user_id(request)
    await _require_verdict_plan(user_id)

    db = get_db()

    # Validate ObjectId
    try:
        object_id = ObjectId(lawyer_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid lawyer ID") from e

    # Fetch lawyer
    lawyer_doc = await db.lawyers.find_one({"_id": object_id})
    if not lawyer_doc:
        raise HTTPException(status_code=404, detail="Lawyer not found")

    return LawyerProfile(
        id=str(lawyer_doc["_id"]),
        name=lawyer_doc["name"],
        specializations=lawyer_doc["specializations"],
        bio=lawyer_doc["bio"],
        experienceYears=lawyer_doc["experienceYears"],
        city=lawyer_doc["city"],
        email=lawyer_doc["email"],
        phone=lawyer_doc.get("phone"),
        rating=lawyer_doc.get("rating", 0.0),
        verified=lawyer_doc.get("verified", False),
        createdAt=lawyer_doc["createdAt"],
    )


@router.post("/{lawyer_id}/contact")
async def contact_lawyer(lawyer_id: str, request: ContactLawyerRequest, http_request: Request):
    """Submit a contact request to a lawyer and email them."""
    user_id = await get_current_user_id(http_request)
    await _require_verdict_plan(user_id)

    db = get_db()

    # Validate ObjectId
    try:
        object_id = ObjectId(lawyer_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid lawyer ID") from e

    # Check if lawyer exists
    lawyer_doc = await db.lawyers.find_one({"_id": object_id})
    if not lawyer_doc:
        raise HTTPException(status_code=404, detail="Lawyer not found")

    # Save contact request to DB
    contact_request_doc = {
        "userId": user_id,
        "lawyerId": lawyer_id,
        "message": request.message,
        "contactEmail": request.contactEmail,
        "createdAt": datetime.now(timezone.utc),
        "status": "pending",
    }
    result = await db.lawyer_contact_requests.insert_one(contact_request_doc)

    # Await email sending directly so Vercel Serverless doesn't terminate/freeze
    # the function before it finishes. The contact request is already persisted
    # at this point, so an SMTP failure must not 500 the request and tell the
    # user nothing happened — report the delivery outcome instead.
    try:
        await send_lawyer_contact_email(
            lawyer_email=lawyer_doc["email"],
            lawyer_name=lawyer_doc["name"],
            user_email=request.contactEmail,
            message=request.message,
        )
        emailed = True
    except Exception:
        logger.exception("Failed to email lawyer %s for contact request", lawyer_id)
        emailed = False
        await db.lawyer_contact_requests.update_one(
            {"_id": result.inserted_id}, {"$set": {"status": "email_failed"}}
        )

    return {"success": True, "requestId": str(result.inserted_id), "emailed": emailed}
