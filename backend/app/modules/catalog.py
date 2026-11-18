"""Atualiza a seção 5 (Catálogo de produtos) do guia de marca, como o próprio guia exige."""
from __future__ import annotations

import re
import threading
from pathlib import Path
from typing import Any

from ..config import settings

_lock = threading.Lock()
SECTION_RE = re.compile(r"^## 5\..*$", re.M)
NEXT_SECTION_RE = re.compile(r"^---\s*$|^## \d+\.", re.M)


def _join(notes: list[str]) -> str:
    if not notes:
        return "não encontrado"
    return notes[0] if len(notes) == 1 else ", ".join(notes[:-1]) + " e " + notes[-1]


def product_card(ident: dict[str, Any], profile: dict[str, Any], direction: dict[str, Any] | None, pieces: list[str]) -> str:
    name = profile.get("official_name") or ident.get("product_name") or "?"
    brand = profile.get("brand") or ident.get("brand") or "?"
    sources = ", ".join(s["url"] for s in profile.get("sources", [])) or "nenhuma"
    return (
        f"### {name} ({brand})\n"
        f"- Tipo / concentração: {profile.get('concentration') or ident.get('concentration') or 'não informado'}\n"
        f"- Notas (topo, coração, fundo): topo: {_join(profile.get('top_notes', []))}; "
        f"coração: {_join(profile.get('heart_notes', []))}; fundo: {_join(profile.get('base_notes', []))}\n"
        f"- Frase de campanha: {(direction or {}).get('campaign_line', 'a definir')} (sugestão)\n"
        f"- Frasco (descrição visual): {ident.get('bottle_description', '')}\n"
        f"- Foto fornecida pelo usuário: sim\n"
        f"- Peças criadas (posts, vídeos): {', '.join(pieces) or 'em produção'}\n"
        f"- Fonte das informações: {sources} (conferir com o fornecedor antes de publicar)\n"
    )


def upsert_product(card: str, path: Path | None = None) -> bool:
    """Insere ou substitui a ficha (pelo título ###) no fim da seção 5. Retorna False se a seção não existir."""
    path = path or settings.brand_file
    with _lock:
        md = path.read_text(encoding="utf-8")
        sec = SECTION_RE.search(md)
        if not sec:
            return False
        nxt = NEXT_SECTION_RE.search(md, sec.end())
        end = nxt.start() if nxt else len(md)
        section = md[sec.end():end]
        title = card.splitlines()[0]
        existing = re.compile(rf"^{re.escape(title)}\n(?:- .*\n?)*", re.M)
        if existing.search(section):
            section = existing.sub(card, section, count=1)
        else:
            section = section.rstrip("\n") + "\n\n" + card + "\n"
        path.write_text(md[:sec.end()] + section + md[end:], encoding="utf-8")
    return True
