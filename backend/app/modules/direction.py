"""M3: direção de arte automática, presa ao guia de marca e à ficha olfativa."""
from __future__ import annotations

import re
import unicodedata
from typing import Any, Literal

from pydantic import BaseModel, Field

from ..brand import BrandGuide, check_palette
from ..claude import structured

FORMATS = {
    "9:16": {"label": "Story / Reels 1080x1920", "width": 1080, "height": 1920},
    "4:5": {"label": "Feed 1080x1350", "width": 1080, "height": 1350},
    "16:9": {"label": "Horizontal 1920x1080", "width": 1920, "height": 1080},
    "1:1": {"label": "Quadrado 1080x1080", "width": 1080, "height": 1080},
}
DURATIONS = {15: (3, 4), 30: (5, 7), 60: (9, 12)}  # duração -> (mín, máx) de cenas


class NoteVisual(BaseModel):
    note: str = Field(description="Nota exatamente como está na ficha olfativa")
    visual: str = Field(description="Como a nota aparece em cena (pt-BR)")


class PaletteColor(BaseModel):
    hex: str = Field(pattern=r"^#[0-9A-Fa-f]{6}$")
    role: str
    origin: Literal["marca", "fragrância"]


class Scene(BaseModel):
    index: int
    title: str
    duration_s: float
    shot_type: Literal["atmosfera", "ingrediente", "textura", "produto_herói", "packshot", "transição"]
    product_on_screen: Literal["ausente", "parcial", "inteiro"]
    description: str = Field(description="O que acontece na cena, em pt-BR")
    image_prompt: str = Field(description="Prompt em inglês para o keyframe inicial; fotografia publicitária realista")
    motion_prompt: str = Field(description="Prompt em inglês para a animação (image-to-video): movimento dos elementos e da câmera")
    camera_movement: str
    lighting: str
    transition_in: Literal["corte", "dissolve", "fade_preto", "match_cut", "morph_gerado"]
    sfx: list[str] = Field(description="Efeitos sonoros discretos (pt-BR)")
    on_screen_text: str | None = Field(description="Texto na tela em pt-BR, ou null")
    recommended_provider: Literal["veo", "kling"]
    provider_reason: str


class EndCard(BaseModel):
    perfume_name: str
    subtitle: str = Field(description="Nome do perfume/fabricante em itálico, como no padrão da marca")
    notes_line_top: str
    notes_line_heart: str
    notes_line_base: str
    cta: str


class Fingerprint(BaseModel):
    environment: str = Field(description="Ambiente principal em 2-4 palavras (ex.: 'floresta tropical noturna')")
    key_elements: list[str] = Field(description="5-8 elementos visuais centrais, palavras simples")
    dominant_motion: str


class CreativeDirection(BaseModel):
    campaign_title: str
    campaign_line: str = Field(description="Frase de campanha sugerida (pt-BR), no tom da marca")
    concept: str
    olfactory_translation: list[NoteVisual]
    setting: str
    scenery: str
    natural_elements: list[str]
    floating_ingredients: list[str]
    textures: list[str]
    lighting: str
    palette: list[PaletteColor]
    camera_language: str
    sound_direction: str
    scenes: list[Scene]
    end_card: EndCard
    brand_compliance: list[str] = Field(description="Como cada regra relevante do guia foi respeitada")
    fingerprint: Fingerprint


SYSTEM_TEMPLATE = """Você é diretor de arte sênior de uma agência especializada em publicidade de perfumaria de luxo.
Cria comerciais cinematográficos com animação real (não slideshow), feitos com geração de imagem e vídeo por IA.

=== GUIA DE MARCA (referência obrigatória) ===
{brand_raw}
=== FIM DO GUIA ===

Cores extraídas do guia pelo sistema:
{palette}

Como conciliar o guia com o comercial:
- Cada perfume ganha um mundo visual próprio, derivado das notas reais da ficha olfativa. Não repita ambientes.
- Esse mundo é filmado em chave baixa (low-key): fundos profundos próximos ao preto da marca, luz dourada quente
  recortando elementos, contraste rico. As cores da fragrância aparecem como acentos dentro dessa atmosfera.
- A última cena é SEMPRE o packshot no padrão boutique do guia: fundo preto, foco de luz dourada atrás do frasco,
  linha de piso dourada com reflexo suave, frasco centralizado sozinho (sem caixa), muito espaço vazio.
- A embalagem real é sagrada: os prompts nunca pedem para mudar, redesenhar ou reescrever o frasco, o rótulo, a tampa
  ou as escritas. Descreva o frasco exatamente como na descrição fornecida e diga "the exact bottle from the reference image".
  Nunca coloque o frasco em cenas de ação que exijam deformá-lo; o frasco se move pouco, a câmera e os elementos se movem.
- Nada de logos do leão/coroa, dourado metálico espelhado, caixa alta espalhada, selos, emojis ou textos em excesso.
- Texto na tela: português do Brasil, frases curtas, caixa de sentença; no máximo uma ideia por cena.

Regras de pesquisa:
- Use SOMENTE as notas e ingredientes da ficha olfativa fornecida. Não acrescente notas que não estão nela.
- olfactory_translation só pode citar notas presentes na ficha.

Regras de cinema:
- Cada cena é um plano independente de 3 a 8 segundos (limite dos modelos de vídeo), com movimento orgânico:
  partículas, líquidos, pétalas, fumaça, tecido, luz se movendo; câmera com dolly, orbit lento, push-in, rack focus, macro.
- Prompts de imagem e movimento em inglês, concretos, com lente, luz, textura e composição para o formato pedido.
- Recomende "veo" para planos com o frasco ou com líquidos/física complexa e "kling" para atmosfera, ingredientes e transições.
- Som: efeitos discretos (borrifo, vidro, vento, água, tecido). Música de fundo só se combinar com o tom boutique.
"""


