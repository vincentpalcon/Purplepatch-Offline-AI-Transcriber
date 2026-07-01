import json
from pathlib import Path
from threading import Lock

from app.core.config import settings
from app.models.schemas import AppSettings

_lock = Lock()


def _settings_path() -> Path:
    settings.ensure_dirs()
    return settings.data_dir / "settings.json"


def load_settings() -> AppSettings:
    path = _settings_path()
    if path.exists():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            return AppSettings(**data)
        except (json.JSONDecodeError, ValueError):
            pass
    return AppSettings()


def save_settings(app_settings: AppSettings) -> AppSettings:
    with _lock:
        path = _settings_path()
        path.write_text(
            app_settings.model_dump_json(indent=2),
            encoding="utf-8",
        )
    return app_settings


def update_settings(**kwargs) -> AppSettings:
    current = load_settings()
    updated = current.model_copy(update=kwargs)
    return save_settings(updated)