from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request, Response
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import get_settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Sessions slide: ``GET /auth/me`` mints a fresh token on every call, so a token
# captured once could otherwise be kept alive forever by polling that endpoint.
# ``sst`` (session start time) is stamped when a session first begins and is
# carried forward *unchanged* through every re-issue, which puts a hard ceiling
# on how far the sliding expiry can move. Lives here rather than in Settings so
# it can't be weakened by an env var. This is not revocation — a stolen token is
# still valid until it lapses — it only bounds the damage in time.
JWT_ABSOLUTE_EXPIRE_DAYS = 30


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(user_id: str, session_start: datetime | None = None) -> str:
    """Mint a session token.

    Pass ``session_start`` when re-issuing an existing session (see
    ``session_start_from_payload``) so the absolute ceiling is inherited rather
    than reset; omit it to begin a new session at ``now``.
    """
    settings = get_settings()
    now = datetime.now(timezone.utc)
    started = session_start or now
    # The sliding window, clamped to the absolute ceiling: renewing can extend
    # the token up to JWT_EXPIRE_DAYS out, but never past the session's own
    # 30-day deadline. Re-issuing at or after the ceiling yields an already-dead
    # token, which is the intended "refuse to renew".
    expire = min(
        now + timedelta(days=settings.JWT_EXPIRE_DAYS),
        started + timedelta(days=JWT_ABSOLUTE_EXPIRE_DAYS),
    )
    # ``purpose`` is what stops a token minted for some other job (e.g. the
    # emailed unsubscribe link) from being replayed as a session credential.
    # ``get_current_user_id`` accepts nothing but purpose="session".
    payload = {
        "userId": user_id,
        "purpose": "session",
        "iat": now,
        "sst": int(started.timestamp()),
        "exp": expire,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def session_start_from_payload(payload: dict) -> datetime:
    """When the session behind ``payload`` began, for carrying into a re-issue.

    Tokens minted before ``sst`` existed (and any token with a garbage value)
    are treated as starting *now*: rejecting them instead would log every live
    session out, and the worst case is that one already-issued token gets a
    fresh 30-day ceiling once.
    """
    sst = payload.get("sst")
    if sst is None:
        return datetime.now(timezone.utc)
    try:
        return datetime.fromtimestamp(float(sst), timezone.utc)
    except (TypeError, ValueError, OSError, OverflowError):
        return datetime.now(timezone.utc)


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


async def get_current_session(request: Request) -> dict:
    """Validate the request's session token and return its claims.

    Routes that only need the caller's identity should use
    ``get_current_user_id``; ``/auth/me`` needs the claims themselves so it can
    carry ``sst`` into the token it re-issues.
    """
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
    # Belt-and-braces on the ceiling: ``exp`` is already clamped at mint time,
    # but a token whose session started over 30 days ago is dead regardless of
    # what its ``exp`` says. Only enforced when ``sst`` is present, so
    # pre-existing tokens keep working.
    if payload.get("sst") is not None:
        deadline = session_start_from_payload(payload) + timedelta(days=JWT_ABSOLUTE_EXPIRE_DAYS)
        if datetime.now(timezone.utc) >= deadline:
            raise HTTPException(status_code=401, detail="Session expired, please sign in again")
    return payload


async def get_current_user_id(request: Request) -> str:
    return (await get_current_session(request))["userId"]
