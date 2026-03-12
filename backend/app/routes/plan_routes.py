from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from bson import ObjectId
from app.auth import get_current_user_id
from app.database import get_db

router = APIRouter(prefix="/user/plan", tags=["user_plan"])

class PlanRequest(BaseModel):
    plan: str

@router.post("/activate")
async def activate_plan(data: PlanRequest, request: Request):
    user_id = await get_current_user_id(request)
    if data.plan not in ["Brief", "Motion", "Verdict"]:
        raise HTTPException(status_code=400, detail="Invalid plan")
    
    db = get_db()
    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"plan": data.plan, "pro": True}}
    )
    return {"success": True, "plan": data.plan}

@router.post("/cancel")
async def cancel_plan(request: Request):
    user_id = await get_current_user_id(request)
    db = get_db()
    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"plan": None, "pro": False}}
    )
    return {"success": True}

@router.get("/")
async def get_plan(request: Request):
    from datetime import datetime, timezone

    PLAN_LIMITS = {
        None: 1,
        "Brief": 3,
        "Motion": 5,
        "Verdict": None,  # unlimited
    }

    user_id = await get_current_user_id(request)
    db = get_db()
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    plan = user.get("plan")
    limit = PLAN_LIMITS.get(plan, 1)

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    last_date = user.get("lastAnalysisDate", "")
    daily_count = user.get("dailyAnalysisCount", 0) if last_date == today else 0

    return {
        "plan": plan,
        "isPro": user.get("pro", False),
        "dailyCount": daily_count,
        "dailyLimit": limit,  # None means unlimited
        "limitReached": False if limit is None else daily_count >= limit,
    }