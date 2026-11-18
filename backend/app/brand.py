"""Leitura do guia de marca (brand/CLAUDE.md).

O arquivo inteiro é enviado ao Claude como referência obrigatória, e as partes
objetivas (cores HEX, fontes) são extraídas pelo código para serem injetadas e
validadas, sem depender de o modelo "lembrar" delas.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

from .config import settings

HEX_RE = re.compile(r"#[0-9A-Fa-f]{6}\b")


@dataclass
class BrandColor:
    name: str
    hex: str
    usage: str


@dataclass
class BrandGuide:
    raw: str
    brand_name: str
    official_palette: list[BrandColor]
    support_colors: list[BrandColor]
    deprecated_hex: list[str]
    fonts: dict[str, str] = field(default_factory=dict)

    @property
    def official_hex(self) -> list[str]:
        return [c.hex for c in self.official_palette]

    @property
    def allowed_hex(self) -> set[str]:
        return {c.hex for c in self.official_palette + self.support_colors}

    def palette_summary(self) -> str:
        lines = ["Paleta oficial (obrigatória):"]
        lines += [f"- {c.name}: {c.hex} ({c.usage})" for c in self.official_palette]
        if self.support_colors:
            lines.append("Cores de apoio permitidas:")
            lines += [f"- {c.hex} ({c.usage})" for c in self.support_colors]
        if self.deprecated_hex:
            lines.append("Cores PROIBIDAS (versões anteriores): " + ", ".join(self.deprecated_hex))
        return "\n".join(lines)


def _sections(md: str) -> list[tuple[str, str]]:
    """Divide o markdown em (título, corpo) por cabeçalhos de nível 2 ou 3."""
    parts = re.split(r"^(#{2,3} .+)$", md, flags=re.M)
    out = []
    for i in range(1, len(parts), 2):
        out.append((parts[i].lstrip("# ").strip(), parts[i + 1]))
    return out


def _table_colors(body: str) -> list[BrandColor]:
    colors: list[BrandColor] = []
    for line in body.splitlines():
        if not line.strip().startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        hexes = [h for c in cells for h in HEX_RE.findall(c)]
        if not hexes:
            continue
        hex_cell_idx = next(i for i, c in enumerate(cells) if HEX_RE.search(c))
        name = re.sub(r"[*`]", "", cells[0]).strip() if hex_cell_idx > 0 else ""
        usage = re.sub(r"[*`]", "", cells[-1]).strip() if len(cells) > hex_cell_idx + 1 else ""
        for h in hexes:
            colors.append(BrandColor(name=name or h, hex=h.upper(), usage=usage))
    return colors


def parse_brand(md: str) -> BrandGuide:
    title = re.search(r"^# .*?:\s*(.+)$", md, flags=re.M) or re.search(r"^# (.+)$", md, flags=re.M)
    brand_name = title.group(1).strip() if title else "Marca"

    official: list[BrandColor] = []
    support: list[BrandColor] = []
    deprecated: list[str] = []
    fonts: dict[str, str] = {}

    for heading, body in _sections(md):
        h = heading.lower()
        if "paleta oficial" in h or ("oficial" in h and "cor" in h):
            official += _table_colors(body)
        elif "apoio" in h:
            support += _table_colors(body)
        elif "anteriores" in h or "histórico" in h or "nao usar" in h or "não usar" in h:
            deprecated += [x.upper() for x in HEX_RE.findall(body)]
        elif "tipografia" in h:
            for line in body.splitlines():
                m = re.findall(r"\*\*([^*]+)\*\*", line)
                if m and line.strip().startswith("|"):
                    use = line.strip().strip("|").split("|")[0].strip()
                    fonts[use] = m[0].strip()

    if not official:  # guia sem tabela reconhecível: usa todos os HEX encontrados
        official = [BrandColor(name=h.upper(), hex=h.upper(), usage="") for h in dict.fromkeys(HEX_RE.findall(md))]

    official_set = {c.hex for c in official}
    support = [c for c in support if c.hex not in official_set]
    allowed = official_set | {c.hex for c in support}
    deprecated = sorted({h for h in deprecated if h not in allowed})
    return BrandGuide(raw=md, brand_name=brand_name, official_palette=official, support_colors=support, deprecated_hex=deprecated, fonts=fonts)


def load_brand(path: Path | None = None) -> BrandGuide:
    path = path or settings.brand_file
    if not path.exists():
        raise FileNotFoundError(f"Guia de marca não encontrado em {path}. Coloque o CLAUDE.md da marca em brand/CLAUDE.md.")
    return parse_brand(path.read_text(encoding="utf-8"))


def check_palette(hex_list: list[str], guide: BrandGuide) -> dict:
    """Valida a paleta de um conceito contra o guia."""
    used = {h.upper() for h in hex_list}
    missing = [c.hex for c in guide.official_palette if c.hex not in used]
    forbidden = sorted(used & set(guide.deprecated_hex))
    return {"missing_official": missing, "forbidden_used": forbidden, "ok": not forbidden}
