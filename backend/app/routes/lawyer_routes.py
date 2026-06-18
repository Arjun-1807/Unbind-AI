import asyncio
from datetime import datetime
from typing import Optional
from bson import ObjectId
from fastapi import APIRouter, HTTPException, Request, Query
from app.auth import get_current_user_id
from app.database import get_db
from app.schemas import LawyerProfile, ContactLawyerRequest

router = APIRouter(prefix="/lawyers", tags=["lawyers"])

# Daily analysis limits per plan (None = unlimited)
PLAN_LIMITS: dict[str | None, int | None] = {
    None: 1,        # free tier: 1 analysis per day
    "Brief": 3,     # Brief plan: 3 analyses per day
    "Motion": 5,    # Motion plan: 5 analyses per day
    "Verdict": None,  # Verdict plan: unlimited
}


async def _require_verdict_plan(user_id: str) -> None:
    """Check if the user has the Verdict plan.

    Raises HTTP 403 if the user does not have the Verdict plan.
    """
    db = get_db()
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    plan: str | None = user.get("plan")
    limit = PLAN_LIMITS.get(plan, 1)  # default to 1 if plan key is unknown

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
    specialization: Optional[str] = Query(None, description="Filter lawyers by specialization")
):
    """List all lawyers, optionally filtered by specialization."""
    user_id = await get_current_user_id(request)
    await _require_verdict_plan(user_id)

    db = get_db()

    # Build query filter
    query = {}
    if specialization:
        query["specializations"] = {"$in": [specialization]}

    # Fetch lawyers
    lawyers_cursor = db.lawyers.find(query)
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
                createdAt=lawyer_doc["createdAt"]
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
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid lawyer ID")

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
        createdAt=lawyer_doc["createdAt"]
    )


@router.post("/{lawyer_id}/contact")
async def contact_lawyer(lawyer_id: str, request: ContactLawyerRequest, http_request: Request):
    """Submit a contact request to a lawyer."""
    user_id = await get_current_user_id(http_request)
    await _require_verdict_plan(user_id)

    db = get_db()

    # Validate ObjectId
    try:
        object_id = ObjectId(lawyer_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid lawyer ID")

    # Check if lawyer exists
    lawyer_doc = await db.lawyers.find_one({"_id": object_id})
    if not lawyer_doc:
        raise HTTPException(status_code=404, detail="Lawyer not found")

    # Create contact request
    contact_request_doc = {
        "userId": user_id,
        "lawyerId": lawyer_id,
        "message": request.message,
        "contactEmail": request.contactEmail,
        "createdAt": datetime.utcnow(),
        "status": "pending"
    }

    # Insert contact request
    result = await db.lawyer_contact_requests.insert_one(contact_request_doc)

    return {"success": True, "requestId": str(result.inserted_id)}