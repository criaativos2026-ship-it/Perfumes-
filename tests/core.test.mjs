// Testes das regras que rodam no aparelho (sem chamar a IA). Rode com: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseBrand, upsertProduct, checkPalette, joinNotes } from "../web/js/brand.js";
import { verifySources, normalizeDirection, similarity } from "../web/js/ai.js";

const md = readFileSync(new URL("../brand/CLAUDE.md", import.meta.url), "utf8");
const brand = parseBrand(md);

test("guia: cores oficiais, proibidas e fontes", () => {
  assert.deepEqual(brand.official.map((c) => c.hex), ["#4A1A17", "#F3EDE2", "#0E0C0B", "#B8955A", "#C9A66B", "#E6D3A8"]);
  assert.ok(brand.deprecated.includes("#34203A"));
  assert.ok(!brand.deprecated.includes("#C9A66B"));
  assert.equal(brand.colors.background, "#0E0C0B");
  assert.equal(brand.colors.accent, "#C9A66B");
  assert.ok(Object.values(brand.fonts).includes("Cormorant Garamond"));
  assert.deepEqual(checkPalette(["#34203A"], brand).forbidden, ["#34203A"]);
});

test("catálogo: insere e atualiza a ficha na seção 5", () => {
  const card = "### Teste (Marca)\n- Tipo / concentração: EDP\n";
  let out = upsertProduct(md, card);
  out = upsertProduct(out, card.replace("EDP", "EDT"));
  assert.equal(out.split("### Teste (Marca)").length, 2);
  assert.ok(out.includes("EDT") && out.indexOf("### Teste") > out.indexOf("## 5.") && out.indexOf("### Teste") < out.indexOf("## 6."));
});

const baseProfile = () => ({
  official_name: "X", brand: "B", concentration: "EDP", launch_year: "2020", perfumer: "",
  top_notes: ["bergamota"], heart_notes: ["rosa"], base_notes: ["âmbar"], olfactory_family: "âmbar floral",
  main_accords: [], key_ingredients: [], concept: "", notes_structure: "piramide",
  sources: [{ url: "https://www.marca.com/p", title: "Oficial", kind: "oficial" }, { url: "https://inventado.com/y", title: "?", kind: "outro" }],
  field_sources: [
    { field: "top_notes", urls: ["https://www.marca.com/p"] },
    { field: "heart_notes", urls: ["https://inventado.com/y"] },
    { field: "official_name", urls: ["https://marca.com/p"] },
    { field: "concentration", urls: ["https://loja.marca.com/p"] },
  ],
  conflicts: [],
});

test("pesquisa: descarta dados sem fonte que a busca realmente retornou", () => {
  const { profile, warnings } = verifySources(baseProfile(), ["marca.com"]);
  assert.deepEqual(profile.top_notes, ["bergamota"]);
  assert.deepEqual(profile.heart_notes, []);
  assert.deepEqual(profile.base_notes, []);
  assert.equal(profile.olfactory_family, "");
  assert.equal(profile.launch_year, "");
  assert.equal(profile.concentration, "EDP");
  assert.deepEqual(profile.sources.map((s) => s.url), ["https://www.marca.com/p"]);
  assert.ok(profile.not_found.includes("heart_notes") && warnings.length >= 3);
});

test("direção: abertura e packshot garantidos, notas inventadas removidas, duração ajustada", () => {
  const d = {
    olfactory_translation: [{ note: "Bergamota", visual: "v", glyph: "citrico" }, { note: "oud", visual: "v", glyph: "incenso" }],
    accent_colors: [{ hex: "#34203A", role: "ameixa" }, { hex: "#6B2A25", role: "ok" }], fog_colors: [],
    scenes: [{ type: "atmosfera", duration_s: 4, particles: "bokeh", particle_density: 2, glyphs: [], camera: "push_in", transition_in: "dissolve", text: "", sfx: [] }],
    end_card: {}, fingerprint: { environment: "x", key_elements: [] },
  };
  const { direction, warnings } = normalizeDirection(d, { brand, profile: baseProfile(), duration: 12 });
  assert.deepEqual(direction.olfactory_translation.map((t) => t.note), ["Bergamota"]);
  assert.deepEqual(direction.accent_colors.map((c) => c.hex), ["#6B2A25"]);
  assert.equal(direction.scenes[0].type, "abertura");
  assert.equal(direction.scenes.at(-1).type, "packshot");
  assert.equal(direction.scenes[1].particle_density, 1);
  assert.ok(Math.abs(direction.scenes.reduce((a, s) => a + s.duration_s, 0) - 12) < 0.3);
  assert.ok(warnings.length >= 2);
});

test("anti-repetição e notas", () => {
  const a = { environment: "floresta tropical noturna", key_elements: ["folhas", "orvalho", "musgo"] };
  const b = { environment: "floresta tropical", key_elements: ["folhas", "orvalho", "neblina"] };
  const c = { environment: "deserto dourado", key_elements: ["areia", "resina"] };
  assert.ok(similarity(a, b) >= 0.5 && similarity(a, c) < 0.5);
  assert.equal(joinNotes(["a", "b", "c"]), "a, b e c");
});
