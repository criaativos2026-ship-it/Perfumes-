"""M2: pesquisa olfativa na internet, com fonte obrigatória para cada dado.

Duas etapas:
1. Claude pesquisa com web_search/web_fetch e escreve um relatório com URLs.
2. Claude estrutura o relatório em JSON.
Depois o código confere que toda URL citada foi de fato obtida nas buscas;
um dado sem fonte verificável é descartado e marcado como "não encontrado".
"""
from __future__ import annotations

from typing import Any, Literal
from urllib.parse import urlparse

from pydantic import BaseModel, Field

from ..claude import StepError, structured, with_server_tools
from ..config import settings


class Source(BaseModel):
    url: str
    title: str | None
    kind: Literal["oficial", "varejista", "base_especializada", "imprensa", "outro"]


class FieldSource(BaseModel):
    field: Literal[
        "top_notes", "heart_notes", "base_notes", "olfactory_family", "main_accords",
        "key_ingredients", "concept", "perfumer", "launch_year", "concentration", "official_name",
    ]
    urls: list[str]


class OlfactoryProfile(BaseModel):
    official_name: str | None
    brand: str | None
    manufacturer: str | None = Field(description="Empresa fabricante/grupo, se diferente da marca")
    concentration: str | None
    launch_year: int | None
    perfumer: str | None
    gender: str | None
    top_notes: list[str]
    heart_notes: list[str]
    base_notes: list[str]
    olfactory_family: str | None
    main_accords: list[str]
    key_ingredients: list[str]
    concept: str | None = Field(description="Conceito/inspiração da fragrância segundo a marca ou fontes, resumido em pt-BR")
    notes_structure: Literal["piramide", "linear", "desconhecida"]
    sources: list[Source]
    field_sources: list[FieldSource]
    conflicts: list[str] = Field(description="Divergências entre fontes, descritas em pt-BR")
    not_found: list[str] = Field(description="Campos que não foram encontrados em fontes confiáveis")


RESEARCH_SYSTEM = """Você é um pesquisador de perfumaria. Pesquise na internet a ficha olfativa do perfume indicado.

Prioridade de fontes:
1. Site oficial da marca ou do grupo fabricante.
2. Varejistas oficiais/grandes (Sephora, Douglas, Notino, Boticário, Época Cosméticos etc.).
3. Bases especializadas (Fragrantica, Parfumo, Basenotes).

Regras inegociáveis:
- NÃO invente notas, acordes, famílias, perfumistas ou datas. Só registre o que leu em uma fonte.
- Confira que a fonte fala exatamente deste perfume (mesma marca, mesmo nome, mesma concentração/versão: "Intense", "Elixir", "Parfum" são produtos diferentes).
- Para cada dado, registre a URL exata de onde veio.
- Se as fontes divergirem, registre a divergência e dê preferência à oficial.
- Se algo não for encontrado, diga que não foi encontrado.

Termine com um relatório em texto contendo: nome oficial, marca, fabricante, concentração, ano, perfumista,
notas de saída/topo, coração e fundo (ou "linear" se a marca não divide em pirâmide), família olfativa,
acordes principais, ingredientes de destaque, conceito da fragrância, e, para CADA item, as URLs das fontes."""

STRUCTURE_SYSTEM = """Converta o relatório de pesquisa em JSON. Copie somente o que está no relatório.
- Cada campo preenchido precisa de uma entrada em field_sources com as URLs citadas no relatório para ele.
- Campos sem fonte no relatório ficam null ou lista vazia, e entram em not_found.
- Use apenas URLs que aparecem no relatório ou na lista de URLs consultadas.
- Notas em português do Brasil (ex.: "bergamota", "patchouli", "âmbar"), primeira letra minúscula."""

FIELD_KEYS = {
    "top_notes", "heart_notes", "base_notes", "olfactory_family", "main_accords", "key_ingredients",
    "concept", "perfumer", "launch_year", "concentration", "official_name",
}


