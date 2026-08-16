from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel
from pymongo.errors import DuplicateKeyError

from app.auth import (
    clear_auth_cookie,
    create_access_token,
    get_current_session,
    get_current_user_id,
    hash_password,
    session_start_from_payload,
    set_auth_cookie,
    verify_password,
)
from app.config import get_settings
from app.database import get_db
from app.schemas import LoginRequest, SignupRequest, UpdatePasswordRequest, UserResponse
from app.services.model_selector import select_model
from app.services.plan_service import effective_plan

router = APIRouter(prefix="/auth", tags=["auth"])

# Login returns the same message whether the email is unknown or the password is
# wrong, but that is only half the story: bcrypt costs ~250x a failed lookup, so
# *timing* alone reveals which emails are registered. Every failing branch is
# compared against this throwaway hash so the work done is the same either way.
# Computed once at import (bcrypt is deliberately slow).
_DUMMY_PASSWORD_HASH = hash_password("dummy-password-for-timing")

# Google's tokeninfo endpoint reports these for a genuine ID token.
_GOOGLE_ISSUERS = ("accounts.google.com", "https://accounts.google.com")


class GoogleLoginRequest(BaseModel):
    credential: str


@router.post("/signup", response_model=UserResponse)
async def signup(body: SignupRequest, request: Request, response: Response):
    db = get_db()
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    password_hash = hash_password(body.password)
    now = datetime.now(timezone.utc)
    doc = {
        "username": body.username,
        "email": body.email.lower(),
        "passwordHash": password_hash,
        "picture": None,
        "createdAt": now,
    }
    try:
        result = await db.users.insert_one(doc)
    except DuplicateKeyError as e:
        # The find_one above is a fast path, not a guarantee: two concurrent
        # signups can both pass it. The unique index on users.email is what
        # actually prevents the duplicate, and this turns it into the same 409.
        raise HTTPException(
            status_code=409, detail="An account with this email already exists"
        ) from e
    user_id = str(result.inserted_id)

    token = create_access_token(user_id)
    set_auth_cookie(response, token, request)

    return UserResponse(
        id=user_id,
        username=body.username,
        email=body.email.lower(),
        pro=False,
        aiModel=select_model(doc),
        accessToken=token,
        createdAt=now,
    )


