// Ilustrações em traço fino (caixa 100x100), desenhadas progressivamente pelo motor.
// Estilo coerente com o símbolo da marca: linhas finas, sem preenchimento.
const r = (n) => Math.round(n * 100) / 100;
const rot = (cx, cy, x, y, a) => [r(cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a)), r(cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a))];
const circle = (cx, cy, rad) => `M${cx - rad} ${cy} a${rad} ${rad} 0 1 0 ${rad * 2} 0 a${rad} ${rad} 0 1 0 ${-rad * 2} 0`;

function petals(n, cx, cy, len, wid, offset = 0) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = offset + (i * 2 * Math.PI) / n;
    const p = (x, y) => rot(cx, cy, x, y, a).join(" ");
    out.push(`M${p(cx, cy)} C${p(cx - wid, cy - len * 0.4)} ${p(cx - wid * 0.6, cy - len)} ${p(cx, cy - len)} C${p(cx + wid * 0.6, cy - len)} ${p(cx + wid, cy - len * 0.4)} ${p(cx, cy)}`);
  }
  return out;
}

function star(n, cx, cy, R, rIn) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (i * Math.PI) / n - Math.PI / 2;
    const rad = i % 2 ? rIn : R;
    pts.push(`${r(cx + rad * Math.cos(a))} ${r(cy + rad * Math.sin(a))}`);
  }
  return "M" + pts.join(" L") + " Z";
}

export const GLYPHS = {
  citrico: { label: "fatia cítrica (bergamota, limão, laranja, toranja, mandarina)", paths: [
    circle(50, 50, 42), circle(50, 50, 35),
    ...Array.from({ length: 10 }, (_, i) => { const a = (i * Math.PI) / 5; return `M50 50 L${r(50 + 33 * Math.cos(a))} ${r(50 + 33 * Math.sin(a))}`; }),
  ] },
  rosa: { label: "rosa", paths: [
    "M50 46 m-5 0 a5 5 0 1 1 10 0 a9 9 0 1 1 -16 -3 a14 14 0 1 1 25 6 a20 20 0 1 1 -36 -5 a26 26 0 0 1 28 -26",
    "M50 72 C51 82 48 90 46 99", "M48 86 C40 80 32 82 28 86 C34 90 42 90 48 86",
  ] },
  flor_branca: { label: "flor branca (jasmim, flor de laranjeira, tuberosa, ylang)", paths: [...petals(5, 50, 50, 40, 13), circle(50, 50, 4)] },
  folha: { label: "folha (notas verdes, chá, menta, folha de violeta)", paths: [
    "M50 96 C18 72 18 30 50 4 C82 30 82 72 50 96 Z", "M50 92 L50 10",
    ...[28, 44, 60, 74].flatMap((y) => [`M50 ${y + 8} L${r(50 - (26 - Math.abs(y - 45) * 0.35))} ${y}`, `M50 ${y + 8} L${r(50 + (26 - Math.abs(y - 45) * 0.35))} ${y}`]),
  ] },
  lavanda: { label: "lavanda / ervas aromáticas", paths: [
    "M50 98 C50 70 51 45 50 6",
    ...Array.from({ length: 7 }, (_, i) => { const y = 10 + i * 7; const w = 4 + i * 0.5; return `M50 ${y + 4} C${50 - w} ${y + 2} ${50 - w} ${y - 3} 50 ${y - 3} C${50 + w} ${y - 3} ${50 + w} ${y + 2} 50 ${y + 4}`; }),
  ] },
  baunilha: { label: "fava de baunilha", paths: [
    "M12 88 C35 70 60 42 90 10", "M16 92 C40 74 64 46 92 14", "M90 10 C93 9 95 11 92 14",
    "M30 76 C33 78 34 80 33 83", "M52 56 C55 58 56 60 55 63",
  ] },
  madeira: { label: "madeira (cedro, sândalo, vetiver, oud)", paths: [
    circle(50, 50, 6), "M50 36 C60 36 65 44 64 52 C63 62 55 66 48 64 C38 62 35 54 37 46 C39 40 44 36 50 36",
    "M50 24 C66 24 77 36 76 52 C75 68 62 77 48 76 C32 75 23 64 24 49 C25 34 37 24 50 24",
    "M50 12 C72 12 89 28 88 52 C87 74 70 89 47 88 C25 87 11 71 12 49 C13 28 30 12 50 12", "M50 50 L80 70",
  ] },
  gota: { label: "gota (notas aquáticas, frescas, orvalho)", paths: [
    "M50 6 C50 6 22 48 22 66 A28 28 0 0 0 78 66 C78 48 50 6 50 6 Z", "M36 66 A14 14 0 0 0 46 80",
  ] },
  anis_estrelado: { label: "anis-estrelado / especiarias", paths: [star(8, 50, 50, 44, 14), circle(50, 50, 5)] },
  pimenta: { label: "pimenta / grãos de especiaria", paths: [circle(34, 40, 12), circle(62, 34, 10), circle(56, 64, 13), circle(30, 70, 8), "M34 30 l2 4", "M62 26 l2 3"] },
  grao: { label: "grão (café, fava tonka, cacau)", paths: [
    "M30 20 C48 12 62 30 58 52 C54 74 34 82 22 66 C12 52 14 28 30 20", "M30 22 C40 36 30 52 38 70",
    "M66 44 C82 40 92 56 86 72 C80 88 62 90 56 76", "M70 48 C74 58 66 68 74 82",
  ] },
  cristal_ambar: { label: "cristal de âmbar / resinas / benjoim / labdanum", paths: [
    "M50 6 L80 30 L72 80 L50 96 L28 80 L20 30 Z", "M50 6 L50 96", "M20 30 L50 46 L80 30", "M28 80 L50 46 L72 80",
  ] },
  fruta: { label: "fruta (maçã, pera, frutas vermelhas, pêssego)", paths: [
    "M50 30 C40 20 16 22 16 50 C16 78 36 94 50 86 C64 94 84 78 84 50 C84 22 60 20 50 30", "M50 30 C50 22 52 14 56 8", "M54 18 C62 10 74 12 76 16 C68 22 60 22 54 18",
  ] },
  almiscar: { label: "almíscar / notas de pele / talco (nuvem suave)", paths: [
    "M20 62 C8 62 8 44 22 44 C22 28 44 24 50 36 C56 22 80 26 78 44 C92 44 92 62 78 62 Z", "M30 74 C40 80 60 80 70 74", "M38 84 C46 88 54 88 62 84",
  ] },
  incenso: { label: "fumaça de incenso / couro / tabaco / defumado", paths: [
    "M50 96 L50 70", "M50 70 C40 60 60 52 50 42 C40 32 60 24 50 14 C46 10 48 6 52 4", "M44 78 C34 70 30 60 36 52", "M56 76 C68 68 70 58 64 50",
  ] },
};

