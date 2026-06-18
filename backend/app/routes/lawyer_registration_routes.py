from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException
from app.database import get_db
from app.schemas import LawyerRegistrationRequest

router = APIRouter(prefix="/lawyer-register", tags=["lawyer_registration"])

@router.post("/", response_model=dict)
async def register_lawyer(payload: LawyerRegistrationRequest):
    """Register a new lawyer for the referral network."""
    db = get_db()

    # Check if lawyer with this email already exists
    existing_lawyer = await db.lawyers.find_one({"email": payload.email})
    if existing_lawyer:
        raise HTTPException(status_code=400, detail="A lawyer with this email is already registered")

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
        "createdAt": datetime.utcnow()
    }

    # Insert lawyer into database
    result = await db.lawyers.insert_one(lawyer_doc)

    # Return success response
    return {
        "success": True,
        "message": "Lawyer registration submitted successfully. Our team will review your application.",
        "lawyerId": str(result.inserted_id)
    }