// Exportação do comercial em MP4 (H.264 + AAC) direto no celular, com WebCodecs + mp4-muxer.
// Se o navegador não tiver WebCodecs, grava em tempo real com MediaRecorder.
import { Muxer, ArrayBufferTarget } from "../vendor/mp4-muxer.mjs";
import { SAMPLE_RATE } from "./audio.js";

const AVC_CODECS = ["avc1.640028", "avc1.4d0028", "avc1.42003e", "avc1.42001f"];

export async function webcodecsSupport(width, height) {
  if (typeof VideoEncoder === "undefined") return null;
  for (const codec of AVC_CODECS) {
    try {
      const r = await VideoEncoder.isConfigSupported({ codec, width, height, bitrate: 10e6, framerate: 30 });
      if (r.supported) {
        let audio = false;
        if (typeof AudioEncoder !== "undefined") {
          try { audio = (await AudioEncoder.isConfigSupported({ codec: "mp4a.40.2", sampleRate: SAMPLE_RATE, numberOfChannels: 2, bitrate: 192000 })).supported; } catch { audio = false; }
        }
        return { codec, audio };
      }
    } catch { /* tenta o próximo */ }
  }
  return null;
}

export async function exportMP4(engine, audioBuffer, { fps = 30, onProgress = () => {}, signal } = {}) {
  const { W, H } = engine;
  const support = await webcodecsSupport(W, H);
  if (!support) return exportRealtime(engine, audioBuffer, { fps, onProgress, signal });

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width: W, height: H, frameRate: fps },
    audio: support.audio && audioBuffer ? { codec: "aac", numberOfChannels: 2, sampleRate: SAMPLE_RATE } : undefined,
    fastStart: "in-memory",
  });
  let failure = null;
  const venc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => (failure = e) });
  venc.configure({ codec: support.codec, width: W, height: H, bitrate: H >= 1920 ? 12e6 : 9e6, framerate: fps, latencyMode: "quality" });

  const frames = Math.round(engine.duration * fps);
  for (let i = 0; i < frames; i++) {
    if (signal?.aborted) throw new DOMException("Cancelado", "AbortError");
    if (failure) throw failure;
    engine.render(i / fps);
    const frame = new VideoFrame(engine.cv, { timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps) });
    venc.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    frame.close();
    if (venc.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 0));
    if (i % 5 === 0) { onProgress(i / frames, "Renderizando quadros"); await new Promise((r) => setTimeout(r, 0)); }
  }
  await venc.flush();
  venc.close();

  if (support.audio && audioBuffer) {
    onProgress(1, "Codificando áudio");
    const aenc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: (e) => (failure = e) });
    aenc.configure({ codec: "mp4a.40.2", sampleRate: SAMPLE_RATE, numberOfChannels: 2, bitrate: 192000 });
    const total = Math.min(audioBuffer.length, Math.round(engine.duration * SAMPLE_RATE));
    const block = 4096;
    const L = audioBuffer.getChannelData(0), R = audioBuffer.getChannelData(1);
    for (let off = 0; off < total; off += block) {
      const n = Math.min(block, total - off);
      const data = new Float32Array(n * 2);
      data.set(L.subarray(off, off + n), 0);
      data.set(R.subarray(off, off + n), n);
      const ad = new AudioData({ format: "f32-planar", sampleRate: SAMPLE_RATE, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((off * 1e6) / SAMPLE_RATE), data });
      aenc.encode(ad);
      ad.close();
    }
    await aenc.flush();
    aenc.close();
  }
  if (failure) throw failure;
  muxer.finalize();
  return { blob: new Blob([muxer.target.buffer], { type: "video/mp4" }), ext: "mp4", audio: !!(support.audio && audioBuffer) };
}

// Plano B: grava em tempo real (o comercial roda na tela enquanto grava).
async function exportRealtime(engine, audioBuffer, { fps, onProgress, signal }) {
  if (typeof MediaRecorder === "undefined" || !engine.cv.captureStream) throw new Error("Este navegador não consegue gerar vídeo. Use o Chrome (Android) ou Safari atualizado (iPhone).");
  const stream = engine.cv.captureStream(fps);
  let actx = null;
  if (audioBuffer) {
    actx = new AudioContext({ sampleRate: SAMPLE_RATE });
    const dest = actx.createMediaStreamDestination();
    const src = actx.createBufferSource(); src.buffer = audioBuffer; src.connect(dest);
    dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    engine._audioSrc = src;
  }
  const mime = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m));
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 10e6 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise((r) => (rec.onstop = r));
  rec.start(500);
  engine._audioSrc?.start();
  const t0 = performance.now();
  await new Promise((resolve, reject) => {
    const tick = () => {
      if (signal?.aborted) { rec.stop(); reject(new DOMException("Cancelado", "AbortError")); return; }
      const t = (performance.now() - t0) / 1000;
      if (t >= engine.duration) { resolve(); return; }
      engine.render(t);
      onProgress(t / engine.duration, "Gravando em tempo real");
      requestAnimationFrame(tick);
    };
    tick();
  });
  rec.stop();
  await done;
  actx?.close();
  const type = mime.split(";")[0];
  return { blob: new Blob(chunks, { type }), ext: type.includes("mp4") ? "mp4" : "webm", audio: !!audioBuffer };
}
