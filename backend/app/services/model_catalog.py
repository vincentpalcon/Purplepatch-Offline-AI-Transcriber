from app.models.schemas import ModelInfo

WHISPER_MODELS: list[ModelInfo] = [
    ModelInfo(
        id="tiny",
        name="Tiny",
        description="Fastest, lowest accuracy. Good for quick drafts.",
        size_mb=75,
        speed="Very Fast",
        accuracy="Low",
        recommended_vram_mb=1024,
    ),
    ModelInfo(
        id="base",
        name="Base",
        description="Balanced speed and accuracy. Recommended for most users.",
        size_mb=145,
        speed="Fast",
        accuracy="Good",
        recommended_vram_mb=1024,
    ),
    ModelInfo(
        id="small",
        name="Small",
        description="Better accuracy with moderate speed.",
        size_mb=466,
        speed="Medium",
        accuracy="Better",
        recommended_vram_mb=2048,
    ),
    ModelInfo(
        id="medium",
        name="Medium",
        description="High accuracy for professional use.",
        size_mb=1500,
        speed="Slow",
        accuracy="High",
        recommended_vram_mb=4096,
    ),
    ModelInfo(
        id="large-v2",
        name="Large v2",
        description="Top-tier accuracy, requires significant resources.",
        size_mb=3100,
        speed="Very Slow",
        accuracy="Very High",
        recommended_vram_mb=8192,
    ),
    ModelInfo(
        id="large-v3",
        name="Large v3",
        description="Latest large model with best overall accuracy.",
        size_mb=3100,
        speed="Very Slow",
        accuracy="Very High",
        recommended_vram_mb=8192,
    ),
    ModelInfo(
        id="large-v3-turbo",
        name="Large v3 Turbo",
        description="Near large-v3 accuracy at much faster speed. Best quality/speed ratio.",
        size_mb=1600,
        speed="Medium",
        accuracy="Very High",
        recommended_vram_mb=6144,
    ),
]


def get_model_catalog() -> list[ModelInfo]:
    return WHISPER_MODELS


def get_model_by_id(model_id: str) -> ModelInfo | None:
    return next((m for m in WHISPER_MODELS if m.id == model_id), None)