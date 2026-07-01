import subprocess
from pathlib import Path

import numpy as np

SAMPLE_RATE = 16_000


def load_audio_mono_16k(file_path: str) -> np.ndarray:
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"Media file not found: {file_path}")

    cmd = [
        "ffmpeg",
        "-i",
        str(path),
        "-f",
        "f32le",
        "-acodec",
        "pcm_f32le",
        "-ac",
        "1",
        "-ar",
        str(SAMPLE_RATE),
        "-hide_banner",
        "-loglevel",
        "error",
        "pipe:1",
    ]
    proc = subprocess.run(cmd, capture_output=True, check=False)
    if proc.returncode != 0:
        stderr = proc.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"FFmpeg failed to decode audio: {stderr or proc.returncode}")

    if not proc.stdout:
        return np.array([], dtype=np.float32)

    return np.frombuffer(proc.stdout, dtype=np.float32)