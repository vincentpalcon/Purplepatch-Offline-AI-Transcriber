import asyncio
import time
from pathlib import Path

from app.core.config import settings
from app.core.database import db
from app.models.schemas import JobProgress, JobStatus, PipelineStage
from app.services.export import build_export_path, export_transcript
from app.services.settings_store import load_settings
from app.services.transcription import TranscriptionService


class JobManager:
    def __init__(self) -> None:
        self._queue: asyncio.Queue[str] = asyncio.Queue()
        self._active_job_id: str | None = None
        self._cancel_flags: set[str] = set()
        self._pause_flags: set[str] = set()
        self._worker_task: asyncio.Task | None = None
        self._transcription = TranscriptionService.get_instance()

    async def start(self) -> None:
        await db.init()
        await db.add_activity("Backend service started", level="success")
        self._worker_task = asyncio.create_task(self._worker_loop())

    async def stop(self) -> None:
        if self._worker_task:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass

    async def enqueue(self, job_id: str) -> None:
        await self._queue.put(job_id)

    def request_cancel(self, job_id: str) -> None:
        self._cancel_flags.add(job_id)

    def request_pause(self, job_id: str) -> None:
        self._pause_flags.add(job_id)

    def clear_pause(self, job_id: str) -> None:
        self._pause_flags.discard(job_id)

    async def _worker_loop(self) -> None:
        while True:
            job_id = await self._queue.get()
            try:
                await self._process_job(job_id)
            except Exception as exc:
                await db.update_job(job_id, status=JobStatus.FAILED, error_message=str(exc))
                await db.add_activity(f"Job failed: {exc}", level="error", job_id=job_id)
            finally:
                self._active_job_id = None
                self._queue.task_done()

    async def _process_job(self, job_id: str) -> None:
        job = await db.get_job(job_id)
        if not job:
            return

        if job.status in (JobStatus.CANCELLED, JobStatus.COMPLETED):
            return

        self._active_job_id = job_id
        self._cancel_flags.discard(job_id)
        self._pause_flags.discard(job_id)

        await db.update_job(job_id, status=JobStatus.RUNNING, clear_error=True)
        await db.add_activity(f"Started processing {job.file_name}", level="info", job_id=job_id)

        start_time = time.time()
        progress = job.progress

        async def update_stage(stage: PipelineStage, percent: float, message: str) -> None:
            if job_id in self._cancel_flags:
                raise asyncio.CancelledError("Job cancelled")

            while job_id in self._pause_flags:
                await db.update_job(job_id, status=JobStatus.PAUSED)
                await asyncio.sleep(0.5)
                if job_id in self._cancel_flags:
                    raise asyncio.CancelledError("Job cancelled")

            progress.current_stage = stage
            progress.overall_percent = percent
            progress.elapsed_seconds = time.time() - start_time
            await db.update_job(job_id, status=JobStatus.RUNNING, progress=progress)
            await db.add_activity(message, level="info", job_id=job_id)

        try:
            await update_stage(PipelineStage.METADATA, 5.0, "Reading file metadata")
            file_path = Path(job.file_path)
            if not file_path.exists():
                raise FileNotFoundError(f"File not found: {job.file_path}")

            await update_stage(PipelineStage.STREAMING, 10.0, "Preparing audio stream")
            await update_stage(PipelineStage.VAD, 15.0, "Voice activity detection (built into Whisper)")
            await update_stage(PipelineStage.DIARIZATION, 20.0, "Speaker diarization (Phase 3)")
            await update_stage(PipelineStage.CHUNKING, 25.0, "Preparing transcription chunks")
            app_settings = load_settings()
            model_name = job.model or app_settings.model

            await update_stage(
                PipelineStage.TRANSCRIPTION,
                30.0,
                f"Transcribing with model: {model_name}",
            )

            live_lines: list[str] = []

            def on_segment(segment) -> None:
                text = segment.text.strip()
                if text:
                    live_lines.append(text)

            loop = asyncio.get_event_loop()
            full_text, duration, proc_time = await loop.run_in_executor(
                None,
                lambda: self._transcription.transcribe_file(
                    job.file_path,
                    language=job.language,
                    model_name=model_name,
                    on_segment=on_segment,
                ),
            )

            progress.live_transcript = full_text
            progress.speed_rtf = duration / proc_time if proc_time > 0 else None
            progress.total_chunks = 1
            progress.current_chunk = 1
            progress.overall_percent = 85.0

            await update_stage(PipelineStage.ALIGNMENT, 88.0, "Word alignment (Phase 3)")
            await update_stage(PipelineStage.MERGE, 92.0, "Merging transcript")
            output_format = app_settings.output_format.value
            await update_stage(
                PipelineStage.EXPORT,
                95.0,
                f"Exporting {output_format.upper()}",
            )

            export_path = build_export_path(
                settings.exports_dir, job_id, job.file_name, output_format
            )
            export_transcript(full_text, export_path, output_format)

            progress.overall_percent = 100.0
            progress.current_stage = PipelineStage.EXPORT
            progress.elapsed_seconds = time.time() - start_time

            await db.update_job(
                job_id,
                status=JobStatus.COMPLETED,
                progress=progress,
                export_path=str(export_path),
            )
            await db.add_activity(
                f"Export saved: {export_path.name}",
                level="success",
                job_id=job_id,
            )

        except asyncio.CancelledError:
            await db.update_job(job_id, status=JobStatus.CANCELLED)
            await db.add_activity("Job cancelled", level="warn", job_id=job_id)
            raise

        except Exception as exc:
            await db.update_job(
                job_id,
                status=JobStatus.FAILED,
                error_message=str(exc),
            )
            await db.add_activity(f"Error: {exc}", level="error", job_id=job_id)
            raise


job_manager = JobManager()