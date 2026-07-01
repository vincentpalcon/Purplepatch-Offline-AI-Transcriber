from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.api.settings_routes import router as settings_router
from app.core.config import settings
from app.services.job_manager import job_manager
from app.services.model_manager import model_manager


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.ensure_dirs()
    model_manager.migrate_legacy_downloads()
    await job_manager.start()
    yield
    await job_manager.stop()


app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(settings_router)