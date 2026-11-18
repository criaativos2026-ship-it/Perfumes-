import shutil
from pathlib import Path
from types import SimpleNamespace as NS

from app.brand import check_palette, load_brand
from app.modules import catalog
from app.modules.direction import similarity
from app.modules.research import OlfactoryProfile, collect_urls, verify_sources

BRAND = Path(__file__).resolve().parents[2] / "brand" / "CLAUDE.md"


def test_brand_palette_parsed():
    g = load_brand(BRAND)
    assert g.official_hex == ["#4A1A17", "#F3EDE2", "#0E0C0B", "#B8955A", "#C9A66B", "#E6D3A8"]
    assert "#34203A" in g.deprecated_hex  # ameixa foi abandonada
    assert "#C9A66B" not in g.deprecated_hex
    assert g.fonts and "Cormorant Garamond" in g.fonts.values()
    assert check_palette(["#34203A", "#0E0C0B"], g)["forbidden_used"] == ["#34203A"]


def _profile(**kw):
    base = dict(
        official_name="X", brand="B", manufacturer=None, concentration="EDP", launch_year=2020, perfumer=None, gender=None,
        top_notes=["bergamota"], heart_notes=["rosa"], base_notes=["âmbar"], olfactory_family="Âmbar floral",
        main_accords=[], key_ingredients=[], concept=None, notes_structure="piramide", sources=[], field_sources=[],
        conflicts=[], not_found=[],
    )
    base.update(kw)
    return OlfactoryProfile.model_validate(base)


def test_unverified_sources_are_dropped():
    prof = _profile(
        sources=[{"url": "https://www.marca.com/x", "title": "Oficial", "kind": "oficial"},
                 {"url": "https://inventado.com/y", "title": "?", "kind": "outro"}],
        field_sources=[
            {"field": "top_notes", "urls": ["https://marca.com/x/"]},
            {"field": "heart_notes", "urls": ["https://inventado.com/y"]},
            {"field": "official_name", "urls": ["https://marca.com/x"]},
            {"field": "concentration", "urls": ["https://marca.com/x"]},
        ],
    )
    out, warnings = verify_sources(prof, {"https://www.marca.com/x"})
    assert out.top_notes == ["bergamota"]
    assert out.heart_notes == []           # fonte não consultada
    assert out.base_notes == []            # sem fonte
    assert out.olfactory_family is None
    assert out.launch_year is None
    assert "heart_notes" in out.not_found and "base_notes" in out.not_found
    assert [s.url for s in out.sources] == ["https://www.marca.com/x"]
    assert warnings


def test_collect_urls_from_tool_blocks():
    blocks = [
        NS(type="web_search_tool_result", content=[NS(url="https://a.com/1"), NS(url="https://b.com/2")]),
        NS(type="web_search_tool_result", content=NS(error_code="max_uses_exceeded")),
        NS(type="web_fetch_tool_result", content=NS(url="https://c.com/3")),
        NS(type="text", text="relatório", citations=[NS(url="https://a.com/1")]),
    ]
    urls, text = collect_urls(blocks)
    assert urls == {"https://a.com/1", "https://b.com/2", "https://c.com/3"}
    assert text == "relatório"


def test_catalog_upsert(tmp_path):
    f = tmp_path / "CLAUDE.md"
    shutil.copy(BRAND, f)
    ident = {"product_name": "Teste", "brand": "Marca", "bottle_description": "frasco quadrado"}
    prof = _profile(official_name="Teste", brand="Marca", top_notes=["a", "b", "c"]).model_dump()
    card = catalog.product_card(ident, prof, {"campaign_line": "Linha."}, ["vídeo 9:16"])
    assert "topo: a, b e c" in card
    assert catalog.upsert_product(card, f)
    assert catalog.upsert_product(card.replace("vídeo 9:16", "vídeo 4:5"), f)
    md = f.read_text()
    assert md.count("### Teste (Marca)") == 1 and "vídeo 4:5" in md
    sec5 = md.index("## 5."), md.index("## 6.")
    assert sec5[0] < md.index("### Teste (Marca)") < sec5[1]


def test_similarity():
    a = {"environment": "floresta tropical noturna", "key_elements": ["folhas", "orvalho", "musgo"]}
    b = {"environment": "floresta tropical", "key_elements": ["folhas", "orvalho", "neblina"]}
    c = {"environment": "deserto dourado", "key_elements": ["areia", "resina", "vento"]}
    assert similarity(a, b) >= 0.5 > similarity(a, c)
