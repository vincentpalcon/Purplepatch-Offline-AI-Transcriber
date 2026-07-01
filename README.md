# Purplepatch Offline AI Transcriber

A **Purplepatch** desktop app for **macOS** and **Windows** that transcribes audio and video files completely offline using AI (Whisper).

No internet required after setup. Your files never leave your computer.

---

## Table of Contents

- [Installation](#installation)
- [How to Use](#how-to-use)
- [User Interface Guide](#user-interface-guide)
- [Supported File Formats](#supported-file-formats)
- [Output Files](#output-files)
- [Job Controls](#job-controls)
- [Tips & Performance](#tips--performance)
- [Troubleshooting](#troubleshooting)
- [For Developers](#for-developers)

---

## Installation

### Requirements

| Software | Version |
|----------|---------|
| Node.js | 20 or higher |
| Python | 3.12 |
| FFmpeg | Latest stable |

**Install FFmpeg**

macOS:
```bash
brew install ffmpeg
```

Windows:
```powershell
winget install Gyan.FFmpeg
```

### Setup (first time only)

**1. Install app dependencies**
```bash
npm install
```

**2. Set up the Python backend**

macOS:
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ..
```

Windows (PowerShell):
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
cd ..
```

**3. Start the app**
```bash
npm run dev
```

The app window opens and the transcription engine starts automatically in the background.

---

## How to Use

### Step 1 — Launch the app

Run from the project folder:

```bash
npm run dev
```

Wait until the header shows **"Local engine online"** (green). If it says **"Local engine offline"**, see [Troubleshooting](#troubleshooting).

### Step 2 — Add a media file

1. Click **Add Media** in the top-right corner (or **Select Media File** on the empty screen).
2. Choose an audio or video file from your computer.
3. The file is added to the **Job Queue** on the left and transcription starts automatically.

### Step 3 — Monitor progress

Click a job in the queue to see:

- **Overall progress** — percentage complete
- **Pipeline stages** — which step is running (Metadata → Transcribe → Export, etc.)
- **Live transcript** — text appearing as it is processed
- **Activity log** — detailed status messages
- **System stats** — CPU, RAM, and speed (realtime factor)

### Step 4 — Get your transcript

When a job shows **completed**:

1. Select the job in the queue.
2. Click **Open Export** in the top-right of the main panel.
3. Your transcript opens in the file manager as a `.txt` file.

---

## User Interface Guide

```
┌─────────────────────────────────────────────────────────────┐
│  Purplepatch Offline AI Transcriber   Backend ●  [Add Media]  │  ← Header (drag to move window on macOS)
├──────────────┬──────────────────────────────────────────────┤
│              │  File name + path                            │
│  Job Queue   │  ─────────────────────────────────────────── │
│              │  Pipeline: Metadata → Stream → ... → Export  │
│  • job 1     │  Progress bar + stats (ETA, speed, CPU/RAM)  │
│  • job 2     │  Live Transcript preview                     │
│  • job 3     │  Activity Log                                │
│              │                                              │
└──────────────┴──────────────────────────────────────────────┘
```

| Area | What it does |
|------|--------------|
| **Header** | Shows connection status. Drag the title area to move the window (macOS). |
| **Add Media** | Opens a file picker to queue a new transcription job. |
| **Job Queue** | Lists all jobs. Click one to view its details. Hover to see action buttons. |
| **Pipeline** | Shows the 9 processing stages and which one is active. |
| **Progress dashboard** | Percent complete, chunk progress, elapsed time, ETA, and speed. |
| **Live Transcript** | Preview of transcribed text as it is generated. |
| **Activity Log** | Timestamped log of everything happening for the selected job. |
| **Open Export** | Appears when done — opens the folder containing your `.txt` file. |

### Job status colors

| Status | Meaning |
|--------|---------|
| **queued** | Waiting to start |
| **running** | Currently transcribing |
| **paused** | Temporarily stopped (you paused it) |
| **completed** | Done — export is ready |
| **failed** | Something went wrong — use Retry |
| **cancelled** | Stopped by you |

---

## Supported File Formats

| Type | Formats |
|------|---------|
| Audio | `.mp3` `.wav` `.m4a` `.flac` `.ogg` |
| Video | `.mp4` `.mkv` `.mov` `.avi` `.webm` |

Video files are processed by extracting the audio track automatically (via FFmpeg).

---

## Output Files

Transcripts are saved as plain text (`.txt`) in the `exports/` folder:

```
exports/
└── my-recording_a1b2c3d4.txt
```

The filename includes the original name plus a short job ID.

**Example output:**
```
Hello and welcome to today's meeting.
We'll be discussing the quarterly results.
Thank you all for joining.
```

> **Coming in future phases:** SRT, VTT, and JSON export formats.

---

## Job Controls

Hover over a job in the queue to reveal action buttons:

| Button | When available | What it does |
|--------|----------------|--------------|
| **Pause** | Job is running | Pauses transcription |
| **Resume** | Job is paused | Continues from where it stopped |
| **Retry** | Job failed | Re-queues the job from the beginning |
| **Cancel** | Job is queued, running, or paused | Stops the job permanently |

You can queue multiple files — they process one at a time in order.

---

## Tips & Performance

**First run is slower** — On the first transcription, the app downloads the Whisper `base` model (~150 MB) into the `models/` folder. Later runs reuse the cached model.

**Faster transcription**
- Close other heavy apps to free CPU/RAM.
- Shorter files finish faster; long files take proportionally longer.
- GPU acceleration is used automatically when available (NVIDIA CUDA or Apple Silicon).

**Accuracy vs speed** — Phase 1 uses the `base` model (fast, good for clear speech). Larger models like `large-v3` will be configurable in a future release for higher accuracy.

**Large files** — The app is designed to handle very large files (100 GB+) via streaming in future phases. Phase 1 processes the full file through Whisper directly.

**Moving the window (macOS)** — Drag anywhere on the header except the **Add Media** button and status indicator.

---

## Troubleshooting

### "Local engine offline" in the header

The local Python engine did not start. Fix:

```bash
cd backend
source .venv/bin/activate        # macOS
# .\.venv\Scripts\Activate.ps1   # Windows
pip install -r requirements.txt
cd ..
npm run dev
```

### "Startup Error" dialog on launch

Run the backend setup steps in [Installation](#installation) if you have not already.

### Transcription fails immediately

- Confirm **FFmpeg** is installed: `ffmpeg -version`
- Confirm the file exists and is not corrupted.
- Check the **Activity Log** for the exact error message.

### No text in the transcript

- The audio may be silent or too quiet.
- Background noise can reduce accuracy with the `base` model.
- Try a file with clear speech first to verify the pipeline works.

### App feels slow

- First run downloads the model — wait for it to finish.
- CPU-only mode is slower than GPU; this is expected.
- Very long files take time — watch the **ETA** and **speed (RTF)** stats.

### Database error on startup

If you see a database lock error, stop all running instances and restart:

```bash
pkill -f "uvicorn app.main:app"   # macOS/Linux
npm run dev
```

---

## For Developers

### Project structure

```
├── electron/     Electron main process
├── frontend/     React UI
├── backend/      FastAPI + faster-whisper
├── models/       Cached Whisper models
├── exports/      Transcript output
├── database/     SQLite job store
├── cache/        Processing cache
├── logs/         Application logs
└── temp/         Temporary files
```

### Build installers

```bash
npm run dist       # Current platform
npm run dist:mac   # macOS (.dmg)
npm run dist:win   # Windows (.exe)
```

### API (localhost:8742)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Service status |
| `/jobs` | GET | List all jobs |
| `/jobs` | POST | Create a job |
| `/jobs/{id}/pause` | POST | Pause a job |
| `/jobs/{id}/resume` | POST | Resume a job |
| `/jobs/{id}/cancel` | POST | Cancel a job |
| `/jobs/{id}/retry` | POST | Retry a failed job |
| `/activity` | GET | Activity log |
| `/system/stats` | GET | CPU / RAM / GPU usage |

### Development roadmap

| Phase | Status | Features |
|-------|--------|----------|
| 1 | **Current** | Core UI, Whisper transcription, TXT export |
| 2 | Planned | Streaming, resume after crash, full queue |
| 3 | Planned | Speaker diarization, word alignment, video player |
| 4 | Planned | GPU tuning, performance, packaging |
| 5 | Planned | Polish, testing, release |

## License

MIT