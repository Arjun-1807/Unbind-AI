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
    user_id = await get_current_user_id(request)
    db = get_db()
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {"plan": user.get("plan"), "isPro": user.get("pro", False)}