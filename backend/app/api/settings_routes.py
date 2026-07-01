from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    AppSettings,
    ModelDownloadStatus,
    ModelWithStatus,
    OutputFormatOption,
    SystemInfo,
    UpdateSettingsRequest,
)
from app.services.model_catalog import get_model_by_id
from app.services.model_manager import model_manager
from app.services.settings_store import load_settings, save_settings, update_settings
from app.services.system_info import get_system_info
from app.services.transcription import TranscriptionService

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/", response_model=AppSettings)
async def get_settings() -> AppSettings:
    return load_settings()


@router.put("/", response_model=AppSettings)
async def put_settings(request: UpdateSettingsRequest) -> AppSettings:
    updates = request.model_dump(exclude_unset=True)
    if not updates:
        return load_settings()

    if "model" in updates:
        model = get_model_by_id(updates["model"])
        if not model:
            raise HTTPException(status_code=400, detail="Unknown model")

    if updates.get("export_dir"):
        from pathlib import Path

        export_path = Path(updates["export_dir"])
        try:
            export_path.mkdir(parents=True, exist_ok=True)
            probe = export_path / ".write_test"
            probe.touch()
            probe.unlink()
        except OSError as exc:
            raise HTTPException(
                status_code=400, detail=f"Folder is not writable: {exc}"
            ) from exc

    current = load_settings()
    updated = current.model_copy(update=updates)
    saved = save_settings(updated)

    if "model" in updates or "device" in updates or "compute_type" in updates:
        TranscriptionService.get_instance().unload_model()

    return saved


@router.get("/output-formats", response_model=list[OutputFormatOption])
async def get_output_formats() -> list[OutputFormatOption]:
    return [
        OutputFormatOption(
            id="txt",
            label="Plain Text (.txt)",
            available=True,
            description="Simple text transcript, one segment per line.",
        ),
        OutputFormatOption(
            id="srt",
            label="SubRip (.srt)",
            available=False,
            description="Subtitles with timestamps. Coming in a future update.",
        ),
        OutputFormatOption(
            id="vtt",
            label="WebVTT (.vtt)",
            available=False,
            description="Web video text tracks. Coming in a future update.",
        ),
        OutputFormatOption(
            id="json",
            label="JSON (.json)",
            available=False,
            description="Structured transcript with metadata. Coming in a future update.",
        ),
    ]


@router.get("/models", response_model=list[ModelWithStatus])
async def list_models() -> list[ModelWithStatus]:
    app_settings = load_settings()
    return model_manager.list_models_with_status(app_settings.model)


@router.post("/models/{model_id}/download", response_model=ModelDownloadStatus)
async def download_model(model_id: str) -> ModelDownloadStatus:
    if not get_model_by_id(model_id):
        raise HTTPException(status_code=404, detail="Model not found")

    try:
        return model_manager.start_download(model_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/models/download-status", response_model=ModelDownloadStatus)
async def download_status() -> ModelDownloadStatus:
    return model_manager.get_download_status()


@router.get("/system-info", response_model=SystemInfo)
async def system_info() -> SystemInfo:
    return get_system_info()