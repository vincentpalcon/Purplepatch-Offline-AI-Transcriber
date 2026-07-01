from app.models.schemas import TranscriptSegment


def format_pure_transcript(segments: list[TranscriptSegment]) -> str:
    lines = [segment.text.strip() for segment in segments if segment.text.strip()]
    return "\n".join(lines)


def format_speaker_transcript(segments: list[TranscriptSegment]) -> str:
    if not segments:
        return ""

    blocks: list[str] = []
    current_speaker: int | None = None
    current_lines: list[str] = []

    def flush() -> None:
        if current_speaker is None or not current_lines:
            return
        blocks.append(f"Speaker {current_speaker}:\n" + "\n".join(current_lines))

    for segment in segments:
        text = segment.text.strip()
        if not text:
            continue

        speaker = segment.speaker or 1
        if speaker != current_speaker:
            flush()
            current_speaker = speaker
            current_lines = [text]
        else:
            current_lines.append(text)

    flush()
    return "\n\n".join(blocks)