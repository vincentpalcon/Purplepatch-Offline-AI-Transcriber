import json
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncIterator
from uuid import uuid4

import aiosqlite

from app.core.config import settings
from app.models.schemas import (
    ActivityLogEntry,
    JobProgress,
    JobStatus,
    PipelineStage,
    TranscriptionJob,
)


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def _default_progress() -> dict[str, Any]:
    return JobProgress().model_dump()


class Database:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path

    @asynccontextmanager
    async def session(self) -> AsyncIterator[aiosqlite.Connection]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            await db.execute("PRAGMA journal_mode=WAL")
            yield db

    async def init(self) -> None:
        settings.ensure_dirs()
        async with self.session() as db:
            await db.executescript(
                """
                CREATE TABLE IF NOT EXISTS jobs (
                    id TEXT PRIMARY KEY,
                    file_path TEXT NOT NULL,
                    file_name TEXT NOT NULL,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    progress_json TEXT NOT NULL,
                    error_message TEXT,
                    export_path TEXT,
                    model TEXT,
                    language TEXT
                );

                CREATE TABLE IF NOT EXISTS activity_log (
                    id TEXT PRIMARY KEY,
                    job_id TEXT,
                    timestamp TEXT NOT NULL,
                    level TEXT NOT NULL,
                    message TEXT NOT NULL
                );
                """
            )
            await db.commit()

    async def create_job(
        self,
        file_path: str,
        file_name: str,
        model: str | None = None,
        language: str | None = None,
    ) -> TranscriptionJob:
        job_id = str(uuid4())
        now = _utcnow()
        progress = _default_progress()

        async with self.session() as db:
            await db.execute(
                """
                INSERT INTO jobs (id, file_path, file_name, status, created_at, updated_at,
                                  progress_json, model, language)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    job_id,
                    file_path,
                    file_name,
                    JobStatus.QUEUED.value,
                    now,
                    now,
                    json.dumps(progress),
                    model,
                    language,
                ),
            )
            await db.commit()

        return TranscriptionJob(
            id=job_id,
            file_path=file_path,
            file_name=file_name,
            status=JobStatus.QUEUED,
            created_at=now,
            updated_at=now,
            progress=JobProgress(**progress),
            model=model,
            language=language,
        )

    async def list_jobs(self) -> list[TranscriptionJob]:
        async with self.session() as db:
            cursor = await db.execute(
                "SELECT * FROM jobs ORDER BY created_at DESC"
            )
            rows = await cursor.fetchall()
        return [self._row_to_job(row) for row in rows]

    async def get_job(self, job_id: str) -> TranscriptionJob | None:
        async with self.session() as db:
            cursor = await db.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
            row = await cursor.fetchone()
        return self._row_to_job(row) if row else None

    async def update_job(
        self,
        job_id: str,
        *,
        status: JobStatus | None = None,
        progress: JobProgress | None = None,
        error_message: str | None = None,
        export_path: str | None = None,
        clear_error: bool = False,
    ) -> TranscriptionJob | None:
        job = await self.get_job(job_id)
        if not job:
            return None

        if status is not None:
            job.status = status
        if progress is not None:
            job.progress = progress
        if error_message is not None:
            job.error_message = error_message
        if clear_error:
            job.error_message = None
        if export_path is not None:
            job.export_path = export_path

        job.updated_at = _utcnow()

        async with self.session() as db:
            await db.execute(
                """
                UPDATE jobs
                SET status = ?, updated_at = ?, progress_json = ?,
                    error_message = ?, export_path = ?
                WHERE id = ?
                """,
                (
                    job.status.value,
                    job.updated_at,
                    json.dumps(job.progress.model_dump()),
                    job.error_message,
                    job.export_path,
                    job_id,
                ),
            )
            await db.commit()

        return job

    async def add_activity(
        self,
        message: str,
        level: str = "info",
        job_id: str | None = None,
    ) -> ActivityLogEntry:
        entry = ActivityLogEntry(
            id=str(uuid4()),
            job_id=job_id,
            timestamp=_utcnow(),
            level=level,  # type: ignore[arg-type]
            message=message,
        )

        async with self.session() as db:
            await db.execute(
                """
                INSERT INTO activity_log (id, job_id, timestamp, level, message)
                VALUES (?, ?, ?, ?, ?)
                """,
                (entry.id, entry.job_id, entry.timestamp, entry.level, entry.message),
            )
            await db.commit()

        return entry

    async def get_activity(self, job_id: str | None = None, limit: int = 100) -> list[ActivityLogEntry]:
        async with self.session() as db:
            if job_id:
                cursor = await db.execute(
                    """
                    SELECT * FROM activity_log
                    WHERE job_id = ? OR job_id IS NULL
                    ORDER BY timestamp DESC LIMIT ?
                    """,
                    (job_id, limit),
                )
            else:
                cursor = await db.execute(
                    "SELECT * FROM activity_log ORDER BY timestamp DESC LIMIT ?",
                    (limit,),
                )
            rows = await cursor.fetchall()

        entries = [
            ActivityLogEntry(
                id=row["id"],
                job_id=row["job_id"],
                timestamp=row["timestamp"],
                level=row["level"],
                message=row["message"],
            )
            for row in rows
        ]
        return list(reversed(entries))

    def _row_to_job(self, row: aiosqlite.Row) -> TranscriptionJob:
        progress_data = json.loads(row["progress_json"])
        return TranscriptionJob(
            id=row["id"],
            file_path=row["file_path"],
            file_name=row["file_name"],
            status=JobStatus(row["status"]),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            progress=JobProgress(**progress_data),
            error_message=row["error_message"],
            export_path=row["export_path"],
            model=row["model"],
            language=row["language"],
        )


db = Database(settings.db_path)