def _norm(url: str) -> str:
    p = urlparse(url.strip())
    return f"{p.netloc.lower().removeprefix('www.')}{p.path.rstrip('/')}"


def collect_urls(blocks: list[Any]) -> tuple[set[str], str]:
    """URLs efetivamente retornadas pelas ferramentas + texto final do relatório."""
    urls: set[str] = set()
    texts: list[str] = []
    for b in blocks:
        t = getattr(b, "type", None)
        if t == "web_search_tool_result":
            content = getattr(b, "content", None)
            if isinstance(content, list):
                for r in content:
                    if getattr(r, "url", None):
                        urls.add(r.url)
        elif t == "web_fetch_tool_result":
            content = getattr(b, "content", None)
            if getattr(content, "url", None):
                urls.add(content.url)
        elif t == "text":
            texts.append(b.text)
            for c in getattr(b, "citations", None) or []:
                if getattr(c, "url", None):
                    urls.add(c.url)
    return urls, "\n".join(texts)


def verify_sources(profile: OlfactoryProfile, retrieved: set[str]) -> tuple[OlfactoryProfile, list[str]]:
    """Remove dados cujas fontes não foram realmente consultadas. Retorna avisos."""
    ok = {_norm(u) for u in retrieved}
    warnings: list[str] = []
    data = profile.model_dump()
    valid_sources: dict[str, list[str]] = {}
    for fs in profile.field_sources:
        good = [u for u in fs.urls if _norm(u) in ok]
        bad = [u for u in fs.urls if _norm(u) not in ok]
        if bad:
            warnings.append(f"Fontes não verificadas descartadas para '{fs.field}': {', '.join(bad)}")
        if good:
            valid_sources.setdefault(fs.field, []).extend(good)

    not_found = set(data["not_found"])
    for key in FIELD_KEYS:
        value = data.get(key)
        filled = bool(value) if not isinstance(value, int) else True
        if filled and key not in valid_sources:
            data[key] = [] if isinstance(value, list) else None
            not_found.add(key)
            warnings.append(f"'{key}' descartado: nenhuma fonte verificável.")

    data["field_sources"] = [{"field": k, "urls": sorted(set(v))} for k, v in valid_sources.items()]
    data["sources"] = [s for s in data["sources"] if _norm(s["url"]) in ok]
    data["not_found"] = sorted(not_found)
    return OlfactoryProfile.model_validate(data), warnings


async def research(brand: str, name: str, concentration: str | None = None) -> dict[str, Any]:
    query = f"{name} — {brand}" + (f" ({concentration})" if concentration else "")
    tools = [
        {"type": "web_search_20260209", "name": "web_search", "max_uses": settings.research_max_searches},
        {"type": "web_fetch_20260209", "name": "web_fetch", "max_uses": settings.research_max_fetches},
    ]
    blocks = await with_server_tools(
        system=RESEARCH_SYSTEM,
        content=[{"type": "text", "text": f"Perfume a pesquisar: {query}"}],
        tools=tools,
        effort="medium",
    )
    retrieved, report = collect_urls(blocks)
    if not retrieved:
        raise StepError("A pesquisa não retornou nenhuma fonte da internet. Verifique o acesso à busca e tente novamente.")
    if not report.strip():
        raise StepError("A pesquisa não produziu relatório.")

    profile = await structured(
        system=STRUCTURE_SYSTEM,
        content=[{
            "type": "text",
            "text": f"Perfume: {query}\n\nURLs consultadas:\n" + "\n".join(sorted(retrieved)) + f"\n\nRelatório:\n{report}",
        }],
        schema=OlfactoryProfile,
        effort="low",
    )
    profile, warnings = verify_sources(profile, retrieved)
    return {"profile": profile.model_dump(), "warnings": warnings, "report": report, "retrieved_urls": sorted(retrieved)}
