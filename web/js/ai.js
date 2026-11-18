// Identificação, pesquisa olfativa e direção de arte (Gemini, plano gratuito).
import { generate, imagePart, AIError } from "./gemini.js";
import { paletteSummary, checkPalette } from "./brand.js";
import { GLYPHS } from "./glyphs.js";

export { AIError };

const S = (type, extra = {}) => ({ type, ...extra });
const STR = S("string");
const STRS = S("array", { items: STR });
const obj = (properties) => ({ type: "object", properties, required: Object.keys(properties) });

// ---------- 1. Identificação ----------
const IDENT_SCHEMA = obj({
  is_perfume: S("boolean"),
  brand: STR,
  product_name: STR,
  concentration: STR,
  visible_text: STRS,
  bottle_description: STR,
  has_box_in_photo: S("boolean"),
  white_background: S("boolean"),
  photo_quality: S("string", { enum: ["boa", "aceitável", "ruim"] }),
  photo_issues: STRS,
  confidence: S("string", { enum: ["alta", "média", "baixa"] }),
  possible_confusions: STRS,
});

export async function identify(cfg, photoBlob) {
  const { json } = await generate({
    ...cfg,
    system: `Você identifica perfumes a partir de fotos para um estúdio de publicidade.
- Baseie-se no que está ESCRITO e VISÍVEL. Transcreva os textos do frasco literalmente em visible_text.
- Se marca ou nome não estiverem legíveis, devolva "" e confiança baixa. Nunca adivinhe um nome.
- Em possible_confusions, liste perfumes de nome ou frasco parecido (ex.: Amazônico da Granado vs Amazonica da Rayhaan).
- bottle_description: descrição objetiva do frasco (formato, vidro, tampa, rótulo, cor do líquido).
- Responda em português do Brasil.`,
    parts: [await imagePart(photoBlob), { text: "Identifique o perfume desta foto." }],
    schema: IDENT_SCHEMA,
  });
  return json;
}

// ---------- 2. Pesquisa olfativa ----------
const FIELDS = ["official_name", "concentration", "top_notes", "heart_notes", "base_notes", "olfactory_family", "main_accords", "key_ingredients", "concept", "perfumer", "launch_year"];
const PROFILE_SCHEMA = obj({
  official_name: STR, brand: STR, concentration: STR, launch_year: STR, perfumer: STR,
  top_notes: STRS, heart_notes: STRS, base_notes: STRS,
  olfactory_family: STR, main_accords: STRS, key_ingredients: STRS, concept: STR,
  notes_structure: S("string", { enum: ["piramide", "linear", "desconhecida"] }),
  sources: S("array", { items: obj({ url: STR, title: STR, kind: S("string", { enum: ["oficial", "varejista", "base_especializada", "imprensa", "outro"] }) }) }),
  field_sources: S("array", { items: obj({ field: S("string", { enum: FIELDS }), urls: STRS }) }),
  conflicts: STRS,
});

const RESEARCH_SYSTEM = `Você é pesquisador de perfumaria. Use a busca do Google para levantar a ficha olfativa do perfume indicado.
Prioridade de fontes: 1) site oficial da marca/fabricante; 2) grandes varejistas (Sephora, Douglas, Notino, Época, Boticário…);
3) bases especializadas (Fragrantica, Parfumo, Basenotes).
Regras inegociáveis:
- NÃO invente notas, acordes, família, perfumista ou datas. Só registre o que encontrou numa fonte.
- Confira que a fonte fala exatamente deste perfume (versões como Intense, Elixir, Parfum são produtos diferentes).
- Para cada dado, informe a URL exata da página de onde veio.
- Se as fontes divergirem, registre a divergência e prefira a oficial. O que não encontrar, diga que não encontrou.
Escreva um relatório com: nome oficial, marca, concentração, ano, perfumista, notas de topo, coração e fundo
(ou "linear"), família olfativa, acordes, ingredientes de destaque, conceito da fragrância e as URLs de cada item.`;

const host = (u) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; } };

