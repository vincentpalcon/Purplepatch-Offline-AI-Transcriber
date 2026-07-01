import os
from pathlib import Path

from pydantic_settings import BaseSettings


def _default_data_dir() -> Path:
    env = os.environ.get("TRANSCRIBE_DATA_DIR")
    if env:
        return Path(env)
    return Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    app_name: str = "Purplepatch Offline AI Transcriber"
    version: str = "0.1.0"
    data_dir: Path = _default_data_dir()
    default_model: str = "base"
    compute_type: str = "int8"
    device: str = "auto"

    @property
    def database_dir(self) -> Path:
        return self.data_dir / "database"

    @property
    def exports_dir(self) -> Path:
        return self.data_dir / "exports"

    @property
    def logs_dir(self) -> Path:
        return self.data_dir / "logs"

    @property
    def temp_dir(self) -> Path:
        return self.data_dir / "temp"

    @property
    def models_dir(self) -> Path:
        root = Path(__file__).resolve().parents[3]
        return root / "models"

    @property
    def db_path(self) -> Path:
        return self.database_dir / "transcribe.db"

    def ensure_dirs(self) -> None:
        for path in [
            self.database_dir,
            self.exports_dir,
            self.logs_dir,
            self.temp_dir,
            self.models_dir,
        ]:
            path.mkdir(parents=True, exist_ok=True)


settings = Settings()