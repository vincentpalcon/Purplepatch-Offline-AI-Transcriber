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

The app is **standalone** — the installer bundles its own transcription engine (a self-contained Python runtime with Whisper/CTranslate2 built in). There is nothing else to install: no Python, no FFmpeg, no Node.

**macOS:** open the `.dmg` and drag the app to Applications.
**Windows:** run `Purplepatch Offline AI Transcriber Setup.exe`, or use the portable `.exe` if you'd rather not install anything.

Launch the app and wait for the header to show **"Local engine online"** (green) — that's the bundled engine starting up, typically a couple of seconds.

> Builds are currently produced for **Apple Silicon (arm64) Macs** and **64-bit (x64) Windows**. Intel Macs aren't built yet — see [Building installers (standalone bundling)](#building-installers-standalone-bundling) if you need to add that target.

Whisper models are **not** included in the installer — pick and download one from **Settings → Models** the first time you use the app (or transcribing with an undownloaded model triggers the download automatically). This requires internet the first time; transcription itself is fully offline afterward.

Building from source, or producing the installers yourself? See [For Developers](#for-developers).

---

## How to Use

### Step 1 — Launch the app

Open the installed app (or run `npm run dev` from source — see [For Developers](#for-developers)).

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

Video files are processed by extracting the audio track automatically (the app has FFmpeg's decoding libraries built in via PyAV — no separate FFmpeg install needed).

---

## Output Files

Transcripts are saved as plain text (`.txt`) in the app's `exports/` folder by default:

```
exports/
└── my-recording_a1b2c3d4.txt
```

The filename includes the original name plus a short job ID. To save exports somewhere else (e.g. a Dropbox folder or a project directory), set a custom folder in **Settings → Output Location** — it's validated for write access when you save, and applies to every job going forward.

**Example output:**
```
Hello and welcome to today's meeting.
We'll be discussing the quarterly results.
Thank you all for joining.
```

> **Coming in future phases:** SRT, VTT, and JSON export formats.

---

## Job Controls

Pause, Resume, Retry, and Stop buttons appear both next to the file name in the main panel for the selected job, and on hover over any job in the sidebar queue:

| Button | When available | What it does |
|--------|----------------|--------------|
| **Pause** | Job is running | Pauses transcription — takes effect within a second or two, not just between pipeline stages |
| **Resume** | Job is paused | Continues from where it paused |
| **Retry** | Job failed | Re-queues the job from the beginning |
| **Stop / Cancel** | Job is queued, running, or paused | Stops the job promptly (checked between transcription segments, so it doesn't wait for the whole file to finish) and frees the queue for the next job |

Progress, ETA, and speed (RTF) update continuously throughout transcription — not just at pipeline-stage boundaries — so a job sitting at, say, 45% with a real ETA is actively working, not stuck. Large files with the `large-v3` model on CPU-only machines (e.g. Apple Silicon Macs — see [Tips & Performance](#tips--performance)) can legitimately take a while; watch the **Speed (RTF)** stat to gauge real progress.

You can queue multiple files — they process one at a time in order.

---

## Tips & Performance

**First run is slower** — The first time you use a given model, the app downloads it from Hugging Face (the default `base` model is ~150 MB; larger models like `large-v3` are several GB). This needs internet once; later runs reuse the cached copy from Settings → Models. Downloads and cached models live in the app's data folder, not inside the installed app itself.

**Faster transcription**
- Close other heavy apps to free CPU/RAM.
- Shorter files finish faster; long files take proportionally longer.
- GPU acceleration is used automatically when an NVIDIA CUDA GPU is available. **Apple Silicon Macs always run on CPU** — the underlying engine (CTranslate2) has no Metal/Apple Neural Engine backend, so `device: auto` resolves to CPU on Mac regardless of chip. This is expected, not a bug; for large files on Mac, consider a smaller model (`small`/`medium`) if `large-v3` feels slow.
- **Fast batched transcription** (Settings → Processing) can be up to ~5x faster on CPU by processing audio in parallel batches. It's **off by default and marked experimental**: controlled testing showed it silently dropped roughly 1 in 4 sentences on continuous, low-pause speech (presentations, lectures) versus zero errors with it off — the speed comes from the same VAD-chunk batching that can lose content at chunk boundaries. Only turn it on for content you can spot-check afterward.

**Accuracy vs speed** — Larger models (`large-v3`) are more accurate but slower than smaller ones (`base`, `small`, `medium`); pick a model in Settings → Models. For difficult audio — accents, jargon, names — add them to **Settings → Custom Vocabulary** as a comma-separated hint; Whisper uses it as context to bias toward the correct spelling instead of guessing phonetically.

**Large files** — The app is designed to handle very large files (100 GB+) via streaming in future phases. Phase 1 processes the full file through Whisper directly.

**Moving the window (macOS)** — Drag anywhere on the header except the **Add Media** button and status indicator.

---

## Troubleshooting

### "Local engine offline" in the header / "Startup Error" dialog on launch

**If you installed the app (Setup.exe / .dmg):** the bundled engine failed to start. This shouldn't happen with an intact installer — try reinstalling. If it persists, check the app's logs (Settings → System Info shows the data folder path) for the underlying error.

**If you're running from source** (`npm run dev`): the backend venv isn't set up yet. Fix:

```bash
cd backend
source .venv/bin/activate        # macOS
# .\.venv\Scripts\Activate.ps1   # Windows
pip install -r requirements.txt
cd ..
npm run dev
```

### Transcription fails immediately

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
├── electron/       Electron main process
├── frontend/       React UI
├── backend/        FastAPI + faster-whisper (source)
├── scripts/        Build tooling (bundle-python.mjs)
├── python-runtime/ Bundled standalone Python runtimes (gitignored, build output)
├── models/         Legacy — models now download into the app's data folder, not here
├── exports/        Transcript output (dev mode)
├── database/       SQLite job store (dev mode)
├── cache/          Processing cache (dev mode)
├── logs/           Application logs (dev mode)
└── temp/           Temporary files (dev mode)
```

Running `npm run dev` and the installed app both use the OS's per-app data folder (`app.getPath('userData')`, e.g. `~/Library/Application Support/purplepatch-offline-ai-transcriber` on macOS) for models, database, exports, logs, cache — not the folders above. Those folders exist for historical/dev-convenience reasons.

### Running from source

```bash
npm install
cd backend && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && cd ..
npm run dev
```

(Windows: `python -m venv .venv` then `.\.venv\Scripts\Activate.ps1`.) FFmpeg is **not** required — `faster-whisper` decodes audio via PyAV, which ships its own statically-linked FFmpeg libraries.

### Building installers (standalone bundling)

```bash
npm run dist:mac   # macOS (.dmg + .zip), arm64
npm run dist:win   # Windows (Setup.exe + portable .exe), x64
npm run dist       # both, sequentially
```

Each `dist:*` script first runs `scripts/bundle-python.mjs`, which:

1. Downloads a self-contained CPython build ([python-build-standalone](https://github.com/astral-sh/python-build-standalone)) for the target OS/arch into `python-runtime/<mac|win>/python/`.
2. Installs `backend/requirements.txt` into that runtime's own `site-packages` — for Windows this is a **cross-platform install from macOS** using `pip install --target --platform win_amd64 --python-version 3.12 --implementation cp --abi cp312 --only-binary=:all:`, since real binary wheels exist on PyPI for every dependency (ctranslate2, onnxruntime, av, etc). `uvicorn[standard]`'s marker-conditional extras (`uvloop` on Unix, `colorama` on Windows) are handled explicitly, since pip resolves markers against the *host* platform, not the `--platform` target.
3. electron-builder then bundles that runtime via `extraResources` into `Resources/python` (mac) / `resources/python` (Windows) — `electron/python-manager.ts` spawns it directly, with no dependency on system Python, a dev venv, or FFmpeg.

Models are deliberately **not** part of this bundle — they're always a user-triggered download via Settings → Models, kept small and independent of app updates.

This adds ~300 MB of network/disk usage per platform (cached under `python-runtime/.cache/`, safe to delete). The macOS build is fully verified on this machine end-to-end (packaged `.app` launched standalone — bundled runtime, no venv/system Python — through a real transcription job). The Windows build is verified structurally only (correct `python.exe`/`.pyd` architecture, dependency resolution, and a successful NSIS/portable build via electron-builder's bundled Wine) — actually launching the resulting `.exe` needs to be confirmed on a real Windows machine or CI, since it can't be executed from macOS.

Only Apple Silicon (mac) and x64 (Windows) targets are built today, matching the pinned `arch` in `package.json`'s `build.mac`/`build.win` config. Adding Intel Mac or ARM64 Windows support means adding the matching triple to `scripts/bundle-python.mjs` and an extra `arch` entry in the electron-builder config.

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