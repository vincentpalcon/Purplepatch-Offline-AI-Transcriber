import os
import shutil
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any

from app.core.config import settings
from app.models.schemas import DiarizationDownloadStatus

if TYPE_CHECKING:
    from pyannote.audio import Pipeline

# pyannote.audio 4.x uses community-1 (better accuracy than legacy 3.1).
PIPELINE_ID = "pyannote/speaker-diarization-community-1"
HF_MODEL_URL = "https://huggingface.co/pyannote/speaker-diarization-community-1"
HF_TOKEN_URL = "https://huggingface.co/settings/tokens"
ESTIMATED_SIZE_MB = 1200.0
DOWNLOAD_COMPLETE_MARKER = "download.complete"


@dataclass(frozen=True)
class SpeakerRegion:
    start: float
    end: float
    speaker: int


class DiarizationError(Exception):
    """Raised when pyannote speaker diarization cannot run."""


def _format_hf_access_error() -> str:
    return (
        "Hugging Face blocked access to the pyannote diarization model. "
        f"1) Save your access token in Settings → Models. "
        f"2) Create a token at {HF_TOKEN_URL}. "
        f"3) Accept the model terms at {HF_MODEL_URL} (click 'Agree and access repository'). "
        "4) Click Download again."
    )


def _wrap_load_error(exc: Exception) -> DiarizationError:
    message = str(exc)
    lower = message.lower()
    if any(
        marker in lower
        for marker in ("gated", "authorized", "403", "401", "could not download")
    ):
        return DiarizationError(_format_hf_access_error())
    return DiarizationError(f"Failed to load pyannote pipeline: {message}")


def _load_waveform(file_path: str) -> dict:
    # pyannote.audio 4.x decodes file paths via torchcodec, which (unlike
    # faster-whisper's PyAV-based decoding) requires a system FFmpeg install
    # with shared libraries -- something this app deliberately doesn't
    # require. Decoding ourselves with the same PyAV path faster-whisper
    # already uses and handing pyannote a waveform dict sidesteps torchcodec
    # entirely (both loading paths are explicitly supported by pyannote).
    import torch
    from faster_whisper.audio import decode_audio

    audio = decode_audio(file_path, sampling_rate=16000)
    waveform = torch.from_numpy(audio).unsqueeze(0)
    return {"waveform": waveform, "sample_rate": 16000}


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


