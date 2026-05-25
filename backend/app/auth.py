from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import HTTPException, Request, Response
from app.config import get_settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(user_id: str) -> str:
    settings = get_settings()
    expire = datetime.now(timezone.utc) + timedelta(days=settings.JWT_EXPIRE_DAYS)
    payload = {"userId": user_id, "exp": expire}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    settings = get_settings()
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Not authenticated")


def _is_local_dev(request: Request | None = None) -> bool:
    """Check if we are running in local development mode.
    
    When a *request* is available we also inspect the ``X-Forwarded-Proto``
    header that reverse-proxies such as Vercel inject.  If the original
    request was over HTTPS we know we are **not** in local dev even when
    ``FRONTEND_URL`` still points to localhost (a common misconfiguration).
    """
    if request is not None:
        proto = request.headers.get("x-forwarded-proto", "")
        if "https" in proto:
            return False
    settings = get_settings()
    return settings.FRONTEND_URL.startswith("http://localhost") or settings.FRONTEND_URL.startswith("http://127.0.0.1")


def set_auth_cookie(response: Response, token: str, request: Request | None = None) -> None:
    settings = get_settings()
    local = _is_local_dev(request)
    response.set_cookie(
        key=settings.COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax" if local else "none",
        secure=not local,
        path="/",
        max_age=settings.JWT_EXPIRE_DAYS * 86400,
    )


def clear_auth_cookie(response: Response, request: Request | None = None) -> None:
    settings = get_settings()
    local = _is_local_dev(request)
    response.delete_cookie(
        key=settings.COOKIE_NAME,
        path="/",
        secure=not local,
        samesite="lax" if local else "none",
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
    user_id = payload.get("userId")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user_id
