"""M1: identificação do perfume a partir da foto (Claude Vision)."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from ..claude import image_block, structured


class Identification(BaseModel):
    is_perfume: bool = Field(description="A foto mostra um frasco de perfume?")
    brand: str | None = Field(description="Marca/fabricante exatamente como aparece no frasco ou embalagem")
    product_name: str | None = Field(description="Nome comercial do perfume, como escrito no frasco")
    concentration: str | None = Field(description="EDP, EDT, Parfum, Extrait, Cologne... se legível")
    volume_ml: int | None
    visible_text: list[str] = Field(description="Todos os textos legíveis no frasco/caixa, literalmente")
    bottle_description: str = Field(description="Descrição visual objetiva do frasco: formato, cor do vidro, tampa, rótulo, cor do líquido")
    has_box_in_photo: bool
    background: Literal["branco", "claro", "escuro", "cenário", "outro"]
    photo_quality: Literal["boa", "aceitável", "ruim"]
    photo_issues: list[str] = Field(description="Problemas que prejudicam recorte ou fidelidade (reflexos, baixa resolução, corte do frasco, print de tela)")
    confidence: Literal["alta", "média", "baixa"]
    possible_confusions: list[str] = Field(description="Outros perfumes com nome ou frasco parecido que podem ser confundidos com este")
    reasoning: str = Field(description="Como chegou à identificação, citando o que está escrito no frasco")


SYSTEM = """Você identifica perfumes a partir de fotos para um estúdio de publicidade.
Regras:
- Baseie-se no que está ESCRITO e VISÍVEL. Transcreva os textos do frasco literalmente.
- Se o nome ou a marca não estiverem legíveis, devolva null e confiança baixa. Nunca adivinhe um nome.
- Aponte perfumes de nome parecido que podem gerar confusão (ex.: Amazônico da Granado vs Amazonica da Rayhaan).
- Responda em português do Brasil."""


async def identify(image_path: str) -> Identification:
    return await structured(
        system=SYSTEM,
        content=[image_block(image_path), {"type": "text", "text": "Identifique o perfume desta foto."}],
        schema=Identification,
        effort="medium",
    )
