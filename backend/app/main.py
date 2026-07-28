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


app = FastAPI(
    title="UnBind AI Backend",
    description="AI-powered legal contract analyser",
    version="1.0.0",
    lifespan=lifespan,
)

settings = get_settings()

# Only this project's known origins are allowed by default: the configured
# production frontend plus localhost for dev. The broad "*.vercel.app" match is
# opt-in via VERCEL_PREVIEW_REGEX so anonymous Vercel apps can't hit the API.
allowed_origins = list(dict.fromkeys([settings.FRONTEND_URL, "http://localhost:3000"]))

cors_kwargs = {
    "allow_origins": allowed_origins,
    "allow_credentials": True,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
}
if settings.VERCEL_PREVIEW_REGEX:
    cors_kwargs["allow_origin_regex"] = settings.VERCEL_PREVIEW_REGEX

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
