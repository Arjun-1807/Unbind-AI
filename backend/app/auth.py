from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request, Response
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import get_settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(user_id: str) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    expire = now + timedelta(days=settings.JWT_EXPIRE_DAYS)
    # ``purpose`` is what stops a token minted for some other job (e.g. the
    # emailed unsubscribe link) from being replayed as a session credential.
    # ``get_current_user_id`` accepts nothing but purpose="session".
    payload = {"userId": user_id, "purpose": "session", "iat": now, "exp": expire}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    settings = get_settings()
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except JWTError as e:
        raise HTTPException(status_code=401, detail="Not authenticated") from e


def _cookie_security() -> tuple[bool, str]:
    """Return ``(secure, samesite)`` for the auth cookie.

    Driven solely by the declared ``ENVIRONMENT`` rather than sniffed from
    ``FRONTEND_URL`` or ``X-Forwarded-Proto``: a misconfigured/absent
    ``FRONTEND_URL`` used to silently downgrade a production deploy to a
    non-Secure cookie. Production is cross-site (frontend and API on different
    origins), so it needs ``SameSite=None`` — which browsers only honour with
    ``Secure``. Local dev is same-site over plain HTTP, so ``lax``/non-Secure.
    """
    if get_settings().ENVIRONMENT == "production":
        return True, "none"
    return False, "lax"


def set_auth_cookie(response: Response, token: str, request: Request | None = None) -> None:
    settings = get_settings()
    secure, samesite = _cookie_security()
    response.set_cookie(
        key=settings.COOKIE_NAME,
        value=token,
        httponly=True,
        samesite=samesite,
        secure=secure,
        path="/",
        max_age=settings.JWT_EXPIRE_DAYS * 86400,
    )


def clear_auth_cookie(response: Response, request: Request | None = None) -> None:
    settings = get_settings()
    secure, samesite = _cookie_security()
    response.delete_cookie(
        key=settings.COOKIE_NAME,
        path="/",
        secure=secure,
        samesite=samesite,
    )


def get_token_from_request(request: Request) -> str | None:
    settings = get_settings()
    # Try cookie first
    token = request.cookies.get(settings.COOKIE_NAME)
    if token:
        return token
    # Fallback to Authorization header
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        return auth_header[7:]
    return None


async def get_current_user_id(request: Request) -> str:
    token = get_token_from_request(request)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_access_token(token)
    # Only tokens minted as sessions authenticate. Other token types we sign
    # (e.g. unsubscribe links, which travel in email URLs and get logged by
    # every proxy in between) must never be usable as a Bearer credential.
    # Tokens issued before this claim existed have no ``purpose`` and are
    # rejected here — that logs everyone out once, by design.
    if payload.get("purpose") != "session":
        raise HTTPException(status_code=401, detail="Not authenticated")
    user_id = payload.get("userId")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user_id