class DiarizationService:
    _instance: "DiarizationService | None" = None
    _lock = threading.Lock()

    def __init__(self) -> None:
        self._pipeline: Pipeline | None = None
        self._loaded_token: str | None = None
        self._resolved_device: str | None = None
        self._download_lock = threading.Lock()
        self._download_status = DiarizationDownloadStatus()

    @classmethod
    def get_instance(cls) -> "DiarizationService":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    @staticmethod
    def is_pyannote_installed() -> bool:
        try:
            import pyannote.audio  # noqa: F401

            return True
        except Exception:
            # Broad on purpose: a broken torch/pyannote install can fail with
            # OSError (missing DLL on Windows), RuntimeError (torch ABI
            # mismatch), etc. -- not just ImportError. Any failure here means
            # diarization isn't usable, which callers treat as optional.
            return False

    def _cache_root(self) -> Path:
        return settings.data_dir / "cache" / "huggingface"

    def _hub_cache_dir(self) -> Path:
        return self._cache_root() / "hub"

    def _pyannote_hub_dirs(self) -> list[Path]:
        hub = self._hub_cache_dir()
        if not hub.is_dir():
            return []
        return sorted(
            path
            for path in hub.iterdir()
            if path.is_dir() and path.name.startswith("models--pyannote--")
        )

    def _marker_path(self) -> Path:
        return settings.data_dir / "cache" / "diarization" / DOWNLOAD_COMPLETE_MARKER

    def get_local_size_mb(self) -> float:
        total = sum(_dir_size_bytes(path) for path in self._pyannote_hub_dirs())
        return round(total / (1024 * 1024), 1)

    def is_downloaded(self) -> bool:
        if self._marker_path().is_file():
            return True

        # Recognize caches from downloads before the completion marker existed.
        repo_cache = (
            self._cache_root() / "hub" / "models--pyannote--speaker-diarization-community-1"
        )
        if repo_cache.exists() and any(repo_cache.rglob("*")):
            marker = self._marker_path()
            marker.parent.mkdir(parents=True, exist_ok=True)
            marker.write_text(PIPELINE_ID, encoding="utf-8")
            return True

        return False

    def _configure_hf_cache(self) -> None:
        cache_root = self._cache_root()
        hub_cache = cache_root / "hub"
        cache_root.mkdir(parents=True, exist_ok=True)
        hub_cache.mkdir(parents=True, exist_ok=True)
        os.environ["HF_HOME"] = str(cache_root)
        os.environ["HUGGINGFACE_HUB_CACHE"] = str(hub_cache)

    def _resolve_torch_device(self, device_pref: str = "auto") -> "Any":
        import torch

        if device_pref == "cuda":
            if not torch.cuda.is_available():
                raise DiarizationError("CUDA was requested but no GPU is available.")
            self._resolved_device = "cuda"
            return torch.device("cuda")

        if device_pref == "cpu":
            self._resolved_device = "cpu"
            return torch.device("cpu")

        if torch.cuda.is_available():
            self._resolved_device = "cuda"
            return torch.device("cuda")

        self._resolved_device = "cpu"
        return torch.device("cpu")

    def get_resolved_device(self) -> str | None:
        return self._resolved_device

    def is_pipeline_loaded(self) -> bool:
        return self._pipeline is not None

    def unload_pipeline(self) -> None:
        self._pipeline = None
        self._loaded_token = None
        self._resolved_device = None

    def get_download_status(self) -> DiarizationDownloadStatus:
        status = self._download_status.model_copy()
        status.downloaded = self.is_downloaded()
        status.local_size_mb = self.get_local_size_mb() or None

        if status.status == "downloading":
            local_mb = status.local_size_mb or 0.0
            status.progress_percent = max(
                status.progress_percent,
                min(94.0, round((local_mb / ESTIMATED_SIZE_MB) * 100, 1)),
            )
            status.message = (
                f"Downloading {PIPELINE_ID}... "
                f"{local_mb:.0f} / {ESTIMATED_SIZE_MB:.0f} MB"
            )
        return status

    def start_download(self, hf_token: str, device_pref: str = "auto") -> DiarizationDownloadStatus:
        if not self.is_pyannote_installed():
            raise DiarizationError(
                "pyannote.audio is not installed. Run: "
                "cd backend && source .venv/bin/activate && pip install -r requirements.txt"
            )

        token = hf_token.strip()
        if not token:
            raise DiarizationError(
                "A Hugging Face access token is required. Add your token in Settings → Models."
            )

        with self._download_lock:
            if self._download_status.status == "downloading":
                raise RuntimeError("Diarization models are already downloading.")
            self._download_status = DiarizationDownloadStatus(
                status="downloading",
                progress_percent=1.0,
                message="Starting pyannote download...",
            )

        thread = threading.Thread(
            target=self._download_worker,
            args=(token, device_pref),
            daemon=True,
        )
        thread.start()
        return self.get_download_status()

    def _download_worker(self, hf_token: str, device_pref: str) -> None:
        stop_event = threading.Event()

        def poll_progress() -> None:
            while not stop_event.wait(0.5):
                local_mb = self.get_local_size_mb()
                with self._download_lock:
                    if self._download_status.status != "downloading":
                        continue
                    self._download_status.progress_percent = max(
                        self._download_status.progress_percent,
                        min(94.0, round((local_mb / ESTIMATED_SIZE_MB) * 100, 1)),
                    )
                    self._download_status.message = (
                        f"Downloading {PIPELINE_ID}... "
                        f"{local_mb:.0f} / {ESTIMATED_SIZE_MB:.0f} MB"
                    )

        poller = threading.Thread(target=poll_progress, daemon=True)
        poller.start()

        try:
            with self._download_lock:
                self._download_status.message = "Connecting to Hugging Face..."
                self._download_status.progress_percent = 2.0

            self.load_pipeline(hf_token, device_pref)

            with self._download_lock:
                self._download_status.progress_percent = 96.0
                self._download_status.message = "Verifying diarization models..."

            marker = self._marker_path()
            marker.parent.mkdir(parents=True, exist_ok=True)
            marker.write_text(PIPELINE_ID, encoding="utf-8")

            with self._download_lock:
                self._download_status = DiarizationDownloadStatus(
                    status="completed",
                    progress_percent=100.0,
                    message="Diarization models downloaded and ready.",
                    downloaded=True,
                    local_size_mb=self.get_local_size_mb(),
                )
        except DiarizationError as exc:
            with self._download_lock:
                self._download_status = DiarizationDownloadStatus(
                    status="error",
                    progress_percent=0.0,
                    message="Download failed",
                    error=str(exc),
                )
        except Exception as exc:
            with self._download_lock:
                self._download_status = DiarizationDownloadStatus(
                    status="error",
                    progress_percent=0.0,
                    message="Download failed",
                    error=str(exc),
                )
        finally:
            stop_event.set()

    def delete_models(self) -> None:
        with self._download_lock:
            if self._download_status.status == "downloading":
                raise RuntimeError("Cannot delete while diarization models are downloading.")

        self.unload_pipeline()
        marker_dir = settings.data_dir / "cache" / "diarization"

        for repo_dir in self._pyannote_hub_dirs():
            shutil.rmtree(repo_dir, ignore_errors=True)

        if marker_dir.exists():
            shutil.rmtree(marker_dir, ignore_errors=True)

        with self._download_lock:
            self._download_status = DiarizationDownloadStatus()

    def load_pipeline(self, hf_token: str, device_pref: str = "auto") -> "Pipeline":
        if not self.is_pyannote_installed():
            raise DiarizationError(
                "pyannote.audio is not installed. Run: "
                "cd backend && source .venv/bin/activate && pip install -r requirements.txt"
            )

        token = hf_token.strip()
        if not token:
            raise DiarizationError(
                "A Hugging Face access token is required. Add your token in Settings → Models."
            )

        target_device = self._resolve_device_name(device_pref)
        if (
            self._pipeline is not None
            and self._loaded_token == token
            and self._resolved_device == target_device
        ):
            return self._pipeline

        try:
            from pyannote.audio import Pipeline
        except Exception as exc:
            raise DiarizationError(f"Failed to import pyannote.audio: {exc}") from exc

        self._configure_hf_cache()
        try:
            torch_device = self._resolve_torch_device(device_pref)
        except DiarizationError:
            raise
        except Exception as exc:
            raise DiarizationError(f"Failed to resolve torch device: {exc}") from exc

        try:
            try:
                pipeline = Pipeline.from_pretrained(PIPELINE_ID, token=token)
            except TypeError:
                pipeline = Pipeline.from_pretrained(PIPELINE_ID, use_auth_token=token)
        except Exception as exc:
            raise _wrap_load_error(exc) from exc

        try:
            pipeline.to(torch_device)
        except Exception as exc:
            raise DiarizationError(
                f"Failed to move pyannote pipeline to {target_device}: {exc}"
            ) from exc

        self._pipeline = pipeline
        self._loaded_token = token
        return pipeline

    def _resolve_device_name(self, device_pref: str) -> str:
        if device_pref != "auto":
            return device_pref
        try:
            import torch

            return "cuda" if torch.cuda.is_available() else "cpu"
        except Exception:
            return "cpu"

    def diarize_file(
        self,
        file_path: str,
        hf_token: str,
        *,
        device_pref: str = "auto",
        min_speakers: int | None = None,
        max_speakers: int | None = None,
        num_speakers: int | None = None,
    ) -> list[SpeakerRegion]:
        if not self.is_downloaded():
            raise DiarizationError(
                "Speaker diarization models are not downloaded. "
                "Go to Settings → Models to download them first."
            )

        pipeline = self.load_pipeline(hf_token, device_pref)

        pipeline_kwargs: dict[str, int] = {}
        if num_speakers is not None:
            pipeline_kwargs["num_speakers"] = num_speakers
        if min_speakers is not None:
            pipeline_kwargs["min_speakers"] = min_speakers
        if max_speakers is not None:
            pipeline_kwargs["max_speakers"] = max_speakers

        try:
            audio_input = _load_waveform(file_path)
        except Exception as exc:
            raise DiarizationError(f"Failed to decode audio for diarization: {exc}") from exc

        try:
            output = pipeline(audio_input, **pipeline_kwargs)
        except Exception as exc:
            raise _wrap_load_error(exc) if "gated" in str(exc).lower() else DiarizationError(
                f"pyannote diarization failed: {exc}"
            ) from exc

        return _annotation_to_regions(output)


