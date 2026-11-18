// Leitura do guia de marca (brand/CLAUDE.md). O texto inteiro vai para a IA;
// cores HEX e fontes são extraídas pelo código e aplicadas diretamente no vídeo.
const HEX = /#[0-9A-Fa-f]{6}\b/g;

function sections(md) {
  const out = [];
  const re = /^(#{2,3}) (.+)$/gm;
  let m, last = null;
  while ((m = re.exec(md))) {
    if (last) last.body = md.slice(last.end, m.index);
    last = { title: m[2].trim(), end: re.lastIndex };
    out.push(last);
  }
  if (last) last.body = md.slice(last.end);
  return out;
}

function tableColors(body) {
  const colors = [];
  for (const line of body.split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    const idx = cells.findIndex((c) => /#[0-9A-Fa-f]{6}/.test(c));
    if (idx < 0) continue;
    const clean = (s) => s.replace(/[*`]/g, "").trim();
    for (const hex of cells[idx].match(HEX)) {
      colors.push({ name: idx > 0 ? clean(cells[0]) : hex.toUpperCase(), hex: hex.toUpperCase(), usage: cells.length > idx + 1 ? clean(cells.at(-1)) : "" });
    }
  }
  return colors;
}

export function parseBrand(md) {
  const title = md.match(/^# .*?:\s*(.+)$/m) || md.match(/^# (.+)$/m);
  const brand = { raw: md, name: title ? title[1].trim() : "Marca", official: [], support: [], deprecated: [], fonts: {} };
  for (const s of sections(md)) {
    const h = s.title.toLowerCase();
    if (h.includes("paleta oficial") || (h.includes("oficial") && h.includes("cor"))) brand.official.push(...tableColors(s.body));
    else if (h.includes("apoio")) brand.support.push(...tableColors(s.body));
    else if (/anteriores|histórico|não usar|nao usar/.test(h)) brand.deprecated.push(...(s.body.match(HEX) || []).map((x) => x.toUpperCase()));
    else if (h.includes("tipografia")) {
      for (const line of s.body.split("\n")) {
        const f = line.match(/\*\*([^*]+)\*\*/);
        if (f && line.trim().startsWith("|")) brand.fonts[line.replace(/^\s*\|/, "").split("|")[0].trim()] = f[1].trim();
      }
    }
  }
  if (!brand.official.length) brand.official = [...new Set(md.match(HEX) || [])].map((h) => ({ name: h, hex: h.toUpperCase(), usage: "" }));
  const off = new Set(brand.official.map((c) => c.hex));
  brand.support = brand.support.filter((c) => !off.has(c.hex));
  const allowed = new Set([...off, ...brand.support.map((c) => c.hex)]);
  brand.deprecated = [...new Set(brand.deprecated)].filter((h) => !allowed.has(h)).sort();
  brand.short = brand.name.split(/\s+/)[0].toUpperCase();
  brand.colors = roles(brand);
  return brand;
}

// Papéis visuais usados pelo motor de animação, escolhidos pelo nome/uso da cor no guia.
function roles(b) {
  const all = [...b.official, ...b.support];
  const find = (...words) => all.find((c) => words.some((w) => (c.name + " " + c.usage).toLowerCase().includes(w)))?.hex;
  return {
    background: find("preto", "noir", "fundo principal") || "#0E0C0B",
    text: find("marfim", "ivory", "textos sobre fundo escuro") || "#F3EDE2",
    accent: find("ouro claro", "gota e textos dourados") || "#C9A66B",
    line: find("ouro antigo", "linhas") || "#B8955A",
    soft: find("champagne") || "#E6D3A8",
    brand: find("bordeaux", "bordô") || "#4A1A17",
    frame: find("moldura") || "#6B5636",
    glow: find("glow", "luz dourada (glow)") || "#5A4521",
    floor: find("piso") || "#7A6030",
    muted: find("texto secundário claro") || "#CFC4B0",
  };
}

export function paletteSummary(b) {
  return [
    "Paleta oficial (obrigatória):", ...b.official.map((c) => `- ${c.name}: ${c.hex} (${c.usage})`),
    "Cores de apoio permitidas:", ...b.support.map((c) => `- ${c.hex} (${c.usage})`),
    b.deprecated.length ? "Cores PROIBIDAS (versões anteriores): " + b.deprecated.join(", ") : "",
  ].join("\n");
}

export function checkPalette(hexes, b) {
  const used = new Set(hexes.map((h) => h.toUpperCase()));
  return {
    forbidden: b.deprecated.filter((h) => used.has(h)),
    missing: b.official.map((c) => c.hex).filter((h) => !used.has(h)),
  };
}

// Atualiza a seção 5 (Catálogo) do guia com a ficha do produto, como o guia pede.
export function upsertProduct(md, card) {
  const sec = md.match(/^## 5\..*$/m);
  if (!sec) return null;
  const start = sec.index + sec[0].length;
  const rest = md.slice(start);
  const next = rest.search(/^---\s*$|^## \d+\./m);
  const end = next < 0 ? md.length : start + next;
  let section = md.slice(start, end);
  const title = card.split("\n")[0];
  const esc = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${esc}\\n(?:- .*\\n?)*`, "m");
  section = re.test(section) ? section.replace(re, card) : section.replace(/\n*$/, "") + "\n\n" + card + "\n";
  return md.slice(0, start) + section + md.slice(end);
}

export function joinNotes(list) {
  if (!list || !list.length) return "";
  return list.length === 1 ? list[0] : list.slice(0, -1).join(", ") + " e " + list.at(-1);
}
