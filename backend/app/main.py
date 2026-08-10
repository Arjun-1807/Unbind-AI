import logging
import os
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.database import close_db, connect_db, ping_db
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

app.include_router(auth_router, prefix="/api")
app.include_router(analysis_router, prefix="/api")
app.include_router(plan_router, prefix="/api")
app.include_router(lawyer_router, prefix="/api")
app.include_router(lawyer_registration_router, prefix="/api")
app.include_router(reminder_router, prefix="/api")


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
