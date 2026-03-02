from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel
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
from app.config import get_settings
import datetime
import httpx

router = APIRouter(prefix="/auth", tags=["auth"])


class GoogleLoginRequest(BaseModel):
    credential: str


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
        "createdAt": now
    }
    result = await db.users.insert_one(doc)
    user_id = str(result.inserted_id)

    token = create_access_token(user_id)
    set_auth_cookie(response, token)

    return UserResponse(id=user_id, username=body.username, email=body.email.lower(), pro=False, createdAt=now)


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
        pro=user.get("pro", False),
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
        pro=user.get("pro", False),
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


@router.post("/google", response_model=UserResponse)
async def google_login(body: GoogleLoginRequest, response: Response):
    settings = get_settings()

    # Verify the Google ID token with Google's tokeninfo endpoint
    async with httpx.AsyncClient() as client:
        res = await client.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"id_token": body.credential},
        )

    if res.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid Google credential")

    info = res.json()

    # Make sure the token was issued for our app
    if info.get("aud") != settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=401, detail="Token audience mismatch")

    google_sub = info.get("sub")
    email = info.get("email", "").lower()
    name = info.get("name") or email.split("@")[0]
    picture = info.get("picture")

    if not email:
        raise HTTPException(status_code=400, detail="Google account has no email")

    db = get_db()
    now = datetime.datetime.now()

    user = await db.users.find_one({"email": email})

    if user:
        # Update picture in case it changed
        await db.users.update_one(
            {"_id": user["_id"]},
            {"$set": {"picture": picture, "googleSub": google_sub}},
        )
        user_id = str(user["_id"])
        username = user["username"]
        pro = user.get("pro", False)
        created_at = user.get("createdAt", now)
    else:
        doc = {
            "username": name,
            "email": email,
            "passwordHash": None,
            "googleSub": google_sub,
            "picture": picture,
            "pro": False,
            "createdAt": now,
        }
        result = await db.users.insert_one(doc)
        user_id = str(result.inserted_id)
        username = name
        pro = False
        created_at = now

    token = create_access_token(user_id)
    set_auth_cookie(response, token)

    return UserResponse(
        id=user_id,
        username=username,
        email=email,
        picture=picture,
        pro=pro,
        createdAt=created_at,
    )