def _words(text: str) -> set[str]:
    text = unicodedata.normalize("NFKD", text.lower()).encode("ascii", "ignore").decode()
    return {w for w in re.findall(r"[a-z]{4,}", text)}


def similarity(a: dict[str, Any], b: dict[str, Any]) -> float:
    wa = _words(a.get("environment", "") + " " + " ".join(a.get("key_elements", [])))
    wb = _words(b.get("environment", "") + " " + " ".join(b.get("key_elements", [])))
    if not wa or not wb:
        return 0.0
    return len(wa & wb) / len(wa | wb)


def _profile_notes(profile: dict[str, Any]) -> set[str]:
    notes = profile.get("top_notes", []) + profile.get("heart_notes", []) + profile.get("base_notes", [])
    notes += profile.get("main_accords", []) + profile.get("key_ingredients", [])
    return {n.strip().lower() for n in notes}


def validate(direction: CreativeDirection, *, profile: dict[str, Any], guide: BrandGuide, duration: int) -> list[str]:
    """Checagens objetivas feitas pelo código. Retorna avisos para a interface."""
    warnings: list[str] = []
    allowed_notes = _profile_notes(profile)
    for nv in direction.olfactory_translation:
        if nv.note.strip().lower() not in allowed_notes:
            warnings.append(f"A nota '{nv.note}' não está na ficha olfativa pesquisada.")
    pal = check_palette([c.hex for c in direction.palette], guide)
    if pal["forbidden_used"]:
        warnings.append("Cores proibidas pelo guia na paleta: " + ", ".join(pal["forbidden_used"]))
    if pal["missing_official"]:
        warnings.append("Cores oficiais ausentes da paleta (serão aplicadas na montagem): " + ", ".join(pal["missing_official"]))
    total = sum(s.duration_s for s in direction.scenes)
    if abs(total - duration) > duration * 0.15:
        warnings.append(f"Soma das cenas = {total:.1f}s (pedido: {duration}s).")
    if direction.scenes and direction.scenes[-1].shot_type != "packshot":
        warnings.append("A última cena não é o packshot da marca.")
    for s in direction.scenes:
        if not 3 <= s.duration_s <= 8:
            warnings.append(f"Cena {s.index}: {s.duration_s}s fora do intervalo 3–8s dos modelos de vídeo.")
    return warnings


async def create_direction(
    *,
    guide: BrandGuide,
    identification: dict[str, Any],
    profile: dict[str, Any],
    duration: int,
    aspect: str,
    previous: list[dict[str, Any]],
    feedback: str | None = None,
) -> CreativeDirection:
    fmt = FORMATS[aspect]
    min_s, max_s = DURATIONS[duration]
    avoid = "\n".join(f"- {p.get('environment')}: {', '.join(p.get('key_elements', []))}" for p in previous) or "- (nenhum ainda)"
    brief = f"""Crie a direção de arte do comercial.

Formato: {aspect} ({fmt['label']}). Duração total: {duration} s, entre {min_s} e {max_s} cenas.

Frasco (descrição a partir da foto do cliente): {identification.get('bottle_description')}
Textos no frasco: {', '.join(identification.get('visible_text') or [])}

Ficha olfativa pesquisada (JSON, com fontes):
{profile}

Conceitos já usados em outros comerciais (NÃO repetir ambiente nem elementos centrais):
{avoid}
"""
    if feedback:
        brief += f"\nPedido do usuário para esta versão: {feedback}\n"

    system = SYSTEM_TEMPLATE.format(brand_raw=guide.raw, palette=guide.palette_summary())
    return await structured(
        system=system,
        content=[{"type": "text", "text": brief}],
        schema=CreativeDirection,
        effort="high",
        max_tokens=32000,
    )