@router.post("/login", response_model=UserResponse)
async def login(body: LoginRequest, request: Request, response: Response):
    db = get_db()
    user = await db.users.find_one({"email": body.email.lower()})

    # A Google-only account has passwordHash = None; it must not be loggable via
    # password, and must not crash verify_password either.
    stored_hash = user.get("passwordHash") if user else None
    if not stored_hash:
        # Spend the same bcrypt time as a real check before failing, so an
        # unknown (or password-less) email is not distinguishable by latency.
        verify_password(body.password, _DUMMY_PASSWORD_HASH)
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not verify_password(body.password, stored_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user_id = str(user["_id"])
    plan = effective_plan(user)
    token = create_access_token(user_id)
    set_auth_cookie(response, token, request)

    return UserResponse(
        id=user_id,
        username=user["username"],
        email=user["email"],
        picture=user.get("picture"),
        # Derived from effective_plan, not the stored ``pro`` flag: nothing
        # resets ``pro`` when a time-limited plan lapses, so returning it raw
        # left the frontend showing Pro UI to expired subscribers until a
        # request 403'd. Same source of truth as GET /plan and the rate limiter.
        pro=bool(plan),
        plan=plan,
        aiModel=select_model(user),
        accessToken=token,
        createdAt=user.get("createdAt"),
    )


@router.post("/logout")
async def logout(request: Request, response: Response):
    clear_auth_cookie(response, request)
    return {"ok": True}


@router.get("/me", response_model=UserResponse)
async def me(request: Request):
    payload = await get_current_session(request)
    user_id = payload["userId"]
    db = get_db()
    from bson import ObjectId

    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # This endpoint slides the session forward on every call. Carry the original
    # session start into the new token so renewal can't outrun the absolute
    # ceiling — otherwise a captured token stays alive forever by polling here.
    token = create_access_token(user_id, session_start=session_start_from_payload(payload))
    # See the note in login(): the stored ``pro``/``plan`` fields go stale when a
    # time-limited plan lapses, so report what effective_plan says instead.
    plan = effective_plan(user)
    return UserResponse(
        id=str(user["_id"]),
        username=user["username"],
        email=user["email"],
        picture=user.get("picture"),
        pro=bool(plan),
        plan=plan,
        aiModel=select_model(user),
        createdAt=user.get("createdAt"),
        accessToken=token,
    )


@router.post("/update-password")
async def update_password(body: UpdatePasswordRequest, request: Request):
    user_id = await get_current_user_id(request)
    db = get_db()
    from bson import ObjectId

    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Verify current password. A Google-only account has no passwordHash, so
    # compare against the dummy hash rather than handing None to bcrypt.
    if not verify_password(body.currentPassword, user.get("passwordHash") or _DUMMY_PASSWORD_HASH):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    # The length policy for newPassword lives in UpdatePasswordRequest (a 422),
    # so it cannot drift from the signup policy. No second check here.

    # Hash and update password
    new_password_hash = hash_password(body.newPassword)
    await db.users.update_one(
        {"_id": ObjectId(user_id)}, {"$set": {"passwordHash": new_password_hash}}
    )

    return {"ok": True, "message": "Password updated successfully"}


@router.post("/google", response_model=UserResponse)
async def google_login(body: GoogleLoginRequest, request: Request, response: Response):
    settings = get_settings()

    # Verify the Google ID token with Google's tokeninfo endpoint
    async with httpx.AsyncClient(timeout=5.0) as client:
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

    # ...and that Google itself issued it.
    if info.get("iss") not in _GOOGLE_ISSUERS:
        raise HTTPException(status_code=401, detail="Invalid Google credential")

    # An unverified email claim is attacker-controlled: anyone can put a
    # victim's address on a Google account they own. Without this check the
    # email-matching below would hand them the victim's account.
    # tokeninfo returns this as the string "true", not a bool.
    if info.get("email_verified") not in (True, "true"):
        raise HTTPException(status_code=401, detail="Google email not verified")

    google_sub = info.get("sub")
    email = info.get("email", "").lower()
    name = info.get("name") or email.split("@")[0]
    picture = info.get("picture")

    if not email:
        raise HTTPException(status_code=400, detail="Google account has no email")
    if not google_sub:
        raise HTTPException(status_code=401, detail="Invalid Google credential")

    db = get_db()
    now = datetime.now(timezone.utc)

    # The Google subject is the stable identity; the email is not (it can be
    # changed on the Google side, and matching on it alone is what allowed the
    # takeover). Look up by sub first and only fall back to email.
    user = await db.users.find_one({"googleSub": google_sub})
    if not user:
        user = await db.users.find_one({"email": email})

    if user:
        # Linking onto an existing password account is gated on the verified
        # email check above, not refused outright. What made this a takeover was
        # trusting an *unverified* email claim: anyone could put a victim's
        # address on a Google account they owned. A verified claim means Google
        # confirmed control of that mailbox, which is the same assurance a
        # password-reset email carries — so it is sufficient to link, and it
        # keeps the Google button working for users who signed up with a
        # password. Do not relax the email_verified check above without
        # revisiting this.
        #
        # Update picture in case it changed.
        await db.users.update_one(
            {"_id": user["_id"]},
            {"$set": {"picture": picture, "googleSub": google_sub}},
        )
        user_id = str(user["_id"])
        username = user["username"]
        email = user["email"]
        # effective_plan, not the raw ``pro`` flag — see login().
        pro = bool(effective_plan(user))
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
        try:
            result = await db.users.insert_one(doc)
        except DuplicateKeyError as e:
            # Two concurrent first-time logins for the same Google account: the
            # unique index on users.email rejects the loser. Adopt the record
            # the winner just created instead of 500ing.
            user = await db.users.find_one({"email": email})
            if not user or (user.get("passwordHash") and user.get("googleSub") != google_sub):
                # Whatever now owns this email is not this Google identity, so
                # the same refusal as the linking check above applies.
                raise HTTPException(
                    status_code=409,
                    detail=(
                        "An account with this email already exists. Sign in with your "
                        "password, then link Google from your account settings."
                    ),
                ) from e
            user_id = str(user["_id"])
            username = user["username"]
            pro = bool(effective_plan(user))
            created_at = user.get("createdAt", now)
        else:
            user_id = str(result.inserted_id)
            username = name
            pro = False
            created_at = now

    token = create_access_token(user_id)
    set_auth_cookie(response, token, request)

    return UserResponse(
        id=user_id,
        username=username,
        email=email,
        picture=picture,
        pro=pro,
        aiModel=select_model(user if user else {"pro": pro}),
        accessToken=token,
        createdAt=created_at,
    )
