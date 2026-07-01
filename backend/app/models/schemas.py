from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


class JobStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class PipelineStage(str, Enum):
    METADATA = "metadata"
    STREAMING = "streaming"
    VAD = "vad"
    DIARIZATION = "diarization"
    CHUNKING = "chunking"
    TRANSCRIPTION = "transcription"
    ALIGNMENT = "alignment"
    MERGE = "merge"
    EXPORT = "export"


class TranscriptSegment(BaseModel):
    start: float
    end: float
    text: str
    speaker: int | None = None


class JobProgress(BaseModel):
    overall_percent: float = 0.0
    current_stage: PipelineStage = PipelineStage.METADATA
    current_chunk: int = 0
    total_chunks: int = 0
    eta_seconds: float | None = None
    elapsed_seconds: float = 0.0
    current_speaker: str | None = None
    speed_rtf: float | None = None
    live_transcript: str = ""
    live_transcript_speakers: str = ""


class TranscriptionJob(BaseModel):
    id: str
    file_path: str
    file_name: str
    status: JobStatus
    created_at: str
    updated_at: str
    progress: JobProgress
    error_message: str | None = None
    export_path: str | None = None
    export_path_speakers: str | None = None
    model: str | None = None
    language: str | None = None


class CreateJobRequest(BaseModel):
    file_path: str
    model: str | None = None
    language: str | None = None


class ActivityLogEntry(BaseModel):
    id: str
    job_id: str | None
    timestamp: str
    level: Literal["info", "warn", "error", "success"]
    message: str


class SystemStats(BaseModel):
    cpu_percent: float
    ram_percent: float
    ram_used_mb: float
    ram_total_mb: float
    disk_used_percent: float
    disk_free_mb: float
    disk_total_mb: float
    gpu_percent: float | None = None
    gpu_name: str | None = None
    device: str = "cpu"


class HealthResponse(BaseModel):
    status: str
    version: str


class OutputFormat(str, Enum):
    TXT = "txt"
    SRT = "srt"
    VTT = "vtt"
    JSON = "json"


class AppSettings(BaseModel):
    model: str = "base"
    output_format: OutputFormat = OutputFormat.TXT
    language: str | None = None
    device: str = "auto"
    compute_type: str = "int8"
    beam_size: int = Field(default=5, ge=1, le=10)
    vad_filter: bool = True
    onboarding_complete: bool = False
    export_dir: str | None = None
    vocabulary: str | None = None
    # Default OFF: measured to silently drop ~27% of segments on continuous,
    # low-pause speech (batched VAD-chunk boundaries can lose content that
    # sequential decoding preserves). Faster, but not safe as a default.
    fast_batched: bool = False
    enable_speaker_labels: bool = True
    huggingface_token: str | None = None
    diarization_min_speakers: int | None = Field(default=None, ge=1, le=20)
    diarization_max_speakers: int | None = Field(default=None, ge=1, le=20)


class UpdateSettingsRequest(BaseModel):
    model: str | None = None
    output_format: OutputFormat | None = None
    language: str | None = None
    device: str | None = None
    compute_type: str | None = None
    beam_size: int | None = Field(default=None, ge=1, le=10)
    vad_filter: bool | None = None
    onboarding_complete: bool | None = None
    export_dir: str | None = None
    vocabulary: str | None = None
    fast_batched: bool | None = None
    enable_speaker_labels: bool | None = None
    huggingface_token: str | None = None
    diarization_min_speakers: int | None = Field(default=None, ge=1, le=20)
    diarization_max_speakers: int | None = Field(default=None, ge=1, le=20)


class DiarizationDownloadStatus(BaseModel):
    status: Literal["idle", "downloading", "completed", "error"] = "idle"
    progress_percent: float = 0
    message: str = ""
    error: str | None = None
    downloaded: bool = False
    local_size_mb: float | None = None


class DiarizationStatus(BaseModel):
    pyannote_installed: bool
    token_configured: bool
    downloaded: bool = False
    pipeline_loaded: bool
    pipeline_id: str
    local_size_mb: float | None = None
    estimated_size_mb: float = 1200.0
    device: str | None = None
    message: str = ""


class ModelInfo(BaseModel):
    id: str
    name: str
    description: str
    size_mb: int
    speed: str
    accuracy: str
    recommended_vram_mb: int


class ModelWithStatus(ModelInfo):
    downloaded: bool
    is_active: bool
    local_size_mb: float | None = None


class ModelDownloadStatus(BaseModel):
    status: Literal["idle", "downloading", "completed", "error"] = "idle"
    model_id: str | None = None
    progress_percent: float = 0
    message: str = ""
    error: str | None = None


class DiskUsageInfo(BaseModel):
    models_mb: float
    exports_mb: float
    cache_mb: float
    database_mb: float
    logs_mb: float
    temp_mb: float
    total_data_mb: float
    disk_free_mb: float
    disk_total_mb: float


class MemoryInfo(BaseModel):
    ram_used_mb: float
    ram_total_mb: float
    ram_percent: float
    process_memory_mb: float


class SystemInfo(BaseModel):
    app_version: str
    data_dir: str
    models_dir: str
    active_model: str
    loaded_model: str | None
    model_in_memory: bool
    downloaded_models: list[str]
    device: str
    compute_type: str
    gpu_name: str | None
    disk: DiskUsageInfo
    memory: MemoryInfo
    cpu_percent: float


class OutputFormatOption(BaseModel):
    id: str
    label: str
    available: bool
    description: str