import os
import shutil
from pathlib import Path

from faster_whisper.utils import _MODELS as WHISPER_REPOS

from app.core.config import settings

# model.bin must be at least this large or we treat the folder as a failed download.
MIN_MODEL_BIN_BYTES: dict[str, int] = {
    "tiny": 50_000_000,
    "base": 100_000_000,
    "small": 400_000_000,
    "medium": 1_200_000_000,
    "large-v2": 2_000_000_000,
    "large-v3": 2_000_000_000,
    "large-v3-turbo": 1_200_000_000,
}
DEFAULT_MIN_MODEL_BIN_BYTES = 10_000_000

ALLOW_PATTERNS = [
    "config.json",
    "preprocessor_config.json",
    "model.bin",
    "tokenizer.json",
    "vocabulary.*",
]


def resolve_repo_id(model_id: str) -> str:
    repo_id = WHISPER_REPOS.get(model_id)
    if not repo_id:
        raise ValueError(f"Unknown Whisper model: {model_id}")
    return repo_id


def _min_model_bytes(model_id: str) -> int:
    return MIN_MODEL_BIN_BYTES.get(model_id, DEFAULT_MIN_MODEL_BIN_BYTES)


def is_complete_model_dir(directory: Path, model_id: str) -> bool:
    model_bin = directory / "model.bin"
    if not model_bin.is_file():
        return False
    try:
        return model_bin.stat().st_size >= _min_model_bytes(model_id)
    except OSError:
        return False


def _configure_hf_cache() -> Path:
    cache_root = settings.data_dir / "cache" / "huggingface"
    hub_cache = cache_root / "hub"
    cache_root.mkdir(parents=True, exist_ok=True)
    hub_cache.mkdir(parents=True, exist_ok=True)
    os.environ["HF_HOME"] = str(cache_root)
    os.environ["HUGGINGFACE_HUB_CACHE"] = str(hub_cache)
    os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"
    return cache_root


def clean_incomplete_model_dir(directory: Path, model_id: str) -> None:
    if not directory.exists():
        return
    if is_complete_model_dir(directory, model_id):
        return
    shutil.rmtree(directory, ignore_errors=True)


def _remove_local_metadata(directory: Path) -> None:
    cache_meta = directory / ".cache"
    if cache_meta.exists():
        shutil.rmtree(cache_meta, ignore_errors=True)


def download_whisper_model(model_id: str, output_dir: Path) -> Path:
    """Download a Whisper model into a flat folder (Windows-safe, no symlink cache)."""
    from huggingface_hub import snapshot_download

    repo_id = resolve_repo_id(model_id)
    _configure_hf_cache()

    output_dir.parent.mkdir(parents=True, exist_ok=True)
    clean_incomplete_model_dir(output_dir, model_id)

    if is_complete_model_dir(output_dir, model_id):
        return output_dir

    output_dir.mkdir(parents=True, exist_ok=True)

    download_kwargs: dict = {
        "repo_id": repo_id,
        "local_dir": str(output_dir),
        "allow_patterns": ALLOW_PATTERNS,
        "local_dir_use_symlinks": False,
    }

    try:
        snapshot_download(**download_kwargs, resume_download=True)
    except TypeError:
        snapshot_download(**download_kwargs)
    except Exception as exc:
        clean_incomplete_model_dir(output_dir, model_id)
        raise RuntimeError(
            f"Could not download {model_id} from Hugging Face ({repo_id}). "
            "On Windows this is usually a network timeout, firewall, or not enough disk space "
            "(large-v3 needs ~3 GB free). Check your internet connection and try again. "
            f"Details: {exc}"
        ) from exc

    _remove_local_metadata(output_dir)

    if not is_complete_model_dir(output_dir, model_id):
        clean_incomplete_model_dir(output_dir, model_id)
        raise RuntimeError(
            f"Download of {model_id} did not finish correctly (model.bin missing or too small). "
            "Delete the model in Settings → Models, then download again on a stable connection."
        )

    return output_dir