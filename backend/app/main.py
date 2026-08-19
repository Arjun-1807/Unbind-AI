import logging
import os
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.database import close_db, connect_db, ping_db
from app.routes.admin_routes import router as admin_router
from app.routes.analysis_routes import router as analysis_router
from app.routes.auth_routes import router as auth_router
from app.routes.lawyer_registration_routes import router as lawyer_registration_router
from app.routes.lawyer_routes import router as lawyer_router
from app.routes.plan_routes import router as plan_router
from app.routes.reminder_routes import router as reminder_router
from app.security_middleware import add_security_middleware

# Without this the root logger sits at WARNING, so every logger.info() in the
# app is discarded and the only production signal is whatever uvicorn prints.
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)


# Baseline response headers for everything this app serves.
#
# The frontend already sets these in next.config.mjs, but that only covers
# traffic proxied through the Next rewrite. Several responses reach the browser
# from the backend origin directly — the HTML unsubscribe page in
# reminder_routes, the SSE analysis stream, the upload endpoints — and those
# were going out bare.
#
# Deliberately no Content-Security-Policy: the unsubscribe page is
# self-contained HTML we serve ourselves and a restrictive default-src here
# would have to be kept in sync with it (and with SSE's connect-src) from a
# place nobody editing that page would look. The three headers below are
# content-independent, so they are safe to apply blanket.
SECURITY_HEADERS = {
    # Stop the browser MIME-sniffing a JSON/text response into something
    # executable — the path by which a user-supplied filename or contract text
    # echoed back could be treated as HTML or script.
    "X-Content-Type-Options": "nosniff",
    # Never leak the API URL (which carries analysis ids) to third-party sites.
    # Note the CSRF check in OriginValidationMiddleware only falls back to
    # Referer when Origin is absent, and browsers always send Origin on
    # cross-site state changes, so suppressing Referer doesn't weaken it.
    "Referrer-Policy": "no-referrer",
    # Nothing here is meant to be framed; this is what keeps the HTML
    # unsubscribe page out of a clickjacking frame.
    "X-Frame-Options": "DENY",
}


class SecurityHeadersMiddleware:
    """Attach :data:`SECURITY_HEADERS` to every response.

    Raw ASGI rather than ``BaseHTTPMiddleware`` so it only rewrites the
    ``http.response.start`` message and never touches the body stream — the SSE
    analysis endpoint must keep flushing chunk by chunk.

    Existing headers are left alone, so a route that deliberately sets its own
    value (or a stricter one) wins.
    """

    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        async def send_with_headers(message):
            if message["type"] == "http.response.start":
                headers = message.setdefault("headers", [])
                present = {name.lower() for name, _ in headers}
                for name, value in SECURITY_HEADERS.items():
                    key = name.lower().encode()
                    if key not in present:
                        headers.append((key, value.encode()))
            await send(message)

        return await self.app(scope, receive, send_with_headers)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await connect_db()
    yield
    # Shutdown
    await close_db()


settings = get_settings()
IS_PRODUCTION = settings.ENVIRONMENT == "production"

# The interactive docs publish the full API surface — every route, parameter and
# schema — which is a free reconnaissance map for an attacker. Useful locally,
# so they stay on in development and are switched off entirely in production.
docs_kwargs: dict = (
    {"docs_url": None, "redoc_url": None, "openapi_url": None} if IS_PRODUCTION else {}
)

app = FastAPI(
    title="UnBind AI Backend",
    description="AI-powered legal contract analyser",
    version="1.0.0",
    lifespan=lifespan,
    **docs_kwargs,
)

# Only this project's known origins are allowed: the configured production
# frontend, plus localhost in development ONLY. Allowing localhost:3000 in
# production is a real hole given the auth cookie is SameSite=None — anything a
# victim happens to be running on port 3000 could make credentialed calls
# against the production API. The broad "*.vercel.app" match stays opt-in via
# VERCEL_PREVIEW_REGEX so anonymous Vercel apps can't hit the API.
origin_candidates = [settings.FRONTEND_URL]
if not IS_PRODUCTION:
    origin_candidates.append("http://localhost:3000")
allowed_origins = list(dict.fromkeys(origin_candidates))

cors_kwargs = {
    "allow_origins": allowed_origins,
    "allow_credentials": True,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
}
if settings.VERCEL_PREVIEW_REGEX:
    cors_kwargs["allow_origin_regex"] = settings.VERCEL_PREVIEW_REGEX

# Order matters, and add_middleware inserts at the front of the stack — so the
# last registration is the outermost layer. Registering the security middleware
# first and CORS second gives: CORS -> rate limit -> Origin/CSRF check -> routes.
# CORS on the outside keeps OPTIONS preflights working and keeps CORS headers on
# 429/403 responses so the real frontend can read the error. The same
# `allowed_origins` list feeds both, so the CORS and CSRF allowlists can't drift.
add_security_middleware(
    app,
    allowed_origins=allowed_origins,
    allow_origin_regex=cors_kwargs.get("allow_origin_regex"),
)
app.add_middleware(CORSMiddleware, **cors_kwargs)
# Registered last and therefore outermost, so the headers land on *every*
# response — including the 403/429/413 the security middleware generates itself
# and the preflight replies CORSMiddleware short-circuits.
app.add_middleware(SecurityHeadersMiddleware)

app.include_router(auth_router, prefix="/api")
app.include_router(analysis_router, prefix="/api")
app.include_router(plan_router, prefix="/api")
app.include_router(lawyer_router, prefix="/api")
app.include_router(lawyer_registration_router, prefix="/api")
app.include_router(reminder_router, prefix="/api")
app.include_router(admin_router, prefix="/api")


@app.get("/api/health")
async def health():
    """Readiness, not just liveness.

    Returning 200 while the database is unreachable makes the check useless for
    routing decisions, so a failed ping answers 503.
    """
    db_ok = await ping_db()
    body = {"ok": db_ok, "database": "up" if db_ok else "down"}
    return JSONResponse(body, status_code=200 if db_ok else 503)


if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=settings.PORT, reload=True)
