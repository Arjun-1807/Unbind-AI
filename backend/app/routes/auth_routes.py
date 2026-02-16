from fastapi import APIRouter, HTTPException, Request, Response
from app.schemas import SignupRequest, LoginRequest, UserResponse, UpdatePasswordRequest
from app.auth import (
    hash_password,
    verify_password,
    create_access_token,
    set_auth_cookie,
    clear_auth_cookie,
    get_current_user_id,
)
from app.database import get_db
import datetime

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=UserResponse)
async def signup(body: SignupRequest, response: Response):
    db = get_db()
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    password_hash = hash_password(body.password)
    now = datetime.datetime.now()
    doc = {
        "username": body.username,
        "email": body.email.lower(),
        "passwordHash": password_hash,
        "picture": None,
        "createdAt":now
    }
    result = await db.users.insert_one(doc)
    user_id = str(result.inserted_id)

    token = create_access_token(user_id)
    set_auth_cookie(response, token)

    return UserResponse(id=user_id, username=body.username, email=body.email.lower(),pro=False,createdAt=now)


@router.post("/login", response_model=UserResponse)
async def login(body: LoginRequest, response: Response):
    db = get_db()
    user = await db.users.find_one({"email": body.email.lower()})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not verify_password(body.password, user["passwordHash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user_id = str(user["_id"])
    token = create_access_token(user_id)
    set_auth_cookie(response, token)

    return UserResponse(
        id=user_id,
        username=user["username"],
        email=user["email"],
        picture=user.get("picture"),
        pro=user.get("pro",False),
        createdAt=user.get("createdAt")
    )


@router.post("/logout")
async def logout(response: Response):
    clear_auth_cookie(response)
    return {"ok": True}


@router.get("/me", response_model=UserResponse)
async def me(request: Request):
    user_id = await get_current_user_id(request)
    db = get_db()
    from bson import ObjectId

    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return UserResponse(
        id=str(user["_id"]),
        username=user["username"],
        email=user["email"],
        picture=user.get("picture"),
        pro = user.get("pro",False),
    )


@router.post("/update-password")
async def update_password(body: UpdatePasswordRequest, request: Request):
    user_id = await get_current_user_id(request)
    db = get_db()
    from bson import ObjectId

    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Verify current password
    if not verify_password(body.currentPassword, user["passwordHash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    # Validate new password
    if len(body.newPassword) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")

    # Hash and update password
    new_password_hash = hash_password(body.newPassword)
    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"passwordHash": new_password_hash}}
    )

    return {"ok": True, "message": "Password updated successfully"}
