from fastapi import APIRouter, HTTPException

from app.core.config import settings
from app.core.database import db
from app.models.schemas import (
    ActivityLogEntry,
    CreateJobRequest,
    HealthResponse,
    JobStatus,
    SystemStats,
    TranscriptionJob,
)
from app.services.job_manager import job_manager
from app.services.settings_store import load_settings
from app.services.system_stats import get_system_stats

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok", version=settings.version)


@router.get("/jobs", response_model=list[TranscriptionJob])
async def list_jobs() -> list[TranscriptionJob]:
    return await db.list_jobs()


@router.get("/jobs/{job_id}", response_model=TranscriptionJob)
async def get_job(job_id: str) -> TranscriptionJob:
    job = await db.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("/jobs", response_model=TranscriptionJob)
async def create_job(request: CreateJobRequest) -> TranscriptionJob:
    from pathlib import Path

    file_path = Path(request.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=400, detail="File does not exist")

    app_settings = load_settings()
    job = await db.create_job(
        file_path=str(file_path),
        file_name=file_path.name,
        model=request.model or app_settings.model,
        language=request.language or app_settings.language,
    )
    await db.add_activity(f"Queued: {file_path.name}", level="info", job_id=job.id)
    await job_manager.enqueue(job.id)
    return job


@router.post("/jobs/{job_id}/pause", response_model=TranscriptionJob)
async def pause_job(job_id: str) -> TranscriptionJob:
    job = await db.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != JobStatus.RUNNING:
        raise HTTPException(status_code=400, detail="Job is not running")

    job_manager.request_pause(job_id)
    job = await db.update_job(job_id, status=JobStatus.PAUSED)
    await db.add_activity("Pause requested", level="warn", job_id=job_id)
    return job  # type: ignore[return-value]


@router.post("/jobs/{job_id}/resume", response_model=TranscriptionJob)
async def resume_job(job_id: str) -> TranscriptionJob:
    job = await db.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != JobStatus.PAUSED:
        raise HTTPException(status_code=400, detail="Job is not paused")

    job_manager.clear_pause(job_id)
    job = await db.update_job(job_id, status=JobStatus.RUNNING)
    await db.add_activity("Resumed", level="info", job_id=job_id)
    return job  # type: ignore[return-value]


@router.post("/jobs/{job_id}/cancel", response_model=TranscriptionJob)
async def cancel_job(job_id: str) -> TranscriptionJob:
    job = await db.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status in (JobStatus.COMPLETED, JobStatus.CANCELLED):
        raise HTTPException(status_code=400, detail="Job cannot be cancelled")

    job_manager.request_cancel(job_id)
    job = await db.update_job(job_id, status=JobStatus.CANCELLED)
    await db.add_activity("Cancelled", level="warn", job_id=job_id)
    return job  # type: ignore[return-value]


@router.post("/jobs/{job_id}/retry", response_model=TranscriptionJob)
async def retry_job(job_id: str) -> TranscriptionJob:
    job = await db.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != JobStatus.FAILED:
        raise HTTPException(status_code=400, detail="Only failed jobs can be retried")

    from app.models.schemas import JobProgress

    job = await db.update_job(
        job_id,
        status=JobStatus.QUEUED,
        progress=JobProgress(),
        clear_error=True,
    )
    await db.add_activity("Retry queued", level="info", job_id=job_id)
    await job_manager.enqueue(job_id)
    return job  # type: ignore[return-value]


@router.get("/activity", response_model=list[ActivityLogEntry])
async def get_activity(job_id: str | None = None) -> list[ActivityLogEntry]:
    return await db.get_activity(job_id=job_id)


@router.get("/system/stats", response_model=SystemStats)
async def system_stats() -> SystemStats:
    return SystemStats(**get_system_stats())