import shutil

import psutil

from app.core.config import settings


def _bytes_to_mb(value: int) -> float:
    return round(value / (1024 * 1024), 1)


def get_system_stats() -> dict:
    cpu = psutil.cpu_percent(interval=None)
    memory = psutil.virtual_memory()
    disk = shutil.disk_usage(settings.data_dir)

    gpu_percent = None
    gpu_name = None

    try:
        import ctranslate2

        if ctranslate2.get_cuda_device_count() > 0:
            gpu_name = "CUDA GPU"
    except Exception:
        pass

    disk_total_mb = _bytes_to_mb(disk.total)
    disk_free_mb = _bytes_to_mb(disk.free)
    disk_used_percent = round((1 - disk.free / disk.total) * 100, 1) if disk.total else 0.0

    return {
        "cpu_percent": cpu,
        "ram_percent": memory.percent,
        "ram_used_mb": _bytes_to_mb(memory.used),
        "ram_total_mb": _bytes_to_mb(memory.total),
        "disk_used_percent": disk_used_percent,
        "disk_free_mb": disk_free_mb,
        "disk_total_mb": disk_total_mb,
        "gpu_percent": gpu_percent,
        "gpu_name": gpu_name,
    }