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
  constructor({ canvas: cv, brand, direction, bottle, width, height, assets = {} }) {
    measureGlyphs();
    this.cv = cv;
    this.ctx = cv.getContext("2d");
    this.W = width; this.H = height;
    cv.width = width; cv.height = height;
    this.k = width / 1080;
    this.brand = brand;
    this.c = brand.colors;
    this.bottle = bottle;
    this.assets = assets;
    this.setDirection(direction);
    this.prepare();
    this.preparePhoto();
  }

  setDirection(d) {
    this.d = d;
    this.speed = { muito_lenta: 0.6, lenta: 0.85, moderada: 1.1 }[d.motion_speed] || 0.85;
    let t = 0;
    let open = false;
    this.timeline = d.scenes.map((s) => {
      const state = s.type === "abre_frasco" ? "opening" : s.type === "fecha_frasco" ? "closing" : open ? "open" : "closed";
      if (s.type === "abre_frasco") open = true;
      if (s.type === "fecha_frasco" || ["packshot", "notas", "abertura"].includes(s.type)) open = false;
      const e = { scene: s, start: t, dur: s.duration_s, state: ["packshot", "notas", "abertura"].includes(s.type) ? "closed" : state };
      t += s.duration_s;
      return e;
    });
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
      let kind = cur.scene.transition_in;
      // duas cenas com o frasco em primeiro plano: fusão mostraria dois frascos; usa corte seco com brilho
      const HERO = ["frasco_revelacao", "frasco_luz", "vortice", "orbita_ingredientes", "abre_frasco", "fecha_frasco"];
      if (kind !== "fade_preto" && HERO.includes(prev.scene.type) && HERO.includes(cur.scene.type)) kind = "corte";
      if (kind === "corte") {
        this.drawScene(cur, lt);
        if (u < 0.45) this.flash(0.6 * (1 - u / 0.45));
        this.overlay(t);
        return;
      }
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
    if (this.plate) {
      this.depth(cam, 1);
      this.drawPlate(s.type, lt, entry.dur);
      this.depth(cam, 0.3);
      this.fog(lt, seed, fogAmount * 0.35);
    } else {
      this.depth(cam, 0.3);
      this.fog(lt, seed, fogAmount);
    }
    if (s.type === "atmosfera") this.rays(lt, seed);
    this.depth(cam, 0.6);
    this.particles(s, lt, seed, "back");
    this.depth(cam, 1);
    this.cur = entry;
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

  drawBottle(box, { alpha = 1, glow = 1, sweep = -1, floor = 1, image = true } = {}) {
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
    if (!image) return;
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
    if (this.photoBottle || (this.cur?.state || "closed") !== "closed") { this.drawHero(this.heroBox(), lt, dur); return; } // a revelação vem da luz do cenário
    const p = ramp(lt, 0, dur * 0.7);
    const box = this.heroBox();
    this.drawBottle(box, { alpha: easeInOut(p), glow: easeOut(ramp(lt, 0, dur * 0.5)), floor: easeOut(ramp(lt, dur * 0.3, dur * 0.8)) });
  }

  scene_frasco_luz(s, lt, dur) {
    if (this.photoBottle) { this.drawHero(this.heroBox(), lt, dur, { sweep: ramp(lt, dur * 0.15, dur * 0.85) }); return; }
    this.drawBottle(this.heroBox(), { sweep: ramp(lt, dur * 0.15, dur * 0.85) });
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
  // =====================================================================
  // MODO FOTOGRÁFICO: cenário real, frasco real e ingredientes reais em 3D
  // =====================================================================
  preparePhoto() {
    const a = this.assets;
    this.plate = a.background || null;
    this.ingredients = [];
    if (this.plate) {
      // cobre a tela com 8% de folga para os movimentos de câmera
      const sc = Math.max(this.W / this.plate.width, this.H / this.plate.height) * 1.08;
      const w = this.plate.width * sc, h = this.plate.height * sc;
      this.plateRect = { x: (this.W - w) / 2, y: (this.H - h) / 2, w, h };
      // versão desfocada (para notas e fechamento)
      const small = canvas(Math.max(8, Math.round(this.plate.width / 14)), Math.max(8, Math.round(this.plate.height / 14)));
      const g = small.getContext("2d");
      g.imageSmoothingQuality = "high";
      g.drawImage(this.plate, 0, 0, small.width, small.height);
      this.plateBlur = small;
      if (a.bottleRect) {
        const r = a.bottleRect, pr = this.plateRect;
        this.photoBottle = { x: pr.x + r.x * pr.w, y: pr.y + r.y * pr.h, w: r.w * pr.w, h: r.h * pr.h };
      }
    }
    for (const it of a.ingredients || []) {
      this.ingredients.push({ note: it.note.toLowerCase().trim(), levels: blurLevels(it.image) });
    }
    this.prepareCap();
  }

  // separa tampa e corpo do frasco real, e amostra a cor do líquido
  prepareCap() {
    const b = this.bottle;
    if (!b) return;
    const split = clamp(this.assets.capSplit ?? 0.25, 0.05, 0.6);
    this.capSplit = split;
    const cy = Math.round(b.height * split);
    this.capImg = canvas(b.width, Math.max(1, cy));
    this.capImg.getContext("2d").drawImage(b, 0, 0);
    this.bodyImg = canvas(b.width, Math.max(1, b.height - cy));
    this.bodyImg.getContext("2d").drawImage(b, 0, -cy);
    // cor média do líquido (metade de baixo do corpo, pixels opacos)
    const sm = canvas(24, 24), g = sm.getContext("2d", { willReadFrequently: true });
    g.drawImage(this.bodyImg, 0, this.bodyImg.height * 0.35, this.bodyImg.width, this.bodyImg.height * 0.55, 0, 0, 24, 24);
    const px = g.getImageData(0, 0, 24, 24).data;
    let r = 0, gg = 0, bb = 0, n = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 200) { r += px[i]; gg += px[i + 1]; bb += px[i + 2]; n++; }
    const base = n ? [r / n, gg / n, bb / n] : rgb(this.c.accent);
    // garante um tom de líquido com corpo (nem preto, nem lavado)
    const lum = (base[0] + base[1] + base[2]) / 3;
    const k = lum < 60 ? 60 / Math.max(1, lum) : 1;
    this.liq = base.map((v) => clamp(v * k, 0, 255));
    // cenário com o lugar da tampa preenchido (para a tampa poder sair sem deixar cópia)
    if (this.plate && this.assets.capRect) {
      const pw = this.plate.width, ph = this.plate.height, cr = this.assets.capRect;
      const clean = canvas(pw, ph), g2 = clean.getContext("2d");
      g2.drawImage(this.plate, 0, 0);
      const x = cr.x * pw, y = cr.y * ph, w = cr.w * pw, h = cr.h * ph, pad = w * 0.12;
      const patch = canvas(Math.ceil(w + pad * 2), Math.ceil(h + pad * 2)), pg = patch.getContext("2d");
      pg.drawImage(this.plate, x - pad, y - h - pad * 1.5, w + pad * 2, h + pad * 2, 0, 0, patch.width, patch.height);
      pg.globalCompositeOperation = "destination-in";
      const m = pg.createRadialGradient(patch.width / 2, patch.height / 2, Math.min(patch.width, patch.height) * 0.35, patch.width / 2, patch.height / 2, Math.max(patch.width, patch.height) * 0.62);
      m.addColorStop(0, "rgba(0,0,0,1)"); m.addColorStop(1, "rgba(0,0,0,0)");
      pg.fillStyle = m; pg.fillRect(0, 0, patch.width, patch.height);
      g2.drawImage(patch, x - pad, y - pad);
      g2.drawImage(patch, x - pad, y - pad); // duas passadas cobrem melhor o centro
      this.plateClean = clean;
    }
  }

  liqColor(light, dim = 1) {
    const [r, g, b] = this.liq;
    const mix = (v, to, t) => v + (to - v) * t;
    const t = light;
    const f = (v) => Math.round(clamp(mix(v * 0.45, Math.min(255, v * 1.35 + 40), t) * dim, 0, 255));
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  }

  // abertura da tampa (0 fechada .. 1 solta no ar) e altura do líquido (0..1) para a cena atual
  openState(lt, dur) {
    const st = this.cur?.state || "closed";
    if (st === "opening") return { cap: easeInOut(ramp(lt, dur * 0.08, dur * 0.42)), liquid: easeOut(ramp(lt, dur * 0.3, dur * 0.85)), shake: lt < dur * 0.12 ? Math.sin(lt * 60) * (1 - lt / (dur * 0.12)) : 0 };
    if (st === "open") return { cap: 1, liquid: 1, shake: 0 };
    if (st === "closing") return { cap: 1 - easeInOut(ramp(lt, dur * 0.45, dur * 0.85)), liquid: 1 - easeInOut(ramp(lt, 0, dur * 0.55)), shake: 0 };
    return { cap: 0, liquid: 0, shake: 0 };
  }

  // redemoinho de líquido saindo do gargalo (faixas com sombreamento cilíndrico, brilho e transparência)
  liquid(box, lt, grow, front) {
    if (grow <= 0.001 || !this.liq) return;
    const { ctx, W, H } = this;
    const cx = box.x + box.w / 2;
    const neckY = box.y + box.h * this.capSplit;
    const height = H * 0.6 * grow;
    const v = this.speed;
    if (!this.liqGlow) this.liqGlow = glowSprite("#" + this.liq.map((x) => Math.round(x).toString(16).padStart(2, "0")).join(""), 256, 1.2);
    ctx.save();
    if (!front) { // brilho translúcido atrás do redemoinho
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.35 * grow;
      const gw = box.w * 2.2;
      ctx.drawImage(this.liqGlow, cx - gw / 2, neckY - height * 0.75 - gw / 2, gw, gw * 1.4);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }
    for (let j = 0; j < 3; j++) {
      const steps = 64;
      const pts = [];
      for (let i = 0; i <= steps; i++) {
        const sN = i / steps;
        const ang = sN * (5.5 + j) - lt * 3.2 * v + j * 2.1;
        const R = box.w * (0.04 + sN * (0.38 + 0.12 * j)) * (0.6 + 0.4 * grow);
        const taper = Math.min(1, (1 - sN) * 4) * Math.min(1, sN * 12 + 0.4);
        pts.push({
          x: cx + Math.cos(ang) * R,
          y: neckY - sN * height + Math.sin(lt * 2 + sN * 5 + j) * 5 * this.k,
          z: Math.sin(ang), ang, sN,
          w: box.w * (0.22 - 0.12 * sN) * (1 - 0.22 * j) * taper,
        });
      }
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        if ((b.z >= 0) === front) continue;
        const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len, ny = dx / len;
        const ex = (dx / len) * 1.2, ey = (dy / len) * 1.2; // leve sobreposição evita frestas
        const wa = Math.max(1, a.w * (0.8 + 0.2 * (1 - a.z))) / 2, wb = Math.max(1, b.w * (0.8 + 0.2 * (1 - b.z))) / 2;
        const g = ctx.createLinearGradient(a.x - nx * wa, a.y - ny * wa, a.x + nx * wa, a.y + ny * wa);
        const facing = Math.max(0, Math.cos(a.ang - 0.7));
        const dim = b.z > 0 ? 0.55 : 1;
        g.addColorStop(0, this.liqColor(0.02, dim));
        g.addColorStop(0.3, this.liqColor(0.35 + 0.3 * facing, dim));
        g.addColorStop(0.55, this.liqColor(0.6 + 0.35 * facing, dim));
        g.addColorStop(0.68, front && facing > 0.3 ? `rgba(255,250,236,${0.5 + 0.45 * facing})` : this.liqColor(0.7, dim));
        g.addColorStop(0.8, this.liqColor(0.4, dim));
        g.addColorStop(1, this.liqColor(0.05, dim));
        ctx.globalAlpha = 0.93 * Math.min(1, (1 - b.sN) * 3);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(a.x - nx * wa - ex, a.y - ny * wa - ey);
        ctx.lineTo(b.x - nx * wb + ex, b.y - ny * wb + ey);
        ctx.lineTo(b.x + nx * wb + ex, b.y + ny * wb + ey);
        ctx.lineTo(a.x + nx * wa - ex, a.y + ny * wa - ey);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    if (front) {
      // gotas lançadas para fora do redemoinho
      for (let i = 0; i < 26; i++) {
        const h1 = hash(i, 91), h2 = hash(i, 92), h3 = hash(i, 93);
        const age = (lt * (0.35 + 0.3 * h1) * v + h2) % 1;
        const ang = h3 * 6.28 + age * 2;
        const r0 = box.w * (0.1 + 0.6 * h1) * grow + age * W * 0.25;
        const x = cx + Math.cos(ang) * r0;
        const y = neckY - height * (0.15 + 0.7 * h2) - age * H * 0.12 + age * age * H * 0.25;
        const rad = (3 + 9 * h3) * this.k * (1 - age * 0.5) * grow;
        if (rad < 1) continue;
        const g = ctx.createRadialGradient(x - rad * 0.35, y - rad * 0.35, rad * 0.1, x, y, rad);
        g.addColorStop(0, "rgba(255,250,235,0.95)");
        g.addColorStop(0.35, this.liqColor(0.7));
        g.addColorStop(1, this.liqColor(0.1));
        ctx.globalAlpha = Math.sin(age * Math.PI);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      // coroa de líquido no gargalo
      const cw = box.w * 0.34 * grow;
      const g = ctx.createRadialGradient(cx, neckY, 0, cx, neckY, cw);
      g.addColorStop(0, this.liqColor(0.9)); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(cx, neckY, cw, cw * 0.32, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  drawPlate(type, lt, dur) {
    const { ctx, W, H } = this;
    const r = this.plateRect;
    const look = {
      abertura: { blur: true, dark: 0.86 }, atmosfera: { dark: 0.12 }, ingrediente: { blur: true, dark: 0.55 },
      frasco_revelacao: { dark: lerp(0.95, 0.1, easeInOut(ramp(lt, 0, dur * 0.8))) }, frasco_luz: { dark: 0.08 },
      vortice: { dark: 0.12 }, orbita_ingredientes: { dark: 0.12 }, close_ingrediente: { blur: true, dark: 0.35 },
      notas: { blur: true, dark: 0.72 }, packshot: { blur: true, dark: 0.66 },
    }[type] || { dark: 0.2 };
    ctx.save();
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(look.blur ? this.plateBlur : this.plateClean || this.plate, r.x, r.y, r.w, r.h);
    // tratamento de cor da marca: sombras quentes, perto do preto oficial
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = rgba(this.c.soft, 0.18);
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = rgba(this.c.background, look.dark);
    ctx.fillRect(-W, -H, W * 3, H * 3);
    ctx.restore();
  }

  // posição do frasco: onde ele está no cenário, ou centralizado sobre o piso
  heroBox() {
    if (this.photoBottle) return { ...this.photoBottle, inPlate: true };
    const h = this.H * (this.H / this.W > 1.5 ? 0.46 : 0.5);
    return { ...this.bottleBox(h, this.H * 0.76), inPlate: false };
  }

  drawHero(box, lt, dur, { sweep = -1 } = {}) {
    if (!this.bottle) return;
    const os = this.openState(lt, dur);
    if (os.cap > 0 || os.liquid > 0 || os.shake || this.plateClean) {
      const { ctx } = this;
      const capH = box.h * this.capSplit;
      if (!box.inPlate) this.drawBottle(box, { image: false }); // só luz, piso e reflexo
      this.liquid(box, lt, os.liquid, false);
      ctx.save();
      ctx.translate(os.shake * 2 * this.k, 0);
      ctx.drawImage(this.bodyImg, box.x, box.y + capH, box.w, box.h - capH);
      ctx.restore();
      // tampa: sobe girando e flutua
      const c = os.cap;
      const cx = box.x + box.w / 2, cyc = box.y + capH / 2;
      const bob = c >= 1 ? Math.sin(lt * 1.6) * 8 * this.k : 0;
      ctx.save();
      ctx.translate(cx + c * box.w * 0.55 + os.shake * 2 * this.k, cyc - c * this.H * 0.3 + bob);
      ctx.rotate(c * 0.55);
      ctx.drawImage(this.capImg, -box.w / 2, -capH / 2, box.w, capH);
      ctx.restore();
      this.liquid(box, lt, os.liquid, true);
      return;
    }
    if (box.inPlate) {
      // o frasco já está na foto: redesenha o recorte exatamente por cima (para os ingredientes passarem atrás)
      const { ctx } = this;
      if (sweep >= 0) { this.drawBottle(box, { sweep, glow: 0, floor: 0 }); return; }
      ctx.drawImage(this.bottle, box.x, box.y, box.w, box.h);
    } else {
      this.drawBottle(box, { sweep });
    }
  }

  spritesFor(s) {
    if (!this.ingredients.length) return [];
    const wanted = (s.notes || []).map((n) => n.toLowerCase().trim());
    const m = this.ingredients.filter((i) => wanted.some((w) => i.note.includes(w) || w.includes(i.note)));
    return m.length ? m : this.ingredients;
  }

  // posições 3D de cada ingrediente para o instante lt
  items3D(s, lt, mode, box) {
    const sprites = this.spritesFor(s);
    if (!sprites.length) return [];
    const { W, H } = this;
    const v = this.speed;
    const n = Math.min(18, Math.max(sprites.length * 3, Math.round(6 + 10 * (s.particle_density || 0.5))));
    const cx = box.x + box.w / 2;
    const neckY = box.y + box.h * (this.capSplit ?? 0.08);
    const st = this.cur?.state;
    const startAt = st === "opening" ? (this.cur.dur * 0.45) : 0;
    const seed = (s.index || 1) * 7 + (s.seed || 0);
    const out = [];
    const at = (i, t) => {
      const h1 = hash(i, seed), h2 = hash(i, seed + 1), h3 = hash(i, seed + 2);
      if (mode === "vortice") {
        // saem do gargalo e sobem girando em redemoinho
        const delay = startAt + i * 0.16 + h1 * 0.2;
        const u = clamp((t - delay) / (2.2 + h2));
        if (u <= 0) return null;
        const ang = h3 * 6.28 + (t - delay) * (1.9 + h2) * v;
        const rad = lerp(W * 0.03, W * (0.28 + 0.14 * h1), easeOut(u));
        return { x: cx + Math.cos(ang) * rad, y: neckY - easeOut(u) * H * (0.42 + 0.18 * h2) + Math.sin(t * 2 + i) * 6, z: Math.sin(ang) * rad, s: lerp(0.25, 1, easeOut(clamp(u * 1.8))), rot: ang * 0.6 + h1 * 6 };
      }
      if (mode === "orbita") {
        const ang = h3 * 6.28 + t * (0.55 + 0.25 * h1) * v;
        const rad = W * (0.3 + 0.12 * h2);
        const y = box.y + box.h * (0.05 + 0.9 * h1) + Math.sin(t * 0.8 + i) * 18;
        return { x: cx + Math.cos(ang) * rad, y, z: Math.sin(ang) * rad, s: 1, rot: t * (0.3 + h2) + h3 * 6 };
      }
      // close: poucos ingredientes grandes flutuando, outros desfocados ao fundo e à frente
      const big = i < Math.min(2, sprites.length);
      if (big) {
        const side = sprites.length === 1 ? 0 : i === 0 ? -1 : 1;
        return { x: W / 2 + side * W * 0.2 + Math.sin(t * 0.5 + i) * W * 0.02, y: H * (0.44 + i * 0.08) + Math.cos(t * 0.6 + i) * H * 0.012, z: -W * 0.05, s: 2.3 - i * 0.4, rot: Math.sin(t * 0.4 + i) * 0.35 };
      }
      const far = h1 > 0.35;
      return { x: W * h2, y: H * ((h3 + t * 0.03 * v) % 1.1) - H * 0.05, z: far ? W * (0.6 + h1) : -W * (0.6 + h3 * 0.4), s: far ? 0.9 : 1.6, rot: t * 0.5 + i };
    };
    for (let i = 0; i < n; i++) {
      const p = at(i, lt);
      if (!p) continue;
      const prev = at(i, lt - 0.04) || p;
      out.push({ ...p, prev, sprite: sprites[i % sprites.length] });
    }
    return out;
  }

  drawItems(items) {
    const { ctx, W } = this;
    const base = W * 0.17;
    for (const it of items) {
      const persp = 1 / (1 + it.z / (W * 1.6));
      const size = base * it.s * persp;
      if (size < 4) continue;
      const dz = Math.abs(it.z);
      const lvl = dz > W * 0.5 ? 2 : dz > W * 0.22 ? 1 : 0;
      const img = it.sprite.levels[lvl];
      const w = size * (img.width / Math.max(img.width, img.height)), h = size * (img.height / Math.max(img.width, img.height));
      const speed = Math.hypot(it.x - it.prev.x, it.y - it.prev.y);
      ctx.save();
      // rastro de movimento: cópias translúcidas na direção do movimento
      if (speed > 6 * this.k) {
        for (const f of [0.66, 0.33]) {
          ctx.globalAlpha = 0.18 * f;
          ctx.save();
          ctx.translate(lerp(it.x, it.prev.x, f * 2), lerp(it.y, it.prev.y, f * 2));
          ctx.rotate(it.rot);
          ctx.drawImage(img, -w / 2, -h / 2, w, h);
          ctx.restore();
        }
      }
      ctx.globalAlpha = it.z > W * 0.9 ? 0.75 : 1;
      ctx.translate(it.x, it.y);
      ctx.rotate(it.rot);
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
  }

  // fitas douradas em espiral ao redor do frasco (metade de trás antes do frasco, metade da frente depois)
  ribbons(box, lt, dur, front) {
    const { ctx, W, k } = this;
    const cx = box.x + box.w / 2;
    const grow = easeInOut(ramp(lt, 0.2, dur * 0.7));
    if (grow <= 0) return;
    ctx.save();
    ctx.lineCap = "round";
    for (let r = 0; r < 2; r++) {
      const R = box.w * (0.95 + 0.25 * r);
      const steps = 90;
      let prev = null;
      for (let i = 0; i <= steps * grow; i++) {
        const s = i / steps;
        const ang = s * Math.PI * 4 + lt * 1.3 * this.speed + r * Math.PI;
        const x = cx + Math.cos(ang) * R;
        const y = box.y + box.h * 1.05 - s * box.h * 1.5;
        const z = Math.sin(ang);
        if (prev && (z >= 0) === !front) {
          const persp = 1 / (1 + (z * R) / (W * 1.6));
          const light = Math.max(0, Math.cos(ang - 0.6));
          const [a1, a2, a3] = rgb(this.c.line), [b1, b2, b3] = rgb(this.c.soft);
          const dim = z > 0 ? 0.55 : 1; // metade de trás mais escura (profundidade)
          ctx.strokeStyle = `rgb(${Math.round(lerp(a1, b1, light) * dim)},${Math.round(lerp(a2, b2, light) * dim)},${Math.round(lerp(a3, b3, light) * dim)})`;
          ctx.lineWidth = (11 + 7 * (1 - z)) * k * persp;
          ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(x, y); ctx.stroke();
        }
        prev = { x, y };
      }
    }
    ctx.restore();
  }

  photoScene(s, lt, dur, mode) {
    const box = this.heroBox();
    const items = this.items3D(s, lt, mode, box).sort((a, b) => b.z - a.z);
    if (!items.length && !this.bottle) return this.scene_ingrediente(s, lt, dur);
    this.drawItems(items.filter((i) => i.z > 0));
    const closed = (this.cur?.state || "closed") === "closed";
    if (mode !== "close" && closed) this.ribbons(box, lt, dur, false);
    if (mode !== "close") this.drawHero(box, lt, dur);
    if (mode !== "close" && closed) this.ribbons(box, lt, dur, true);
    this.drawItems(items.filter((i) => i.z <= 0));
    if (!items.length && mode === "close") this.scene_ingrediente(s, lt, dur);
  }

  scene_vortice(s, lt, dur) { this.photoScene(s, lt, dur, "vortice"); }
  scene_abre_frasco(s, lt, dur) { this.photoScene(s, lt, dur, "vortice"); }
  scene_fecha_frasco(s, lt, dur) { this.drawHero(this.heroBox(), lt, dur); }
  scene_orbita_ingredientes(s, lt, dur) { this.photoScene(s, lt, dur, "orbita"); }
  scene_close_ingrediente(s, lt, dur) { this.photoScene(s, lt, dur, "close"); }
}

// três níveis de nitidez de cada ingrediente (profundidade de campo), via redução e ampliação
function blurLevels(img) {
  const max = 900;
  const sc = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.max(2, Math.round(img.width * sc)), h = Math.max(2, Math.round(img.height * sc));
  const probe = canvas(2, 2).getContext("2d");
  probe.filter = "blur(2px)";
  const hasFilter = probe.filter === "blur(2px)";
  const level = (radius) => {
    const pad = Math.ceil(radius * 2.5);
    const c = canvas(w + pad * 2, h + pad * 2);
    const g = c.getContext("2d");
    g.imageSmoothingQuality = "high";
    if (!radius) { g.drawImage(img, pad, pad, w, h); return c; }
    if (hasFilter) { g.filter = `blur(${radius}px)`; g.drawImage(img, pad, pad, w, h); return c; }
    // reserva: reduz em duas etapas e amplia suavizando
    const div = Math.max(2, radius / 2);
    const t1 = canvas(Math.max(2, Math.round(w / Math.sqrt(div))), Math.max(2, Math.round(h / Math.sqrt(div))));
    t1.getContext("2d").drawImage(img, 0, 0, t1.width, t1.height);
    const t2 = canvas(Math.max(2, Math.round(w / div)), Math.max(2, Math.round(h / div)));
    t2.getContext("2d").drawImage(t1, 0, 0, t2.width, t2.height);
    g.drawImage(t2, pad, pad, w, h);
    return c;
  };
  const r = Math.max(w, h) / 900;
  return [level(0), level(Math.round(10 * r) || 3), level(Math.round(26 * r) || 7)];
}
