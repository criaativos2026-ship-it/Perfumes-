// Service worker: guarda o app no aparelho para abrir rápido e funcionar como app instalado.
const CACHE = "perfume-studio-v2";
const FILES = ["./", "index.html", "styles.css", "manifest.webmanifest", "js/app.js", "js/ai.js", "js/audio.js", "js/brand.js", "js/cutout.js", "js/engine.js", "js/export.js", "js/gemini.js", "js/glyphs.js", "js/store.js", "vendor/mp4-muxer.mjs", "fonts/CormorantGaramond.ttf", "fonts/CormorantGaramond-Italic.ttf", "fonts/Jost.ttf", "icons/icon-192.png", "icons/icon-512.png"];
self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // chamadas ao Gemini nunca passam pelo cache
  // rede primeiro (pega atualizações), cache como reserva offline
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
