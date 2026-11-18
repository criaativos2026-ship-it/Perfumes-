"""Configuração central. Tudo vem de variáveis de ambiente; nada de chaves no código."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class Settings:
    data_dir: Path = field(default_factory=lambda: Path(os.getenv("STUDIO_DATA_DIR", ROOT / "data")))
    brand_file: Path = field(default_factory=lambda: Path(os.getenv("STUDIO_BRAND_FILE", ROOT / "brand" / "CLAUDE.md")))
    frontend_dir: Path = ROOT / "frontend"
    claude_model: str = os.getenv("STUDIO_CLAUDE_MODEL", "claude-opus-5-5")
    # Máximo de buscas por pesquisa olfativa (controle de custo).
    research_max_searches: int = int(os.getenv("STUDIO_RESEARCH_MAX_SEARCHES", "8"))
    research_max_fetches: int = int(os.getenv("STUDIO_RESEARCH_MAX_FETCHES", "6"))

    @property
    def db_path(self) -> Path:
        return self.data_dir / "studio.db"

    @property
    def uploads_dir(self) -> Path:
        return self.data_dir / "projects"


settings = Settings()


def provider_status() -> dict[str, dict]:
    """Quais integrações estão realmente configuradas (sem revelar valores)."""
    def has(*names: str) -> bool:
        return all(os.getenv(n) for n in names)

    return {
        "anthropic": {"label": "Claude (identificação, pesquisa, direção)", "configured": has("ANTHROPIC_API_KEY") or has("ANTHROPIC_AUTH_TOKEN"), "phase": 1},
        "gemini": {"label": "Google Gemini Image + Veo", "configured": has("GEMINI_API_KEY"), "phase": 2},
        "kling": {"label": "Kling (vídeo)", "configured": has("KLING_ACCESS_KEY", "KLING_SECRET_KEY"), "phase": 3},
        "elevenlabs": {"label": "ElevenLabs (efeitos sonoros)", "configured": has("ELEVENLABS_API_KEY"), "phase": 4},
    }
