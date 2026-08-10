from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pymongo.errors import DuplicateKeyError

from app.database import get_db
from app.schemas import LawyerRegistrationRequest

router = APIRouter(prefix="/lawyer-register", tags=["lawyer_registration"])


@router.post("/", response_model=dict)
async def register_lawyer(payload: LawyerRegistrationRequest):
    """Register a new lawyer for the referral network.

    Deliberately UNAUTHENTICATED: this backs the "join our lawyer network" form
    on the public landing page (``frontend/src/components/LandingPage.tsx``),
    which is only rendered to signed-out visitors, so requiring a session would
    break the sole legitimate caller.

    What makes that safe is that the row is written with ``verified: False`` and
    every read path in ``lawyer_routes`` filters on ``verified: True`` — an
    un-vetted submission is invisible in the paid directory and cannot be
    contacted until an admin promotes it. Abuse of the endpoint itself is bounded
    by rate limiting and the field-length caps on ``LawyerRegistrationRequest``.
    """
    db = get_db()

    # Check if lawyer with this email already exists
    existing_lawyer = await db.lawyers.find_one({"email": payload.email})
    if existing_lawyer:
        raise HTTPException(
            status_code=400, detail="A lawyer with this email is already registered"
        )

    # Create lawyer document
    lawyer_doc = {
        "name": payload.name,
        "email": payload.email,
        "specializations": payload.specializations,
        "bio": payload.bio,
        "experienceYears": payload.experienceYears,
        "city": payload.city,
        "phone": payload.phone,
        "rating": 0.0,
        "verified": False,  # Lawyers need to be verified by admin
        "createdAt": datetime.now(timezone.utc),
    }

    # Insert lawyer into database. The unique index on lawyers.email is what
    # actually closes the race the find_one above only narrows.
    try:
        result = await db.lawyers.insert_one(lawyer_doc)
    except DuplicateKeyError as e:
        raise HTTPException(
            status_code=400, detail="A lawyer with this email is already registered"
        ) from e

    # Return success response
    return {
        "success": True,
        "message": "Lawyer registration submitted successfully. Our team will review your application.",
        "lawyerId": str(result.inserted_id),
    }
