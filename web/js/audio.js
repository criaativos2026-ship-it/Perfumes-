// Efeitos sonoros sintetizados no aparelho (sem bibliotecas pagas nem downloads).
// O guia da marca pede apenas efeitos, sem música de fundo.
export const SAMPLE_RATE = 48000;

function noiseBuffer(ctx, seconds) {
  const b = ctx.createBuffer(1, Math.ceil(seconds * ctx.sampleRate), ctx.sampleRate);
  const d = b.getChannelData(0);
  let s = 12345;
  for (let i = 0; i < d.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = (s / 0x3fffffff) - 1; }
  return b;
}

function env(gain, t0, attack, hold, release, peak) {
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  gain.gain.setValueAtTime(peak, t0 + attack + hold);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
}

const FX = {
  riser(ctx, out, t, vol) {
    const t0 = Math.max(0, t - 2.2);
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx, 2.6);
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 4;
    f.frequency.setValueAtTime(200, t0); f.frequency.exponentialRampToValueAtTime(5000, t);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.5 * vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    src.connect(f).connect(g).connect(out); src.start(t0); src.stop(t + 0.3);
  },
  impacto(ctx, out, t, vol) {
    const o = ctx.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.8);
    const g = ctx.createGain(); env(g, t, 0.005, 0.05, 1.4, 0.9 * vol);
    o.connect(g).connect(out); o.start(t); o.stop(t + 1.6);
    const n = ctx.createBufferSource(); n.buffer = noiseBuffer(ctx, 0.5);
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 900;
    const g2 = ctx.createGain(); env(g2, t, 0.002, 0.01, 0.35, 0.35 * vol);
    n.connect(lp).connect(g2).connect(out); n.start(t); n.stop(t + 0.5);
  },
  brilho(ctx, out, t, vol) {
    [2093, 2637, 3136, 4186].forEach((fr, i) => {
      const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = fr;
      const g = ctx.createGain(); env(g, t + i * 0.06, 0.004, 0.0, 0.9, 0.12 * vol);
      o.connect(g).connect(out); o.start(t + i * 0.06); o.stop(t + i * 0.06 + 1);
    });
  },
  varredura(ctx, out, t, vol) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx, 1.6);
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 2.5;
    f.frequency.setValueAtTime(800, t); f.frequency.exponentialRampToValueAtTime(7000, t + 0.7); f.frequency.exponentialRampToValueAtTime(1500, t + 1.4);
    const g = ctx.createGain(); env(g, t, 0.5, 0.2, 0.8, 0.28 * vol);
    src.connect(f).connect(g).connect(out); src.start(t); src.stop(t + 1.6);
  },
  sopro(ctx, out, t, vol) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx, 2.2);
    const f = ctx.createBiquadFilter(); f.type = "lowpass";
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(1400, t + 0.9); f.frequency.exponentialRampToValueAtTime(300, t + 2);
    const g = ctx.createGain(); env(g, t, 0.8, 0.2, 1.0, 0.35 * vol);
    src.connect(f).connect(g).connect(out); src.start(t); src.stop(t + 2.2);
  },
  borrifo(ctx, out, t, vol) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx, 0.7);
    const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 3500;
    const g = ctx.createGain(); env(g, t, 0.01, 0.25, 0.3, 0.3 * vol);
    src.connect(f).connect(g).connect(out); src.start(t); src.stop(t + 0.7);
  },
  vidro(ctx, out, t, vol) {
    [1760, 2793, 4400].forEach((fr, i) => {
      const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = fr;
      const g = ctx.createGain(); env(g, t, 0.002, 0, 1.6 - i * 0.4, (0.16 - i * 0.04) * vol);
      o.connect(g).connect(out); o.start(t); o.stop(t + 1.8);
    });
  },
  pad(ctx, out, t, vol, dur) {
    [55, 82.4, 110, 164.8].forEach((fr, i) => {
      const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = fr;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.1 + i * 0.03;
      const lg = ctx.createGain(); lg.gain.value = 0.3;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05 * vol, t + Math.min(1.5, dur / 3));
      g.gain.setValueAtTime(0.05 * vol, t + dur - Math.min(1.5, dur / 3)); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      lfo.connect(lg).connect(g.gain);
      o.connect(g).connect(out); o.start(t); lfo.start(t); o.stop(t + dur); lfo.stop(t + dur);
    });
  },
};

// Gera a trilha de efeitos sincronizada com as cenas.
export async function renderSoundtrack(scenes, totalDuration) {
  const ctx = new OfflineAudioContext(2, Math.ceil((totalDuration + 0.2) * SAMPLE_RATE), SAMPLE_RATE);
  const master = ctx.createDynamicsCompressor();
  master.threshold.value = -14; master.ratio.value = 3;
  const out = ctx.createGain(); out.gain.value = 0.9;
  master.connect(out).connect(ctx.destination);
  let t = 0;
  for (const s of scenes) {
    for (const name of s.sfx || []) {
      const fx = FX[name];
      if (!fx) continue;
      const at = name === "riser" ? t + Math.min(s.duration_s, 2.4) : name === "impacto" ? t + 0.15 : t + 0.3;
      fx(ctx, master, Math.min(at, totalDuration - 0.05), 1, s.duration_s);
    }
    t += s.duration_s;
  }
  const buffer = await ctx.startRendering();
  // fade-out final
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const d = buffer.getChannelData(ch);
    const n = Math.min(d.length, SAMPLE_RATE * 0.6);
    for (let i = 0; i < n; i++) d[d.length - 1 - i] *= i / n;
  }
  return buffer;
}

export { FX };