export function verifySources(profile, groundedDomains) {
  const ok = (url) => { const h = host(url); return !!h && groundedDomains.some((d) => h === d || h.endsWith("." + d) || d.endsWith("." + h)); };
  const warnings = [];
  const valid = {};
  for (const fs of profile.field_sources || []) {
    for (const u of fs.urls) {
      if (ok(u)) (valid[fs.field] ||= new Set()).add(u);
      else warnings.push(`Fonte descartada para "${fs.field}" (não apareceu na busca): ${u}`);
    }
  }
  const p = structuredClone(profile);
  const notFound = [];
  for (const f of FIELDS) {
    const v = p[f];
    const filled = Array.isArray(v) ? v.length > 0 : !!(v && String(v).trim());
    if (filled && !valid[f]) { p[f] = Array.isArray(v) ? [] : ""; warnings.push(`"${f}" descartado: sem fonte verificável.`); }
    if (!(Array.isArray(p[f]) ? p[f].length : p[f])) notFound.push(f);
  }
  p.field_sources = Object.entries(valid).map(([field, s]) => ({ field, urls: [...s] }));
  p.sources = (p.sources || []).filter((s) => ok(s.url));
  p.not_found = notFound;
  return { profile: p, warnings };
}

export async function research(cfg, { brand, product_name, concentration }) {
  const query = `${product_name} — ${brand}${concentration ? ` (${concentration})` : ""}`;
  const step1 = await generate({ ...cfg, system: RESEARCH_SYSTEM, parts: [{ text: "Perfume a pesquisar: " + query }], search: true });
  const domains = [...new Set(step1.grounding.map((g) => (g.domain || g.title || host(g.uri) || "").toLowerCase().replace(/^www\./, "")).filter(Boolean))];
  if (!domains.length) throw new AIError("A pesquisa não trouxe nenhuma fonte da internet. Tente novamente.");
  const step2 = await generate({
    ...cfg,
    system: `Converta o relatório em JSON copiando somente o que está nele.
- Cada campo preenchido precisa de uma entrada em field_sources com as URLs citadas no relatório para ele.
- Campos sem fonte no relatório ficam "" ou lista vazia.
- Notas em português do Brasil, minúsculas (ex.: "bergamota", "patchouli", "âmbar").`,
    parts: [{ text: `Perfume: ${query}\nSites consultados pela busca: ${domains.join(", ")}\n\nRelatório:\n${step1.text}` }],
    schema: PROFILE_SCHEMA,
  });
  const { profile, warnings } = verifySources(step2.json, domains);
  return { profile, warnings, report: step1.text, domains, queries: step1.queries };
}

// ---------- 3. Direção de arte ----------
export const SCENE_TYPES = {
  abertura: "logo da marca desenhada traço a traço, a gota cai no lugar (sempre a 1ª cena)",
  atmosfera: "névoa volumétrica em movimento, partículas e raios de luz; estabelece o mundo da fragrância",
  ingrediente: "ilustrações em traço dourado fino dos ingredientes se desenhando e flutuando, com partículas",
  frasco_revelacao: "o frasco real surge da escuridão com o foco de luz dourada crescendo e aproximação lenta",
  frasco_luz: "brilho dourado diagonal atravessa o frasco real, partículas orbitam, reflexo no piso",
  vortice: "FOTOS REAIS dos ingredientes saem do gargalo e sobem girando em redemoinho ao redor do frasco, com fitas douradas",
  orbita_ingredientes: "FOTOS REAIS dos ingredientes giram em 3D ao redor do frasco, passando na frente e atrás dele",
  close_ingrediente: "close em FOTOS REAIS de 1 ou 2 ingredientes flutuando, com outros desfocados ao fundo e à frente",
  notas: "as notas de topo, coração e fundo entram uma a uma em três colunas",
  packshot: "fechamento boutique: frasco, nome, fabricante, CTA (sempre a última cena)",
};
export const PARTICLES = ["poeira_dourada", "petalas", "gotas", "fumaca", "bokeh", "folhas", "faiscas", "nenhuma"];
export const CAMERAS = ["push_in", "pull_out", "pan_esquerda", "pan_direita", "sobe", "desce", "orbita", "estatico"];
export const TRANSITIONS = ["dissolve", "fade_preto", "luz"];
export const SFX = ["riser", "impacto", "brilho", "varredura", "sopro", "borrifo", "vidro", "pad"];

