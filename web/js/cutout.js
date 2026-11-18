// Recorte do frasco a partir da foto do cliente (fundo branco/claro), feito no próprio aparelho.
// O frasco não é redesenhado: só o fundo vira transparente. Escritas e rótulo ficam como estão.

export async function cutout(blob, { tolerance = 28, feather = 1.5, maxSide = 1400 } = {}) {
  const bmp = await createImageBitmap(blob);
  const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
  const c = new OffscreenCanvas(w, h);
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(bmp, 0, 0, w, h);
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;

  // Já tem transparência? Usa como está.
  let transparent = 0;
  for (let i = 3; i < d.length; i += 16) if (d[i] < 250) transparent++;
  if (transparent > d.length / 16 * 0.05) return finish(c, g, img, w, h, null);

  // Cor do fundo: mediana das bordas.
  const border = [];
  const push = (x, y) => { const i = (y * w + x) * 4; border.push([d[i], d[i + 1], d[i + 2]]); };
  for (let x = 0; x < w; x += 4) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y += 4) { push(0, y); push(w - 1, y); }
  const med = [0, 1, 2].map((ch) => border.map((p) => p[ch]).sort((a, b) => a - b)[border.length >> 1]);
  const bgLum = (med[0] + med[1] + med[2]) / 3;

  // Preenchimento a partir das bordas: só remove fundo conectado à borda (não fura reflexos do vidro).
  const dist = new Float32Array(w * h);
  for (let p = 0, i = 0; p < w * h; p++, i += 4) {
    dist[p] = Math.hypot(d[i] - med[0], d[i + 1] - med[1], d[i + 2] - med[2]);
  }
  const bg = new Uint8Array(w * h);
  const stack = [];
  const seed = (p) => { if (!bg[p] && dist[p] < tolerance * 1.6) { bg[p] = 1; stack.push(p); } };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
  while (stack.length) {
    const p = stack.pop();
    const x = p % w, y = (p / w) | 0;
    const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
    for (const q of nb) if (q >= 0 && !bg[q] && dist[q] < tolerance * 1.6) { bg[q] = 1; stack.push(q); }
  }

  // Alfa suave na borda: pixels de fundo próximos do frasco ganham transparência parcial.
  let alpha = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) alpha[p] = bg[p] ? clamp01((dist[p] - tolerance * 0.5) / (tolerance * 1.1)) : 1;
  alpha = blur(alpha, w, h, feather);
  for (let p = 0; p < w * h; p++) if (bg[p]) alpha[p] = Math.min(alpha[p], clamp01((dist[p] - tolerance * 0.3) / tolerance));

  // Remove o halo branco: recupera a cor do frasco assumindo mistura com o fundo.
  for (let p = 0, i = 0; p < w * h; p++, i += 4) {
    const a = alpha[p];
    if (a < 1 && a > 0.02) for (let ch = 0; ch < 3; ch++) d[i + ch] = clamp255((d[i + ch] - (1 - a) * med[ch]) / a);
    d[i + 3] = Math.round(a * 255);
  }
  return finish(c, g, img, w, h, { background: med, backgroundLum: bgLum });
}

function finish(c, g, img, w, h, info) {
  const d = img.data;
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 <= x0 || y1 <= y0) throw new Error("Não foi possível separar o frasco do fundo. Tente uma foto com fundo branco liso.");
  g.putImageData(img, 0, 0);
  const pad = 2;
  const out = new OffscreenCanvas(x1 - x0 + 1 + pad * 2, y1 - y0 + 1 + pad * 2);
  out.getContext("2d").drawImage(c, x0, y0, x1 - x0 + 1, y1 - y0 + 1, pad, pad, x1 - x0 + 1, y1 - y0 + 1);
  const coverage = ((x1 - x0) * (y1 - y0)) / (w * h);
  return { canvas: out, info: { ...(info || { alreadyTransparent: true }), coverage } };
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const clamp255 = (v) => Math.min(255, Math.max(0, Math.round(v)));

function blur(src, w, h, r) {
  if (r <= 0) return src;
  const rad = Math.max(1, Math.round(r));
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    let acc = 0, n = 0;
    for (let x = -rad; x < w; x++) {
      if (x + rad < w) { acc += src[y * w + x + rad]; n++; }
      if (x - rad - 1 >= 0) { acc -= src[y * w + x - rad - 1]; n--; }
      if (x >= 0) tmp[y * w + x] = acc / n;
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0, n = 0;
    for (let y = -rad; y < h; y++) {
      if (y + rad < h) { acc += tmp[(y + rad) * w + x]; n++; }
      if (y - rad - 1 >= 0) { acc -= tmp[(y - rad - 1) * w + x]; n--; }
      if (y >= 0) out[y * w + x] = acc / n;
    }
  }
  return out;
}
