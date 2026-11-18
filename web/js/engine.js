// Motor de animação do comercial. Desenha qualquer instante t (segundos) de forma determinística,
// o que permite prévia em tempo real, refazer cenas e exportar quadro a quadro.
import { drawGlyph, measureGlyphs } from "./glyphs.js";

const SERIF = '"Cormorant Garamond", FreeSerif, Georgia, serif';
const SANS = 'Jost, Inter, system-ui, sans-serif';
export const TRANSITION = 0.7;

// ---------- utilidades ----------
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const ramp = (t, a, b) => clamp((t - a) / (b - a));
function hash(i, s) {
  let x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
  return x - Math.floor(x);
}
function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgba = (hex, a) => `rgba(${rgb(hex).join(",")},${a})`;
function canvas(w, h) {
  return typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
}
function glowSprite(hex, size, falloff = 1) {
  const c = canvas(size, size);
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, rgba(hex, 1));
  grd.addColorStop(0.35 * falloff, rgba(hex, 0.45));
  grd.addColorStop(1, rgba(hex, 0));
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  return c;
}

function spacedText(ctx, text, x, y, spacing, align = "center") {
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let cx = align === "center" ? x - total / 2 : x;
  ctx.textAlign = "left";
  chars.forEach((c, i) => { ctx.fillText(c, cx, y); cx += widths[i] + spacing; });
  return total;
}

function wrap(ctx, text, maxW) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

// ---------- motor ----------
export class Engine {
  constructor({ canvas: cv, brand, direction, bottle, width, height }) {
    measureGlyphs();
    this.cv = cv;
    this.ctx = cv.getContext("2d");
    this.W = width; this.H = height;
    cv.width = width; cv.height = height;
    this.k = width / 1080;
    this.brand = brand;
    this.c = brand.colors;
    this.bottle = bottle;
    this.setDirection(direction);
    this.prepare();
  }

  setDirection(d) {
    this.d = d;
    this.speed = { muito_lenta: 0.6, lenta: 0.85, moderada: 1.1 }[d.motion_speed] || 0.85;
    let t = 0;
    this.timeline = d.scenes.map((s) => { const e = { scene: s, start: t, dur: s.duration_s }; t += s.duration_s; return e; });
    this.duration = t;
    this.accents = [this.c.accent, this.c.soft, ...d.accent_colors.map((a) => a.hex)];
  }

  prepare() {
    const k = this.k;
    this.fogHex = [...this.d.fog_colors, this.c.glow];
    this.fogSprites = this.fogHex.map((h) => glowSprite(h, 512, 1.2));
    this.goldGlow = glowSprite(this.c.glow, 1024, 1.4);
    this.floorGlow = glowSprite(this.c.floor, 512, 1.1);
    this.dot = glowSprite(this.c.accent, 32, 0.6);
    this.soft = glowSprite(this.c.soft, 128, 1);
    this.smoke = glowSprite(this.c.muted, 256, 1.6);
    const v = canvas(this.W, this.H);
    const g = v.getContext("2d");
    const grd = g.createRadialGradient(this.W / 2, this.H * 0.48, this.H * 0.25, this.W / 2, this.H * 0.5, this.H * 0.75);
    grd.addColorStop(0, "rgba(0,0,0,0)");
    grd.addColorStop(1, rgba(this.c.background, 0.85));
    g.fillStyle = grd; g.fillRect(0, 0, this.W, this.H);
    this.vignette = v;
    // layout boutique do guia (seção 4.3), por formato
    const tall = this.H / this.W > 1.5;
    const sy = this.H / (tall ? 1920 : 1350);
    this.L = tall
      ? { logoTop: 120 * sy, name: 430 * sy, nameSize: 124 * k, sub: 585 * sy, subSize: 48 * k, bottleH: 640 * sy, floor: 1305 * sy, notes: 1500 * sy, cta: 1790 * sy }
      : { logoTop: 82 * sy, name: 300 * sy, nameSize: 100 * k, sub: 400 * sy, subSize: 40 * k, bottleH: 440 * sy, floor: 900 * sy, notes: 1030 * sy, cta: 1250 * sy };
    if (this.bottle) this.prepareBottle();
    void k;
  }