def _get_annotation(diarization_output: Any) -> Any:
    if hasattr(diarization_output, "exclusive_speaker_diarization"):
        return diarization_output.exclusive_speaker_diarization
    if hasattr(diarization_output, "speaker_diarization"):
        return diarization_output.speaker_diarization
    return diarization_output


def _annotation_to_regions(diarization_output: Any) -> list[SpeakerRegion]:
    annotation = _get_annotation(diarization_output)
    label_map: dict[str, int] = {}
    raw_regions: list[SpeakerRegion] = []

    for segment, _track, label in annotation.itertracks(yield_label=True):
        if label not in label_map:
            label_map[label] = len(label_map) + 1
        raw_regions.append(
            SpeakerRegion(
                start=float(segment.start),
                end=float(segment.end),
                speaker=label_map[label],
            )
        )

    if not raw_regions:
        return [SpeakerRegion(0.0, 0.0, 1)]

    raw_regions.sort(key=lambda region: (region.start, region.end))
    return _merge_adjacent_regions(raw_regions)


def _merge_adjacent_regions(regions: list[SpeakerRegion]) -> list[SpeakerRegion]:
    merged: list[SpeakerRegion] = [regions[0]]
    for region in regions[1:]:
        last = merged[-1]
        if region.speaker == last.speaker and region.start <= last.end + 0.05:
            merged[-1] = SpeakerRegion(last.start, max(last.end, region.end), last.speaker)
        else:
            merged.append(region)
    return merged


def speaker_for_interval(
    start: float,
    end: float,
    regions: list[SpeakerRegion],
    default_speaker: int = 1,
) -> int:
    if not regions:
        return default_speaker

    best_overlap = 0.0
    best_speaker = default_speaker
    midpoint = (start + end) / 2.0

    for region in regions:
        overlap = min(end, region.end) - max(start, region.start)
        if overlap > best_overlap:
            best_overlap = overlap
            best_speaker = region.speaker

    if best_overlap > 0:
        return best_speaker

    nearest = min(
        regions,
        key=lambda region: abs(midpoint - (region.start + region.end) / 2.0),
    )
    return nearest.speaker


def diarize_audio(
    file_path: str,
    *,
    hf_token: str | None,
    device_pref: str = "auto",
    min_speakers: int | None = None,
    max_speakers: int | None = None,
) -> list[SpeakerRegion]:
    service = DiarizationService.get_instance()
    return service.diarize_file(
        file_path,
        hf_token or "",
        device_pref=device_pref,
        min_speakers=min_speakers,
        max_speakers=max_speakers,
    )