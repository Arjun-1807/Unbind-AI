from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from app.config import get_settings
from app.database import connect_db, close_db
from app.routes.auth_routes import router as auth_router
from app.routes.analysis_routes import router as analysis_router
from app.routes.plan_routes import router as plan_router
from app.routes.lawyer_routes import router as lawyer_router

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:3000"],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api")
app.include_router(analysis_router, prefix="/api")
app.include_router(plan_router, prefix="/api")
app.include_router(lawyer_router, prefix="/api")


@app.get("/api/health")
async def health():
    return {"ok": True}


if __name__ == "__main__":

    uvicorn.run("app.main:app", host="0.0.0.0", port=settings.PORT, reload=True)
