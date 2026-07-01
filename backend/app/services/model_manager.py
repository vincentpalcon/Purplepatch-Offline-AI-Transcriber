import os
import shutil
import threading
from pathlib import Path

from app.core.config import settings
from app.models.schemas import ModelDownloadStatus, ModelWithStatus
from app.services.model_catalog import get_model_by_id, get_model_catalog
from app.services.settings_store import load_settings


class ModelManager:
    _instance: "ModelManager | None" = None
    _lock = threading.Lock()

    def __init__(self) -> None:
        self._download_lock = threading.Lock()
        self._download_status = ModelDownloadStatus()

    @classmethod
    def get_instance(cls) -> "ModelManager":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def _model_dir(self, model_id: str) -> Path:
        return settings.models_dir / model_id

    def _legacy_model_dir(self) -> Path:
        return settings.models_dir

    def _has_model_files(self, directory: Path) -> bool:
        return (directory / "model.bin").is_file()

    def _resolve_model_dir(self, model_id: str) -> Path | None:
        per_model_dir = self._model_dir(model_id)
        if self._has_model_files(per_model_dir):
            return per_model_dir

        # Backward compatibility: older builds downloaded into models/ root.
        legacy = self._legacy_model_dir()
        if self._has_model_files(legacy):
            active = self._read_active_model_marker()
            if active == model_id or active is None:
                return legacy

        return None

    def _read_active_model_marker(self) -> str | None:
        marker = settings.models_dir / ".active_model"
        if marker.is_file():
            return marker.read_text(encoding="utf-8").strip() or None
        return None

    def _write_active_model_marker(self, model_id: str) -> None:
        settings.ensure_dirs()
        marker = settings.models_dir / ".active_model"
        marker.write_text(model_id, encoding="utf-8")

    def is_downloaded(self, model_id: str) -> bool:
        return self._resolve_model_dir(model_id) is not None

    def get_model_path(self, model_id: str) -> Path | None:
        return self._resolve_model_dir(model_id)

    def get_local_size_mb(self, model_id: str) -> float | None:
        model_dir = self._resolve_model_dir(model_id)
        if not model_dir:
            return None

        total_bytes = 0
        for root, _dirs, files in os.walk(model_dir):
            for name in files:
                try:
                    total_bytes += (Path(root) / name).stat().st_size
                except OSError:
                    pass
        return round(total_bytes / (1024 * 1024), 1)

    def list_models_with_status(self, active_model: str) -> list[ModelWithStatus]:
        result: list[ModelWithStatus] = []
        for model in get_model_catalog():
            downloaded = self.is_downloaded(model.id)
            result.append(
                ModelWithStatus(
                    **model.model_dump(),
                    downloaded=downloaded,
                    is_active=active_model == model.id,
                    local_size_mb=self.get_local_size_mb(model.id) if downloaded else None,
                )
            )
        return result

    def get_download_status(self) -> ModelDownloadStatus:
        status = self._download_status.model_copy()
        if status.status == "downloading" and status.model_id:
            catalog = get_model_by_id(status.model_id)
            local_mb = self.get_local_size_mb(status.model_id) or 0
            if catalog and catalog.size_mb > 0:
                status.progress_percent = min(
                    99.0, round((local_mb / catalog.size_mb) * 100, 1)
                )
                status.message = (
                    f"Downloading {status.model_id}... "
                    f"{local_mb:.0f} / {catalog.size_mb} MB"
                )
        return status

    def start_download(self, model_id: str) -> ModelDownloadStatus:
        if not get_model_by_id(model_id):
            raise ValueError(f"Unknown model: {model_id}")

        with self._download_lock:
            if self._download_status.status == "downloading":
                raise RuntimeError(
                    f"Already downloading {self._download_status.model_id}"
                )
            self._download_status = ModelDownloadStatus(
                status="downloading",
                model_id=model_id,
                progress_percent=0,
                message="Starting download...",
            )

        thread = threading.Thread(
            target=self._download_worker,
            args=(model_id,),
            daemon=True,
        )
        thread.start()
        return self.get_download_status()

    def _download_worker(self, model_id: str) -> None:
        try:
            from faster_whisper.utils import download_model

            settings.ensure_dirs()
            model_dir = self._model_dir(model_id)
            model_dir.mkdir(parents=True, exist_ok=True)

            with self._download_lock:
                self._download_status.message = (
                    f"Downloading {model_id} from Hugging Face..."
                )

            download_model(
                model_id,
                output_dir=str(model_dir),
                local_files_only=False,
            )

            if not self._has_model_files(model_dir):
                raise RuntimeError(
                    f"Download finished but model files were not found in {model_dir}"
                )

            self._write_active_model_marker(model_id)

            with self._download_lock:
                self._download_status = ModelDownloadStatus(
                    status="completed",
                    model_id=model_id,
                    progress_percent=100,
                    message=f"{model_id} downloaded successfully",
                )
        except Exception as exc:
            with self._download_lock:
                self._download_status = ModelDownloadStatus(
                    status="error",
                    model_id=model_id,
                    progress_percent=0,
                    message="Download failed",
                    error=str(exc),
                )


    def delete_model(self, model_id: str) -> None:
        if not get_model_by_id(model_id):
            raise ValueError(f"Unknown model: {model_id}")

        with self._download_lock:
            if (
                self._download_status.status == "downloading"
                and self._download_status.model_id == model_id
            ):
                raise RuntimeError(f"Cannot delete {model_id} while it is downloading.")

        model_dir = self._model_dir(model_id)
        if model_dir.exists():
            shutil.rmtree(model_dir)

        if load_settings().model == model_id:
            from app.services.transcription import TranscriptionService

            TranscriptionService.get_instance().unload_model()

    def migrate_legacy_downloads(self) -> None:
        """Move flat models/ downloads from older builds into per-model folders."""
        legacy = self._legacy_model_dir()
        if not self._has_model_files(legacy):
            return

        model_id = self._read_active_model_marker() or "large-v3"
        target = self._model_dir(model_id)
        if self._has_model_files(target):
            return

        target.mkdir(parents=True, exist_ok=True)
        for item in legacy.iterdir():
            if item.name in {".gitkeep", ".active_model", ".cache"} or item.is_dir():
                continue
            destination = target / item.name
            if not destination.exists():
                item.rename(destination)

        self._write_active_model_marker(model_id)


model_manager = ModelManager.get_instance()