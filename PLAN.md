# Purplepatch Offline AI Transcriber - Master PLAN

> **Note:** This is a condensed master plan suitable as a blueprint. It is designed to support virtually unlimited file sizes through streaming rather than loading media into RAM.

## Vision

Build **Purplepatch Offline AI Transcriber** — a professional offline transcription desktop application for macOS and Windows using Electron + Python.

### Goals

- Fully offline
- Unlimited media size (100 GB, 500 GB, 1 TB+)
- Multiple speakers
- High accuracy
- Fast GPU acceleration
- Resume after crash
- Queue multiple jobs
- Export TXT, SRT, VTT, JSON
- Live progress dashboard

## Tech Stack

- Electron
- React
- TypeScript
- Tailwind CSS
- FastAPI
- Python 3.12
- faster-whisper
- CTranslate2
- FFmpeg
- Silero VAD
- pyannote.audio
- WhisperX
- SpeechBrain
- SQLite

## Architecture

Electron UI
↓
Python Service
↓
Job Manager
↓
Worker Pool
↓
FFmpeg Streaming
↓
VAD
↓
Speaker Diarization
↓
Whisper
↓
Alignment
↓
Merge
↓
Export

## Unlimited File Support

The application must never load the whole media file.

Use FFmpeg streaming.

Only a few seconds of audio are processed at once.

Memory usage depends on:
- model
- worker count

NOT on media size.

## Pipeline

1. Open media
2. Read metadata
3. Stream audio
4. Noise reduction (optional)
5. VAD
6. Speaker diarization
7. Dynamic chunking
8. Transcription
9. Word alignment
10. Merge transcript
11. Export

## UI During Processing

Display:

- Overall percentage
- Current stage
- Current chunk
- Total chunks
- ETA
- Elapsed time
- Current speaker
- GPU/CPU usage
- RAM usage
- Speed (Realtime factor)
- Live transcript preview
- Live activity log

Pipeline status:

- ✓ Completed
- ▶ Running
- ○ Waiting
- ✖ Failed

## Resume

Save every chunk immediately into SQLite.

On restart:

Resume from last completed chunk.

## Queue

Support multiple jobs.

Pause

Resume

Cancel

Retry

Reorder

## Export

- TXT
- SRT
- VTT
- JSON
- DOCX (future)
- PDF (future)

## Recommended Models

Transcription:
- Whisper Large-v3 Turbo

VAD:
- Silero

Speaker Diarization:
- pyannote.audio

Alignment:
- WhisperX

## Folder Structure

backend/
frontend/
models/
cache/
database/
exports/
logs/
temp/

## Development Phases

Phase 1
- Core UI
- Backend
- Whisper
- TXT export

Phase 2
- Streaming
- Resume
- Queue

Phase 3
- Diarization
- Alignment
- Video player

Phase 4
- Performance
- GPU tuning
- Packaging

Phase 5
- Polish
- Testing
- Release

## Future

- Live microphone
- Meeting assistant
- AI summary
- Action items
- Translation
- Chat with transcript
- Plugin system

## Success Criteria

- Works completely offline
- Stable with 1TB+ media
- Constant memory usage
- Crash recovery
- Professional UX
- Commercial quality