// Comprimentos calculados uma vez (via SVG do navegador) para o efeito de desenho progressivo.
let measured = false;
export function measureGlyphs() {
  if (measured) return;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.style.position = "absolute"; svg.style.width = "0"; svg.style.height = "0";
  document.body.appendChild(svg);
  for (const g of Object.values(GLYPHS)) {
    g.compiled = g.paths.map((d) => {
      const el = document.createElementNS("http://www.w3.org/2000/svg", "path");
      el.setAttribute("d", d); svg.appendChild(el);
      return { path: new Path2D(d), length: el.getTotalLength() || 100 };
    });
  }
  svg.remove();
  measured = true;
}

// Desenha o glyph com progresso 0..1 (traço se desenhando).
export function drawGlyph(ctx, key, x, y, size, progress, color, lineWidth) {
  const g = GLYPHS[key];
  if (!g?.compiled) return;
  const total = g.compiled.reduce((a, p) => a + p.length, 0);
  let budget = total * Math.min(1, Math.max(0, progress));
  ctx.save();
  ctx.translate(x - size / 2, y - size / 2);
  ctx.scale(size / 100, size / 100);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth * (100 / size);
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (const p of g.compiled) {
    if (budget <= 0) break;
    const draw = Math.min(p.length, budget);
    ctx.setLineDash([draw, p.length + 1]);
    ctx.stroke(p.path);
    budget -= draw;
  }
  ctx.restore();
}
