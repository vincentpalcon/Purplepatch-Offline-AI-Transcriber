from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    AppSettings,
    DiarizationDownloadStatus,
    DiarizationStatus,
    ModelDownloadStatus,
    ModelWithStatus,
    OutputFormatOption,
    SystemInfo,
    UpdateSettingsRequest,
)
from app.services.diarization import (
    ESTIMATED_SIZE_MB,
    DiarizationError,
    DiarizationService,
    PIPELINE_ID,
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

    if "huggingface_token" in updates or "device" in updates:
        DiarizationService.get_instance().unload_pipeline()

    return saved


def _build_diarization_status() -> DiarizationStatus:
    app_settings = load_settings()
    service = DiarizationService.get_instance()
    token_configured = bool(
        app_settings.huggingface_token and app_settings.huggingface_token.strip()
    )
    downloaded = service.is_downloaded()

    if not service.is_pyannote_installed():
        return DiarizationStatus(
            pyannote_installed=False,
            token_configured=token_configured,
            downloaded=False,
            pipeline_loaded=False,
            pipeline_id=PIPELINE_ID,
            estimated_size_mb=ESTIMATED_SIZE_MB,
            message="pyannote.audio is not installed in the backend environment.",
        )

    if not token_configured:
        return DiarizationStatus(
            pyannote_installed=True,
            token_configured=False,
            downloaded=downloaded,
            pipeline_loaded=False,
            pipeline_id=PIPELINE_ID,
            local_size_mb=service.get_local_size_mb() or None,
            estimated_size_mb=ESTIMATED_SIZE_MB,
            message=(
                "Add your Hugging Face token in Settings → Models, accept the model terms at "
                "huggingface.co/pyannote/speaker-diarization-community-1, then download."
            ),
        )

    if not downloaded:
        return DiarizationStatus(
            pyannote_installed=True,
            token_configured=True,
            downloaded=False,
            pipeline_loaded=False,
            pipeline_id=PIPELINE_ID,
            local_size_mb=service.get_local_size_mb() or None,
            estimated_size_mb=ESTIMATED_SIZE_MB,
            message="Download diarization models in Settings → Models before transcribing.",
        )

    return DiarizationStatus(
        pyannote_installed=True,
        token_configured=True,
        downloaded=True,
        pipeline_loaded=service.is_pipeline_loaded(),
        pipeline_id=PIPELINE_ID,
        local_size_mb=service.get_local_size_mb() or None,
        estimated_size_mb=ESTIMATED_SIZE_MB,
        device=service.get_resolved_device(),
        message="pyannote speaker diarization is ready.",
    )


@router.get("/diarization-status", response_model=DiarizationStatus)
async def get_diarization_status() -> DiarizationStatus:
    return _build_diarization_status()


@router.post("/diarization/download", response_model=DiarizationDownloadStatus)
async def download_diarization_models() -> DiarizationDownloadStatus:
    app_settings = load_settings()
    service = DiarizationService.get_instance()

    try:
        return service.start_download(
            app_settings.huggingface_token or "",
            device_pref=app_settings.device,
        )
    except DiarizationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/diarization/download-status", response_model=DiarizationDownloadStatus)
async def diarization_download_status() -> DiarizationDownloadStatus:
    return DiarizationService.get_instance().get_download_status()


@router.delete("/diarization/models")
async def delete_diarization_models() -> dict[str, str]:
    service = DiarizationService.get_instance()
    try:
        service.delete_models()
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"status": "deleted"}


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


@router.delete("/models/{model_id}")
async def delete_model(model_id: str) -> dict[str, str]:
    if not get_model_by_id(model_id):
        raise HTTPException(status_code=404, detail="Model not found")

    try:
        model_manager.delete_model(model_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return {"status": "deleted", "model_id": model_id}


@router.get("/models/download-status", response_model=ModelDownloadStatus)
async def download_status() -> ModelDownloadStatus:
    return model_manager.get_download_status()


@router.get("/system-info", response_model=SystemInfo)
async def system_info() -> SystemInfo:
    return get_system_info()