const HEXS = { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" };
const DIRECTION_SCHEMA = obj({
  campaign_title: STR,
  campaign_line: STR,
  concept: STR,
  olfactory_translation: S("array", { items: obj({ note: STR, visual: STR, glyph: S("string", { enum: Object.keys(GLYPHS) }) }) }),
  setting: STR,
  lighting: STR,
  accent_colors: S("array", { items: obj({ hex: HEXS, role: STR }) }),
  fog_colors: S("array", { items: HEXS }),
  motion_speed: S("string", { enum: ["muito_lenta", "lenta", "moderada"] }),
  scenes: S("array", { items: obj({
    type: S("string", { enum: Object.keys(SCENE_TYPES) }),
    duration_s: S("number"),
    title: STR,
    description: STR,
    particles: S("string", { enum: PARTICLES }),
    particle_density: S("number"),
    glyphs: S("array", { items: S("string", { enum: Object.keys(GLYPHS) }) }),
    notes: STRS,
    camera: S("string", { enum: CAMERAS }),
    transition_in: S("string", { enum: TRANSITIONS }),
    text: STR,
    sfx: S("array", { items: S("string", { enum: SFX }) }),
  }) }),
  end_card: obj({ perfume_name: STR, subtitle: STR, top: STR, heart: STR, base: STR, cta: STR }),
  brand_compliance: STRS,
  fingerprint: obj({ environment: STR, key_elements: STRS }),
});

const DURATION_SCENES = { 12: [5, 6], 20: [6, 8], 30: [8, 10] };

function directionSystem(brand) {
  return `Você é diretor de arte sênior de uma agência de publicidade de perfumaria de luxo.
O comercial é renderizado por um motor de animação dentro do celular: cenas em camadas com névoa volumétrica,
partículas, raios de luz, ilustrações em traço dourado fino, o frasco REAL (foto do cliente, nunca alterado),
movimentos de câmera e tipografia da marca. Você escolhe e parametriza as cenas.

=== GUIA DE MARCA (referência obrigatória) ===
${brand.raw}
=== FIM DO GUIA ===

Cores extraídas pelo sistema:
${paletteSummary(brand)}

Tipos de cena disponíveis:
${Object.entries(SCENE_TYPES).map(([k, v]) => `- ${k}: ${v}`).join("\n")}
Ilustrações disponíveis (glyphs): ${Object.entries(GLYPHS).map(([k, g]) => `${k} (${g.label})`).join(", ")}.

Regras:
- Cada perfume tem um mundo visual próprio derivado das notas REAIS da ficha; não repita ambientes já usados.
- Fundo sempre profundo, perto do preto da marca, com luz dourada. accent_colors e fog_colors são acentos escuros
  e quentes da fragrância (nunca as cores proibidas do guia; nunca cores saturadas que briguem com o preto e dourado).
- Primeira cena: abertura. Última cena: packshot. Inclua pelo menos uma cena de frasco e uma de notas.
- olfactory_translation só cita notas que estão na ficha; glyph é a ilustração mais próxima de cada nota.
- Textos na tela em português do Brasil, curtos, caixa de sentença, no tom do guia; "" quando a cena não tiver texto.
  Nada de caixa alta (exceto logotipo), emojis ou exageros.
- end_card.top/heart/base: notas separadas por vírgulas e "e" no final (padrão do guia). end_card.cta conforme o guia.
- particle_density entre 0 e 1. Uma ideia por cena, pausas longas, elegância pelo espaço vazio.
- Estilo de referência do cliente: comercial com ingredientes REAIS voando ao redor do frasco. Prefira as cenas
  vortice, orbita_ingredientes e close_ingrediente para apresentar as notas (topo, depois coração, depois fundo),
  e use "ingrediente" (traço dourado) só para notas sem foto. Em cada cena, "notes" lista as notas exatas da ficha
  que aparecem nela; nas demais cenas, "notes" é [].`;
}

export async function createDirection(cfg, { brand, ident, profile, duration, previous, feedback, photos }) {
  const [minS, maxS] = DURATION_SCENES[duration] || [6, 8];
  const avoid = previous.map((p) => `- ${p.environment}: ${p.key_elements.join(", ")}`).join("\n") || "- (nenhum ainda)";
  const brief = `Duração total: ${duration} s, entre ${minS} e ${maxS} cenas.
Frasco: ${ident.bottle_description}
Ficha olfativa (JSON): ${JSON.stringify(profile)}
Notas com foto real disponível: ${(photos || []).join(", ") || "(o cliente ainda vai enviar; planeje as fotos para todas as notas principais)"}
Conceitos já usados (NÃO repetir):
${avoid}
${feedback ? "Pedido do usuário para esta versão: " + feedback : ""}`;
  const { json } = await generate({ ...cfg, system: directionSystem(brand), parts: [{ text: brief }], schema: DIRECTION_SCHEMA });
  return normalizeDirection(json, { brand, profile, duration });
}

// Checagens e correções objetivas feitas pelo código.
export function normalizeDirection(d, { brand, profile, duration }) {
  const warnings = [];
  const notes = new Set([...profile.top_notes, ...profile.heart_notes, ...profile.base_notes, ...profile.main_accords, ...profile.key_ingredients].map((n) => n.toLowerCase().trim()));
  d.olfactory_translation = d.olfactory_translation.filter((t) => {
    const ok = notes.has(t.note.toLowerCase().trim());
    if (!ok) warnings.push(`Nota "${t.note}" removida: não está na ficha pesquisada.`);
    return ok;
  });
  const bad = new Set(brand.deprecated);
  const pal = checkPalette([...d.accent_colors.map((c) => c.hex), ...d.fog_colors], brand);
  if (pal.forbidden.length) warnings.push("Cores proibidas pelo guia removidas: " + pal.forbidden.join(", "));
  d.accent_colors = d.accent_colors.filter((c) => !bad.has(c.hex.toUpperCase()));
  d.fog_colors = d.fog_colors.filter((h) => !bad.has(h.toUpperCase()));
  if (!d.fog_colors.length) d.fog_colors = [brand.colors.glow, brand.colors.brand];

  let scenes = d.scenes.filter((s) => s.type !== "abertura" && s.type !== "packshot");
  const first = d.scenes.find((s) => s.type === "abertura") || { type: "abertura", duration_s: 2.5, title: "Abertura", description: "Logo da marca", particles: "poeira_dourada", particle_density: 0.3, glyphs: [], camera: "estatico", transition_in: "fade_preto", text: "", sfx: ["riser"] };
  const last = d.scenes.find((s) => s.type === "packshot") || { type: "packshot", duration_s: 4, title: "Packshot", description: "Fechamento boutique", particles: "poeira_dourada", particle_density: 0.3, glyphs: [], camera: "push_in", transition_in: "dissolve", text: "", sfx: ["brilho"] };
  if (!d.scenes.some((s) => s.type === "abertura") || !d.scenes.some((s) => s.type === "packshot")) warnings.push("Abertura/packshot da marca acrescentados automaticamente.");
  scenes = [first, ...scenes, last];
  for (const s of scenes) {
    s.duration_s = Math.min(7, Math.max(2, Number(s.duration_s) || 3));
    s.particle_density = Math.min(1, Math.max(0, Number(s.particle_density) || 0));
    s.glyphs = (s.glyphs || []).slice(0, 3);
    s.notes = (s.notes || []).filter((n) => notes.has(n.toLowerCase().trim()));
  }
  const total = scenes.reduce((a, s) => a + s.duration_s, 0);
  const k = duration / total;
  scenes.forEach((s, i) => { s.duration_s = Math.round(s.duration_s * k * 10) / 10; s.index = i + 1; });
  const drift = duration - scenes.reduce((a, s) => a + s.duration_s, 0);
  scenes.at(-1).duration_s = Math.round((scenes.at(-1).duration_s + drift) * 10) / 10;
  d.scenes = scenes;
  return { direction: d, warnings };
}

export function similarity(a, b) {
  const words = (x) => new Set((x.environment + " " + x.key_elements.join(" ")).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").match(/[a-z]{4,}/g) || []);
  const wa = words(a), wb = words(b);
  if (!wa.size || !wb.size) return 0;
  let inter = 0; wa.forEach((w) => wb.has(w) && inter++);
  return inter / (wa.size + wb.size - inter);
}