  prepareBottle() {
    const b = this.bottle;
    const refl = canvas(b.width, b.height);
    const g = refl.getContext("2d");
    g.translate(0, b.height); g.scale(1, -1);
    g.drawImage(b, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "destination-in";
    const grd = g.createLinearGradient(0, 0, 0, b.height * 0.28);
    grd.addColorStop(0, "rgba(0,0,0,0.32)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd; g.fillRect(0, 0, b.width, b.height);
    this.reflection = refl;
    this.sweepCanvas = canvas(b.width, b.height);
  }

  // ---------- quadro ----------
  render(t) {
    const { ctx } = this;
    t = clamp(t, 0, this.duration - 1e-3);
    const i = this.timeline.findIndex((e) => t < e.start + e.dur);
    const cur = this.timeline[i];
    const lt = t - cur.start;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    if (i > 0 && lt < TRANSITION) {
      const prev = this.timeline[i - 1];
      const u = lt / TRANSITION;
      const kind = cur.scene.transition_in;
      if (kind === "fade_preto") {
        if (u < 0.5) { this.drawScene(prev, prev.dur + lt); this.black(easeInOut(u * 2)); }
        else { this.drawScene(cur, lt); this.black(1 - easeInOut((u - 0.5) * 2)); }
      } else {
        this.drawScene(prev, prev.dur + lt);
        ctx.globalAlpha = easeInOut(u);
        this.drawLayer(cur, lt);
        ctx.globalAlpha = 1;
        if (kind === "luz") this.flash(Math.sin(u * Math.PI));
      }
    } else {
      this.drawScene(cur, lt);
    }
    this.overlay(t);
  }

  drawLayer(entry, lt) {
    // desenha uma cena numa camada separada para fundir por transparência
    if (!this.layer) { this.layer = canvas(this.W, this.H); this.layerCtx = this.layer.getContext("2d"); }
    const main = this.ctx;
    this.ctx = this.layerCtx;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawScene(entry, lt);
    this.ctx = main;
    main.drawImage(this.layer, 0, 0);
  }

  black(a) { const { ctx } = this; ctx.fillStyle = rgba(this.c.background, a); ctx.fillRect(0, 0, this.W, this.H); }

  flash(a) {
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = a * 0.4;
    ctx.drawImage(this.soft, -this.W * 0.2, this.H * 0.05, this.W * 1.4, this.H * 0.9);
    ctx.restore();
  }

  overlay(t) {
    const { ctx, W, H, k } = this;
    ctx.globalAlpha = 1;
    ctx.drawImage(this.vignette, 0, 0);
    // moldura fina do guia: 1 px, recuada 36 px
    const a = ramp(t, 0.2, 1.2);
    ctx.strokeStyle = rgba(this.c.frame, a);
    ctx.lineWidth = Math.max(1, k);
    const m = 36 * k;
    ctx.strokeRect(m, m, W - 2 * m, H - 2 * m);
  }

  camera(scene, p) {
    const e = easeInOut(p);
    const { W, H } = this;
    switch (scene.camera) {
      case "push_in": return { x: 0, y: 0, z: lerp(1, 1.08, e) };
      case "pull_out": return { x: 0, y: 0, z: lerp(1.08, 1, e) };
      case "pan_esquerda": return { x: lerp(0.04, -0.04, e) * W, y: 0, z: 1.05 };
      case "pan_direita": return { x: lerp(-0.04, 0.04, e) * W, y: 0, z: 1.05 };
      case "sobe": return { x: 0, y: lerp(0.04, -0.04, e) * H, z: 1.05 };
      case "desce": return { x: 0, y: lerp(-0.04, 0.04, e) * H, z: 1.05 };
      case "orbita": return { x: Math.sin(e * Math.PI) * 0.05 * W, y: -Math.cos(e * Math.PI) * 0.01 * H, z: lerp(1.02, 1.07, e) };
      default: return { x: 0, y: 0, z: 1 };
    }
  }

  // aplica a câmera com profundidade (parallax): depth 0 = fundo, 1 = assunto, >1 = primeiro plano
  depth(cam, depth) {
    const { ctx, W, H } = this;
    const z = 1 + (cam.z - 1) * depth;
    ctx.setTransform(z, 0, 0, z, W / 2 * (1 - z) + cam.x * depth, H / 2 * (1 - z) + cam.y * depth);
  }

  drawScene(entry, lt) {
    const { ctx, W, H } = this;
    const s = entry.scene;
    const p = clamp(lt / entry.dur, 0, 1.2);
    const cam = this.camera(s, p);
    const seed = (s.index || 1) * 13 + (s.seed || 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.c.background;
    ctx.fillRect(0, 0, W, H);
    const fogAmount = { atmosfera: 1, ingrediente: 0.6, abertura: 0.35, notas: 0.45, packshot: 0.3, frasco_revelacao: 0.5, frasco_luz: 0.5 }[s.type] ?? 0.5;
    this.depth(cam, 0.3);
    this.fog(lt, seed, fogAmount);
    if (s.type === "atmosfera") this.rays(lt, seed);
    this.depth(cam, 0.6);
    this.particles(s, lt, seed, "back");
    this.depth(cam, 1);
    const fn = this["scene_" + s.type];
    if (fn) fn.call(this, s, lt, entry.dur);
    this.depth(cam, 1.4);
    this.particles(s, lt, seed, "front");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (s.text && !["notas", "packshot", "abertura"].includes(s.type)) this.caption(s.text, lt, entry.dur);
  }

  // ---------- camadas ----------
  fog(t, seed, amount) {
    const { ctx, W, H } = this;
    const v = this.speed;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 6; i++) {
      const spr = this.fogSprites[i % this.fogSprites.length];
      const size = (0.9 + hash(i, seed) * 0.9) * H;
      const x = W * (hash(i, seed + 1) * 1.2 - 0.1) + Math.sin(t * 0.13 * v + i * 2.1) * W * 0.12;
      const y = H * (hash(i, seed + 2) * 1.1 - 0.05) + Math.cos(t * 0.09 * v + i) * H * 0.06;
      const [r, g, b] = rgb(this.fogHex[i % this.fogHex.length]);
      const lum = (r + g + b) / 765; // cores escuras precisam de mais intensidade para aparecer
      ctx.globalAlpha = clamp(amount * (0.22 + 0.1 * Math.sin(t * 0.3 * v + i * 1.7)) * (0.9 + (0.25 - Math.min(lum, 0.25)) * 4));
      ctx.drawImage(spr, x - size / 2, y - size / 2, size, size);
    }
    ctx.restore();
  }

  rays(t, seed) {
    const { ctx, W, H } = this;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 4; i++) {
      const x = W * (0.15 + 0.25 * i) + Math.sin(t * 0.2 * this.speed + i) * W * 0.04;
      const grd = ctx.createLinearGradient(x, 0, x + W * 0.25, H);
      grd.addColorStop(0, rgba(this.c.soft, 0.0));
      grd.addColorStop(0.3, rgba(this.c.soft, 0.05 + 0.03 * hash(i, seed)));
      grd.addColorStop(1, rgba(this.c.soft, 0));
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.moveTo(x - W * 0.03, -10); ctx.lineTo(x + W * 0.03, -10);
      ctx.lineTo(x + W * 0.32, H + 10); ctx.lineTo(x + W * 0.12, H + 10);
      ctx.fill();
    }
    ctx.restore();
  }

  particles(s, t, seed, layer) {
    const type = s.particles;
    if (!type || type === "nenhuma" || !s.particle_density) return;
    const { ctx, W, H, k } = this;
    const v = this.speed;
    const max = { poeira_dourada: 140, bokeh: 26, petalas: 22, gotas: 30, fumaca: 10, folhas: 16, faiscas: 40 }[type] || 40;
    const n = Math.round(max * s.particle_density);
    const front = layer === "front";
    ctx.save();
    for (let i = 0; i < n; i++) {
      const isFront = hash(i, seed + 9) > 0.7;
      if (isFront !== front) continue;
      const h1 = hash(i, seed), h2 = hash(i, seed + 3), h3 = hash(i, seed + 5);
      const sc = isFront ? 1.6 : 1;
      const color = this.accents[i % this.accents.length];
      switch (type) {
        case "poeira_dourada": {
          const y = H * (1.1 - ((h2 + t * 0.025 * v * (0.5 + h3)) % 1.2));
          const x = W * h1 + Math.sin(t * 0.6 * v + i) * 20 * k;
          const r = (2 + h3 * 5) * k * sc;
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = 0.35 + 0.45 * Math.abs(Math.sin(t * (0.8 + h3) + i));
          ctx.drawImage(this.dot, x - r * 2, y - r * 2, r * 4, r * 4);
          break;
        }
        case "bokeh": {
          const x = W * h1 + Math.sin(t * 0.15 * v + i) * 40 * k;
          const y = H * h2 + Math.cos(t * 0.12 * v + i) * 40 * k;
          const r = (25 + h3 * 70) * k * sc;
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = 0.07 + 0.08 * Math.sin(t * 0.5 + i * 3) ** 2;
          ctx.drawImage(i % 2 ? this.soft : this.dot, x - r, y - r, r * 2, r * 2);
          break;
        }
        case "petalas":
        case "folhas": {
          const fall = (h2 + t * 0.045 * v * (0.6 + h3)) % 1.25;
          const y = H * (fall - 0.12);
          const x = W * h1 + Math.sin(t * 0.7 * v + i * 2) * 60 * k;
          const size = (18 + h3 * 22) * k * sc;
          ctx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = (isFront ? 0.5 : 0.75) * clamp(fall * 6) ;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(t * (0.4 + h3) * v + i);
          ctx.scale(1, 0.55 + 0.45 * Math.sin(t * 1.3 * v + i));
          const grd = ctx.createLinearGradient(-size, 0, size, 0);
          grd.addColorStop(0, rgba(color, 0.95));
          grd.addColorStop(1, rgba(this.c.background, 0.6));
          ctx.fillStyle = grd;
          ctx.beginPath();
          if (type === "petalas") {
            ctx.moveTo(0, -size);
            ctx.bezierCurveTo(size * 0.9, -size * 0.6, size * 0.7, size * 0.7, 0, size * 0.5);
            ctx.bezierCurveTo(-size * 0.7, size * 0.7, -size * 0.9, -size * 0.6, 0, -size);
          } else {
            ctx.moveTo(0, -size);
            ctx.quadraticCurveTo(size * 0.6, 0, 0, size);
            ctx.quadraticCurveTo(-size * 0.6, 0, 0, -size);
          }
          ctx.fill();
          ctx.restore();
          break;
        }
        case "gotas": {
          const fall = (h2 + t * 0.06 * v * (0.6 + h3)) % 1.2;
          const y = H * (fall - 0.1);
          const x = W * h1;
          const r = (4 + h3 * 7) * k * sc;
          ctx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = 0.55;
          ctx.fillStyle = rgba(this.c.soft, 0.25);
          ctx.strokeStyle = rgba(this.c.soft, 0.7);
          ctx.lineWidth = 1.2 * k;
          ctx.beginPath();
          ctx.moveTo(x, y - r * 2.2);
          ctx.quadraticCurveTo(x + r, y - r * 0.2, x, y + r);
          ctx.quadraticCurveTo(x - r, y - r * 0.2, x, y - r * 2.2);
          ctx.fill(); ctx.stroke();
          ctx.globalCompositeOperation = "lighter";
          ctx.drawImage(this.dot, x - r * 0.9, y - r * 0.6, r * 0.8, r * 0.8);
          break;
        }
        case "fumaca": {
          const rise = (h2 + t * 0.03 * v * (0.6 + h3)) % 1.3;
          const y = H * (1.15 - rise);
          const x = W * h1 + Math.sin(t * 0.25 * v + i) * 80 * k;
          const size = (260 + rise * 500) * k * sc;
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = 0.05 * Math.sin(clamp(rise / 1.3) * Math.PI);
          ctx.drawImage(this.smoke, x - size / 2, y - size / 2, size, size);
          break;
        }
        case "faiscas": {
          const life = (h2 + t * 0.12 * v * (0.5 + h3)) % 1;
          const x = W * h1 + life * 120 * k;
          const y = H * h3 - life * 160 * k;
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = Math.sin(life * Math.PI) * 0.8;
          ctx.strokeStyle = rgba(this.c.soft, 1);
          ctx.lineWidth = 1.2 * k * sc;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 18 * k * sc, y + 24 * k * sc); ctx.stroke();
          break;
        }
      }
    }
    ctx.restore();
  }

