import os
import shutil
from pathlib import Path

import psutil

from app.core.config import settings
from app.models.schemas import DiskUsageInfo, MemoryInfo, SystemInfo
from app.services.model_manager import model_manager
from app.services.settings_store import load_settings
from app.services.transcription import TranscriptionService


def _dir_size_bytes(path: Path) -> int:
    if not path.exists():
        return 0
    total = 0
    for root, _dirs, files in os.walk(path):
        for name in files:
            try:
                total += (Path(root) / name).stat().st_size
            except OSError:
                pass
    return total


def _bytes_to_mb(value: int) -> float:
    return round(value / (1024 * 1024), 1)


def get_disk_usage() -> DiskUsageInfo:
    models_bytes = _dir_size_bytes(settings.models_dir)
    exports_bytes = _dir_size_bytes(settings.exports_dir)
    cache_bytes = _dir_size_bytes(settings.data_dir / "cache")
    database_bytes = _dir_size_bytes(settings.database_dir)
    logs_bytes = _dir_size_bytes(settings.logs_dir)
    temp_bytes = _dir_size_bytes(settings.temp_dir)
    total_data = models_bytes + exports_bytes + cache_bytes + database_bytes + logs_bytes + temp_bytes

    disk = shutil.disk_usage(settings.data_dir)
    return DiskUsageInfo(
        models_mb=_bytes_to_mb(models_bytes),
        exports_mb=_bytes_to_mb(exports_bytes),
        cache_mb=_bytes_to_mb(cache_bytes),
        database_mb=_bytes_to_mb(database_bytes),
        logs_mb=_bytes_to_mb(logs_bytes),
        temp_mb=_bytes_to_mb(temp_bytes),
        total_data_mb=_bytes_to_mb(total_data),
        disk_free_mb=_bytes_to_mb(disk.free),
        disk_total_mb=_bytes_to_mb(disk.total),
    )


def get_memory_info() -> MemoryInfo:
    vm = psutil.virtual_memory()
    process = psutil.Process()
    return MemoryInfo(
        ram_used_mb=_bytes_to_mb(vm.used),
        ram_total_mb=_bytes_to_mb(vm.total),
        ram_percent=vm.percent,
        process_memory_mb=_bytes_to_mb(process.memory_info().rss),
    )


def get_system_info() -> SystemInfo:
    app_settings = load_settings()
    transcription = TranscriptionService.get_instance()
    device = transcription.get_resolved_device()
    gpu_name = transcription.get_gpu_name()

    downloaded = [
        m.id for m in model_manager.list_models_with_status(app_settings.model) if m.downloaded
    ]

    return SystemInfo(
        app_version=settings.version,
        data_dir=str(settings.data_dir),
        models_dir=str(settings.models_dir),
        active_model=app_settings.model,
        loaded_model=transcription.get_loaded_model_name(),
        model_in_memory=transcription.is_model_loaded(),
        downloaded_models=downloaded,
        device=device,
        compute_type=app_settings.compute_type,
        gpu_name=gpu_name,
        disk=get_disk_usage(),
        memory=get_memory_info(),
        cpu_percent=psutil.cpu_percent(interval=0.1),
    )