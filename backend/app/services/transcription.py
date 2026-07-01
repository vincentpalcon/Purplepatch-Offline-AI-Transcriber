import time
from pathlib import Path
from threading import Lock
from typing import TYPE_CHECKING

from app.core.config import settings
from app.models.schemas import TranscriptSegment
from app.services.model_manager import model_manager

if TYPE_CHECKING:
    from faster_whisper import BatchedInferencePipeline, WhisperModel

BATCH_SIZE = 8

_CUDA_RUNTIME_ERROR_MARKERS = ("cublas", "cudnn", "cuda", ".dll")


def _looks_like_cuda_runtime_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return any(marker in message for marker in _CUDA_RUNTIME_ERROR_MARKERS)


class TranscriptionCancelled(Exception):
    """Raised from within transcribe_file to stop mid-transcription when cancelled."""


class TranscriptionService:
    _instance: "TranscriptionService | None" = None
    _lock = Lock()

    def __init__(self) -> None:
        self._model: WhisperModel | None = None
        self._batched_pipeline: BatchedInferencePipeline | None = None
        self._loaded_model_name: str | None = None
        self._resolved_device: str | None = None

    @classmethod
    def get_instance(cls) -> "TranscriptionService":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def _resolve_device(self, device_pref: str = "auto") -> str:
        if device_pref != "auto":
            self._resolved_device = device_pref
            return device_pref
        try:
            import ctranslate2

            if ctranslate2.get_cuda_device_count() > 0:
                self._resolved_device = "cuda"
                return "cuda"
        except Exception:
            pass
        self._resolved_device = "cpu"
        return "cpu"

    def get_resolved_device(self) -> str:
        if self._resolved_device:
            return self._resolved_device
        from app.services.settings_store import load_settings

        return self._resolve_device(load_settings().device)

    def get_gpu_name(self) -> str | None:
        try:
            import ctranslate2

            if ctranslate2.get_cuda_device_count() > 0:
                return "CUDA GPU"
        except Exception:
            pass
        return None

    def get_loaded_model_name(self) -> str | None:
        return self._loaded_model_name

    def is_model_loaded(self) -> bool:
        return self._model is not None

    def unload_model(self) -> None:
        self._model = None
        self._batched_pipeline = None
        self._loaded_model_name = None

    def load_model(
        self, model_name: str | None = None, *, force_cpu: bool = False
    ) -> "WhisperModel":
        from app.services.settings_store import load_settings

        app_settings = load_settings()
        name = model_name or app_settings.model
        device = "cpu" if force_cpu else self._resolve_device(app_settings.device)
        compute_type = (
            app_settings.compute_type if device == "cpu" else "float16"
        )

        if (
            self._model is not None
            and self._loaded_model_name == name
            and self._resolved_device == device
        ):
            return self._model

        self.unload_model()

        local_path = model_manager.get_model_path(name)
        try:
            self._model = self._load_ctranslate2_model(
                name, local_path, device, compute_type
            )
        except Exception:
            # get_cuda_device_count() only confirms a GPU is physically
            # present (via NVML) -- it doesn't confirm the CUDA runtime libs
            # ctranslate2 needs (cuBLAS/cuDNN) are actually installed and
            # loadable. When they aren't, model construction itself throws
            # (e.g. "Library cublas64_12.dll is not found"); fall back to
            # CPU rather than failing every job on this machine.
            if device != "cuda":
                raise
            device = "cpu"
            compute_type = app_settings.compute_type
            self._model = self._load_ctranslate2_model(
                name, local_path, device, compute_type
            )

        self._resolved_device = device
        self._loaded_model_name = name
        return self._model

    def _load_ctranslate2_model(
        self, name: str, local_path: Path | None, device: str, compute_type: str
    ) -> "WhisperModel":
        from faster_whisper import WhisperModel

        if local_path:
            return WhisperModel(str(local_path), device=device, compute_type=compute_type)
        return WhisperModel(
            name,
            device=device,
            compute_type=compute_type,
            download_root=str(settings.models_dir),
        )

    def _get_batched_pipeline(self, model: "WhisperModel") -> "BatchedInferencePipeline":
        from faster_whisper import BatchedInferencePipeline

        if self._batched_pipeline is None:
            self._batched_pipeline = BatchedInferencePipeline(model=model)
        return self._batched_pipeline

    def transcribe_file(
        self,
        file_path: str,
        language: str | None = None,
        model_name: str | None = None,
        on_segment=None,
        should_continue=None,
    ) -> tuple[str, list[TranscriptSegment], float, float]:
        """Returns (full_text, segments, duration_seconds, processing_seconds).

        on_segment(segment, info) is called after each decoded segment, so
        callers can report incremental progress. should_continue() is polled
        before each segment is processed; returning False raises
        TranscriptionCancelled to stop iterating the (lazy) segment generator
        promptly instead of only after the whole file finishes.
        """
        model = self.load_model(model_name)
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"Media file not found: {file_path}")

        from app.services.settings_store import load_settings

        app_settings = load_settings()
        initial_prompt = app_settings.vocabulary.strip() if app_settings.vocabulary else None

        try:
            return self._transcribe_once(
                model, path, app_settings, language, initial_prompt, on_segment, should_continue
            )
        except RuntimeError as exc:
            # ctranslate2 only touches the CUDA runtime (cuBLAS/cuDNN) on
            # first inference, not at model construction, so a broken/missing
            # install surfaces here rather than in load_model(). Fall back to
            # CPU once instead of failing every job on this machine.
            if self._resolved_device != "cuda" or not _looks_like_cuda_runtime_error(exc):
                raise
            model = self.load_model(model_name, force_cpu=True)
            return self._transcribe_once(
                model, path, app_settings, language, initial_prompt, on_segment, should_continue
            )

    def _transcribe_once(
        self,
        model: "WhisperModel",
        path: Path,
        app_settings,
        language: str | None,
        initial_prompt: str | None,
        on_segment,
        should_continue,
    ) -> tuple[str, list[TranscriptSegment], float, float]:
        start = time.time()
        if app_settings.fast_batched:
            # BatchedInferencePipeline parallelizes VAD-segmented chunks for a
            # large CPU speedup (~5x measured), but it structurally depends on
            # VAD to chunk the audio, so it always runs with VAD on regardless
            # of the user's vad_filter setting. Measured to silently drop
            # segments at chunk boundaries on continuous, low-pause speech
            # (~27% of sentences missing in a controlled test vs. 0% for the
            # sequential path below) -- opt-in only, never the default.
            pipeline = self._get_batched_pipeline(model)
            segments, info = pipeline.transcribe(
                str(path),
                language=language or app_settings.language,
                vad_filter=True,
                beam_size=app_settings.beam_size,
                batch_size=BATCH_SIZE,
                initial_prompt=initial_prompt,
            )
        else:
            segments, info = model.transcribe(
                str(path),
                language=language or app_settings.language,
                vad_filter=app_settings.vad_filter,
                beam_size=app_settings.beam_size,
                initial_prompt=initial_prompt,
            )

        lines: list[str] = []
        transcript_segments: list[TranscriptSegment] = []
        for segment in segments:
            if should_continue is not None and not should_continue():
                raise TranscriptionCancelled()

            text = segment.text.strip()
            if text:
                lines.append(text)
                transcript_segments.append(
                    TranscriptSegment(
                        start=float(segment.start),
                        end=float(segment.end),
                        text=text,
                    )
                )
            if on_segment:
                on_segment(segment, info)

        duration = float(info.duration)
        elapsed = time.time() - start
        full_text = "\n".join(lines)
        return full_text, transcript_segments, duration, elapsed