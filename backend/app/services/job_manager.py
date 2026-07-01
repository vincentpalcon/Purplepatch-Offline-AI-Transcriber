import asyncio
import time
from pathlib import Path

from app.core.config import settings
from app.core.database import db
from app.models.schemas import JobProgress, JobStatus, PipelineStage, TranscriptSegment
from app.services.diarization import (
    DiarizationError,
    DiarizationService,
    SpeakerRegion,
    diarize_audio,
    speaker_for_interval,
)
from app.services.export import build_export_path, export_transcript
from app.services.settings_store import load_settings
from app.services.transcript_format import format_pure_transcript, format_speaker_transcript
from app.services.transcription import TranscriptionCancelled, TranscriptionService

# Overall progress range spent inside the actual whisper inference call.
TRANSCRIPTION_START_PERCENT = 30.0
TRANSCRIPTION_END_PERCENT = 85.0
# Minimum wall-clock gap between progress writes during transcription.
PROGRESS_UPDATE_INTERVAL_SECONDS = 1.0


class JobCancelled(Exception):
    """Raised from within update_stage to unwind _process_job on user cancel.

    Deliberately NOT asyncio.CancelledError: that type is reserved for real
    asyncio task cancellation (e.g. JobManager.stop()) and is a BaseException
    subclass since Python 3.8, so raising it here would silently escape
    _worker_loop's `except Exception` and kill the whole background worker
    the first time a job was cancelled during an early pipeline stage.
    """


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
                raise JobCancelled()

            while job_id in self._pause_flags:
                await db.update_job(job_id, status=JobStatus.PAUSED)
                await asyncio.sleep(0.5)
                if job_id in self._cancel_flags:
                    raise JobCancelled()

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

            app_settings = load_settings()
            model_name = job.model or app_settings.model
            speaker_regions: list[SpeakerRegion] = []

            if app_settings.enable_speaker_labels:
                diarization_service = DiarizationService.get_instance()
                if not diarization_service.is_downloaded():
                    raise RuntimeError(
                        "Speaker diarization models are not downloaded. "
                        "Go to Settings → Models to download them first."
                    )

                await update_stage(
                    PipelineStage.DIARIZATION,
                    20.0,
                    "Identifying speakers with pyannote.audio",
                )
                loop = asyncio.get_event_loop()
                try:
                    speaker_regions = await loop.run_in_executor(
                        None,
                        lambda: diarize_audio(
                            job.file_path,
                            hf_token=app_settings.huggingface_token,
                            device_pref=app_settings.device,
                            min_speakers=app_settings.diarization_min_speakers,
                            max_speakers=app_settings.diarization_max_speakers,
                        ),
                    )
                except DiarizationError as exc:
                    raise RuntimeError(str(exc)) from exc
                speaker_count = len({region.speaker for region in speaker_regions}) or 1
                await db.add_activity(
                    f"pyannote detected {speaker_count} speaker(s)",
                    level="info",
                    job_id=job_id,
                )
            else:
                await update_stage(
                    PipelineStage.DIARIZATION,
                    20.0,
                    "Speaker labels disabled in settings",
                )

            await update_stage(PipelineStage.CHUNKING, 25.0, "Preparing transcription chunks")
            await update_stage(
                PipelineStage.TRANSCRIPTION,
                TRANSCRIPTION_START_PERCENT,
                f"Transcribing with model: {model_name}",
            )

            loop = asyncio.get_event_loop()
            live_segments: list[TranscriptSegment] = []
            transcription_start = time.time()
            last_update = 0.0
            was_paused = False

            def assign_speaker(segment: TranscriptSegment) -> TranscriptSegment:
                if not app_settings.enable_speaker_labels:
                    return segment.model_copy(update={"speaker": 1})
                speaker = speaker_for_interval(segment.start, segment.end, speaker_regions)
                return segment.model_copy(update={"speaker": speaker})

            def on_segment(segment, info) -> None:
                nonlocal last_update
                text = segment.text.strip()
                if not text:
                    return

                assigned = assign_speaker(
                    TranscriptSegment(
                        start=float(segment.start),
                        end=float(segment.end),
                        text=text,
                    )
                )
                live_segments.append(assigned)

                now = time.time()
                near_end = info.duration and (info.duration - segment.end) < 0.5
                if now - last_update < PROGRESS_UPDATE_INTERVAL_SECONDS and not near_end:
                    return
                last_update = now

                fraction = (
                    max(0.0, min(1.0, segment.end / info.duration)) if info.duration else 0.0
                )
                transcription_elapsed = now - transcription_start
                rtf = segment.end / transcription_elapsed if transcription_elapsed > 0 else None
                remaining_audio = max(0.0, (info.duration or 0.0) - segment.end)
                eta = remaining_audio / rtf if rtf and rtf > 0 else None

                progress.overall_percent = TRANSCRIPTION_START_PERCENT + fraction * (
                    TRANSCRIPTION_END_PERCENT - TRANSCRIPTION_START_PERCENT
                )
                progress.live_transcript = format_pure_transcript(live_segments)
                progress.live_transcript_speakers = format_speaker_transcript(live_segments)
                progress.current_speaker = (
                    f"Speaker {assigned.speaker}" if assigned.speaker else None
                )
                progress.speed_rtf = rtf
                progress.eta_seconds = eta
                progress.elapsed_seconds = now - start_time

                asyncio.run_coroutine_threadsafe(
                    db.update_job(job_id, progress=progress), loop
                )

            def should_continue() -> bool:
                nonlocal was_paused
                if job_id in self._cancel_flags:
                    return False

                if job_id in self._pause_flags:
                    was_paused = True
                    asyncio.run_coroutine_threadsafe(
                        db.update_job(job_id, status=JobStatus.PAUSED), loop
                    ).result()
                    while job_id in self._pause_flags:
                        if job_id in self._cancel_flags:
                            return False
                        time.sleep(0.5)

                if was_paused:
                    was_paused = False
                    asyncio.run_coroutine_threadsafe(
                        db.update_job(job_id, status=JobStatus.RUNNING), loop
                    ).result()

                return True

            try:
                full_text, transcript_segments, duration, proc_time = await loop.run_in_executor(
                    None,
                    lambda: self._transcription.transcribe_file(
                        job.file_path,
                        language=job.language,
                        model_name=model_name,
                        on_segment=on_segment,
                        should_continue=should_continue,
                    ),
                )
            except TranscriptionCancelled:
                progress.live_transcript = format_pure_transcript(live_segments)
                progress.live_transcript_speakers = format_speaker_transcript(live_segments)
                progress.elapsed_seconds = time.time() - start_time
                await db.update_job(job_id, status=JobStatus.CANCELLED, progress=progress)
                await db.add_activity("Job cancelled", level="warn", job_id=job_id)
                return

            if app_settings.enable_speaker_labels:
                labeled_segments = [assign_speaker(segment) for segment in transcript_segments]
            else:
                labeled_segments = [
                    segment.model_copy(update={"speaker": 1}) for segment in transcript_segments
                ]

            full_text = format_pure_transcript(labeled_segments)
            speaker_text = format_speaker_transcript(labeled_segments)

            progress.live_transcript = full_text
            progress.live_transcript_speakers = speaker_text
            progress.speed_rtf = duration / proc_time if proc_time > 0 else None
            progress.eta_seconds = None
            progress.total_chunks = 1
            progress.current_chunk = 1
            progress.overall_percent = TRANSCRIPTION_END_PERCENT

            await update_stage(PipelineStage.ALIGNMENT, 88.0, "Word alignment (Phase 3)")
            await update_stage(PipelineStage.MERGE, 92.0, "Merging transcript")
            output_format = app_settings.output_format.value
            await update_stage(
                PipelineStage.EXPORT,
                95.0,
                f"Exporting {output_format.upper()}",
            )

            export_dir = Path(app_settings.export_dir) if app_settings.export_dir else settings.exports_dir
            export_path = build_export_path(
                export_dir, job_id, job.file_name, output_format
            )
            export_transcript(full_text, export_path, output_format)

            export_path_speakers = build_export_path(
                export_dir,
                job_id,
                job.file_name,
                output_format,
                suffix="_speakers",
            )
            export_transcript(speaker_text, export_path_speakers, output_format)

            progress.overall_percent = 100.0
            progress.current_stage = PipelineStage.EXPORT
            progress.elapsed_seconds = time.time() - start_time

            await db.update_job(
                job_id,
                status=JobStatus.COMPLETED,
                progress=progress,
                export_path=str(export_path),
                export_path_speakers=str(export_path_speakers),
            )
            await db.add_activity(
                f"Exports saved: {export_path.name}, {export_path_speakers.name}",
                level="success",
                job_id=job_id,
            )

        except JobCancelled:
            await db.update_job(job_id, status=JobStatus.CANCELLED)
            await db.add_activity("Job cancelled", level="warn", job_id=job_id)

        except Exception as exc:
            await db.update_job(
                job_id,
                status=JobStatus.FAILED,
                error_message=str(exc),
            )
            await db.add_activity(f"Error: {exc}", level="error", job_id=job_id)
            raise


job_manager = JobManager()