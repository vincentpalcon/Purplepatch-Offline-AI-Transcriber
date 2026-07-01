from pathlib import Path


def export_txt(text: str, output_path: Path) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(text.strip() + "\n", encoding="utf-8")
    return output_path


def export_transcript(text: str, output_path: Path, output_format: str) -> Path:
    if output_format == "txt":
        return export_txt(text, output_path)
    raise ValueError(f"Output format '{output_format}' is not yet supported")


def build_export_path(
    exports_dir: Path,
    job_id: str,
    file_name: str,
    extension: str,
    *,
    suffix: str = "",
) -> Path:
    stem = Path(file_name).stem
    return exports_dir / f"{stem}_{job_id[:8]}{suffix}.{extension}"