  caption(text, lt, dur) {
    const { ctx, W, H, k } = this;
    const a = ramp(lt, 0.5, 1.4) * (1 - ramp(lt, dur - 0.6, dur));
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = this.c.text;
    ctx.font = `italic 400 ${Math.round(58 * k)}px ${SERIF}`;
    ctx.textAlign = "center";
    const lines = wrap(ctx, text, W * 0.74);
    const y0 = H * 0.8 - (lines.length - 1) * 34 * k + (1 - easeOut(ramp(lt, 0.5, 1.6))) * 24 * k;
    lines.forEach((l, i) => ctx.fillText(l, W / 2, y0 + i * 68 * k));
    ctx.restore();
  }

  // ---------- logo (geometria do guia, seção 2.3) ----------
  logo(cx, top, kk, prog) {
    const { ctx } = this;
    const s = 110 * kk;
    const yt = top + 0.2 * s;
    const vy = yt + 0.97 * s;
    const lw = Math.max(1.2, 0.024 * s);
    ctx.save();
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = this.c.text; ctx.lineWidth = lw;
    const arm = prog.arms ?? 1;
    const armLen = Math.hypot(s / 2, 0.97 * s);
    ctx.setLineDash([armLen * 2 * arm, armLen * 2 + 10]);
    ctx.beginPath(); ctx.moveTo(cx - s / 2, yt); ctx.lineTo(cx, vy); ctx.lineTo(cx + s / 2, yt); ctx.stroke();
    ctx.setLineDash([]);
    const drop = prog.drop ?? 1;
    if (drop > 0) {
      const r = 0.118 * s;
      const cy = yt + 0.083 * s - (1 - easeOut(drop)) * s * 0.9;
      const tip = cy - 2.4 * r;
      const d = cy - tip, off = (r * r) / d, half = r * Math.sqrt(1 - (r / d) ** 2);
      ctx.globalAlpha = clamp(drop * 2);
      ctx.fillStyle = this.c.accent;
      ctx.beginPath();
      ctx.moveTo(cx, tip);
      ctx.lineTo(cx + half, cy - off);
      const ang = Math.atan2(-off, half);
      ctx.arc(cx, cy, r, ang, Math.PI - ang);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }
    const word = prog.word ?? 1;
    let y = vy + 60 * kk + 84 * kk * 0.7;
    if (word > 0) {
      ctx.fillStyle = this.c.text;
      ctx.font = `300 ${84 * kk}px ${SERIF}`;
      const letters = [...this.brand.short];
      ctx.globalAlpha = 1;
      const widths = letters.map((c) => ctx.measureText(c).width);
      const total = widths.reduce((a, b) => a + b, 0) + 30 * kk * (letters.length - 1);
      let x = cx - total / 2;
      letters.forEach((c, i) => {
        ctx.globalAlpha = clamp(word * letters.length - i);
        ctx.fillText(c, x, y); x += widths[i] + 30 * kk;
      });
    }
    const line = prog.line ?? 1;
    y += 30 * kk;
    if (line > 0) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = this.c.line; ctx.lineWidth = 1.5 * kk;
      const L = 72 * kk * easeOut(line);
      ctx.beginPath(); ctx.moveTo(cx - L / 2, y); ctx.lineTo(cx + L / 2, y); ctx.stroke();
    }
    const sub = prog.sub ?? 1;
    if (sub > 0) {
      ctx.globalAlpha = sub;
      ctx.fillStyle = this.c.text;
      ctx.font = `400 ${13 * kk}px ${SANS}`;
      const second = (this.brand.name.split(/\s+/)[1] || "").toUpperCase();
      if (second) spacedText(ctx, second, cx, y + 28 * kk, 13 * kk);
    }
    ctx.restore();
    return y + 40 * kk;
  }

  // ---------- frasco ----------
  bottleBox(height, floorY) {
    const b = this.bottle;
    const h = height, w = (b.width / b.height) * h;
    return { x: this.W / 2 - w / 2, y: floorY - h, w, h };
  }

  drawBottle(box, { alpha = 1, glow = 1, sweep = -1, floor = 1 } = {}) {
    const { ctx, k } = this;
    if (!this.bottle) return;
    const cx = box.x + box.w / 2, floorY = box.y + box.h;
    ctx.save();
    // foco de luz dourada atrás do frasco (#5A4521) e brilho no piso (#7A6030)
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.9 * glow;
    const g = box.h * 1.9;
    ctx.drawImage(this.goldGlow, cx - g / 2, box.y + box.h * 0.45 - g / 2, g, g);
    ctx.globalAlpha = 0.6 * glow * floor;
    ctx.drawImage(this.floorGlow, cx - box.w * 1.6, floorY - box.h * 0.12, box.w * 3.2, box.h * 0.24);
    ctx.restore();
    // linha de piso dourada que desvanece nas pontas
    if (floor > 0) {
      ctx.save();
      const half = Math.max(box.w * 1.6, 240 * k) * floor;
      const grd = ctx.createLinearGradient(cx - half, 0, cx + half, 0);
      grd.addColorStop(0, rgba(this.c.line, 0)); grd.addColorStop(0.5, rgba(this.c.line, 0.9 * alpha)); grd.addColorStop(1, rgba(this.c.line, 0));
      ctx.fillStyle = grd;
      ctx.fillRect(cx - half, floorY, half * 2, Math.max(1, 1.2 * k));
      ctx.globalAlpha = alpha;
      ctx.drawImage(this.reflection, box.x, floorY + 2 * k, box.w, box.h);
      ctx.restore();
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    if (sweep >= 0 && sweep <= 1) {
      const sc = this.sweepCanvas, g2 = sc.getContext("2d");
      const bw = sc.width, bh = sc.height;
      g2.globalCompositeOperation = "source-over";
      g2.clearRect(0, 0, bw, bh);
      g2.drawImage(this.bottle, 0, 0);
      g2.globalCompositeOperation = "source-atop";
      const pos = lerp(-0.6, 1.6, easeInOut(sweep));
      const grd = g2.createLinearGradient(bw * (pos - 0.35), bh * (pos - 0.35) * 0.5, bw * (pos + 0.35), bh * (pos + 0.35) * 0.5);
      grd.addColorStop(0, "rgba(255,255,255,0)");
      grd.addColorStop(0.5, rgba(this.c.soft, 0.55));
      grd.addColorStop(1, "rgba(255,255,255,0)");
      g2.fillStyle = grd; g2.fillRect(0, 0, bw, bh);
      ctx.drawImage(sc, box.x, box.y, box.w, box.h);
    } else {
      ctx.drawImage(this.bottle, box.x, box.y, box.w, box.h);
    }
    ctx.restore();
  }

  title(name, sub, a, rise = 0) {
    const { ctx, W, k, L } = this;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = this.c.text;
    ctx.textAlign = "center";
    let size = L.nameSize;
    ctx.font = `400 ${size}px ${SERIF}`;
    while (ctx.measureText(name).width > W * 0.82 && size > 40 * k) { size -= 4 * k; ctx.font = `400 ${size}px ${SERIF}`; }
    ctx.fillText(name, W / 2, L.name + rise);
    ctx.fillStyle = this.c.accent;
    ctx.font = `italic 400 ${L.subSize}px ${SERIF}`;
    ctx.fillText(sub, W / 2, L.sub + rise);
    ctx.restore();
  }

  notes(y, alphas, scale = 1) {
    const { ctx, W } = this;
    const k = this.k * scale;
    const e = this.d.end_card;
    const cols = [["Topo", e.top], ["Coração", e.heart], ["Fundo", e.base]];
    const colW = (W - 2 * 90 * this.k) / 3;
    ctx.save();
    cols.forEach(([label, text], i) => {
      const a = alphas[i];
      if (a <= 0) return;
      const cx = 90 * this.k + colW * (i + 0.5);
      ctx.globalAlpha = a;
      ctx.textAlign = "center";
      ctx.fillStyle = this.c.accent;
      ctx.font = `italic 400 ${Math.round(38 * k)}px ${SERIF}`;
      ctx.fillText(label, cx, y + (1 - easeOut(a)) * 20 * k);
      ctx.fillStyle = this.c.text;
      ctx.font = `400 ${Math.round(28 * k)}px ${SERIF}`;
      wrap(ctx, text || "", colW - 24 * k).slice(0, 5).forEach((l, j) => ctx.fillText(l, cx, y + 48 * k + j * 36 * k + (1 - easeOut(a)) * 20 * k));
      if (i > 0) {
        ctx.strokeStyle = rgba(this.c.frame, a);
        ctx.lineWidth = Math.max(1, k);
        const sx = 90 * this.k + colW * i;
        ctx.beginPath(); ctx.moveTo(sx, y - 30 * k); ctx.lineTo(sx, y + 200 * k); ctx.stroke();
      }
    });
    ctx.restore();
  }

  cta(a) {
    const { ctx, W, k, L } = this;
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = this.c.accent;
    ctx.font = `400 ${Math.round(24 * k)}px ${SANS}`;
    ctx.textAlign = "center";
    ctx.fillText(this.d.end_card.cta, W / 2, L.cta);
    ctx.strokeStyle = this.c.line;
    ctx.lineWidth = Math.max(1, k);
    const w = 120 * k * easeOut(a);
    ctx.beginPath(); ctx.moveTo(W / 2 - w / 2, L.cta + 30 * k); ctx.lineTo(W / 2 + w / 2, L.cta + 30 * k); ctx.stroke();
    ctx.restore();
  }

  // ---------- tipos de cena ----------
  scene_abertura(s, lt, dur) {
    const f = Math.max(0.6, dur / 3);
    this.logo(this.W / 2, this.H * 0.36, 1.5 * this.k, {
      arms: easeInOut(ramp(lt, 0.1 * f, 1.2 * f)),
      drop: ramp(lt, 0.8 * f, 1.5 * f),
      word: ramp(lt, 1.2 * f, 2.0 * f),
      line: ramp(lt, 1.7 * f, 2.3 * f),
      sub: ramp(lt, 2.0 * f, 2.6 * f),
    });
  }

  scene_atmosfera() {}

  scene_ingrediente(s, lt, dur) {
    const { ctx, W, H, k } = this;
    const gl = s.glyphs.length ? s.glyphs : ["gota"];
    const pos = gl.length === 1 ? [[0.5, 0.45, 0.46]] : gl.length === 2 ? [[0.33, 0.4, 0.34], [0.67, 0.52, 0.34]] : [[0.5, 0.3, 0.3], [0.27, 0.56, 0.28], [0.73, 0.58, 0.28]];
    ctx.save();
    gl.forEach((g, i) => {
      const [px, py, ps] = pos[i];
      const prog = easeInOut(ramp(lt, 0.2 + i * 0.35, dur * 0.6 + i * 0.35));
      const bob = Math.sin(lt * 0.8 * this.speed + i * 2) * 14 * k;
      const size = W * ps;
      ctx.shadowColor = rgba(this.c.accent, 0.6);
      ctx.shadowBlur = 18 * k;
      drawGlyph(ctx, g, W * px, H * py + bob, size, prog, this.c.accent, 2.2 * k);
      ctx.shadowBlur = 0;
      drawGlyph(ctx, g, W * px, H * py + bob, size, prog, rgba(this.c.soft, 0.8), 1 * k);
    });
    ctx.restore();
  }

  scene_frasco_revelacao(s, lt, dur) {
    const p = ramp(lt, 0, dur * 0.7);
    const z = lerp(0.9, 1.0, easeOut(ramp(lt, 0, dur)));
    const h = this.H * 0.5 * z;
    const box = this.bottleBox(h, this.H * 0.5 + h * 0.5);
    this.drawBottle(box, { alpha: easeInOut(p), glow: easeOut(ramp(lt, 0, dur * 0.5)), floor: easeOut(ramp(lt, dur * 0.3, dur * 0.8)) });
  }

  scene_frasco_luz(s, lt, dur) {
    const h = this.H * 0.52;
    const box = this.bottleBox(h, this.H * 0.5 + h * 0.5);
    this.drawBottle(box, { sweep: ramp(lt, dur * 0.15, dur * 0.85) });
  }

  scene_notas(s, lt, dur) {
    const { ctx, W, H, k } = this;
    ctx.save();
    ctx.globalAlpha = ramp(lt, 0.1, 0.9);
    ctx.fillStyle = this.c.text;
    ctx.textAlign = "center";
    ctx.font = `400 ${Math.round(96 * k)}px ${SERIF}`;
    ctx.fillText(this.d.end_card.perfume_name, W / 2, H * 0.3);
    ctx.fillStyle = this.c.accent;
    ctx.font = `italic 400 ${Math.round(44 * k)}px ${SERIF}`;
    ctx.fillText(this.d.end_card.subtitle, W / 2, H * 0.3 + 72 * k);
    ctx.restore();
    this.notes(H * 0.47, [0.15, 0.38, 0.6].map((a) => ramp(lt, dur * a, dur * a + 0.8)), 1.3);
  }

  scene_packshot(s, lt, dur) {
    const { W, k, L } = this;
    this.logo(W / 2, L.logoTop, 0.42 * k * (this.H / this.W > 1.5 ? 1 : 0.85), { word: 1, sub: ramp(lt, 0, 0.8), arms: 1, drop: 1, line: 1 });
    this.title(this.d.end_card.perfume_name, this.d.end_card.subtitle, ramp(lt, 0.2, 1.1), (1 - easeOut(ramp(lt, 0.2, 1.3))) * 16 * k);
    if (this.bottle) {
      const box = this.bottleBox(L.bottleH, L.floor);
      this.drawBottle(box, { alpha: ramp(lt, 0, 0.8), sweep: ramp(lt, dur * 0.25, dur * 0.7) });
    }
    this.notes(L.notes, [0.45, 0.55, 0.65].map((a) => ramp(lt, dur * a - 0.6, dur * a + 0.2)));
    this.cta(ramp(lt, dur * 0.72, dur * 0.72 + 0.7));
  }
}
