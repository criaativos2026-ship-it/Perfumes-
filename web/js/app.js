// Perfume Commercial Studio — app para celular (tudo roda no aparelho; IA via Gemini gratuito).
import { parseBrand, upsertProduct, joinNotes } from "./brand.js";
import { identify, research, createDirection, similarity, AIError, PARTICLES, CAMERAS, TRANSITIONS, SCENE_TYPES } from "./ai.js";
import { GLYPHS } from "./glyphs.js";
import { Engine } from "./engine.js";
import { cutout, cutoutShapes, DEFAULT_SHAPES } from "./cutout.js";
import { renderSoundtrack } from "./audio.js";
import { exportMP4 } from "./export.js";
import * as store from "./store.js";

const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const SIZES = { "9:16": [1080, 1920], "4:5": [1080, 1350] };
const FIELD_LABEL = { official_name: "nome oficial", concentration: "concentração", top_notes: "notas de topo", heart_notes: "notas de coração", base_notes: "notas de fundo", olfactory_family: "família olfativa", main_accords: "acordes", key_ingredients: "ingredientes", concept: "conceito", perfumer: "perfumista", launch_year: "ano" };

let brand = null;
let P = null;          // projeto aberto
let busy = false;
let shownVersion = 0;
let preview = null;    // { engine, playing, t, raf }
let bottleBitmap = null;
let exportAbort = null;

// ---------- infraestrutura ----------
function status(msg, kind = "") {
  const el = $("#status");
  el.textContent = msg || "";
  el.className = "status " + kind;
}

async function task(label, fn) {
  if (busy) return;
  busy = true;
  status(label, "busy");
  renderProject();
  try {
    await fn();
    if ($("#status").classList.contains("busy")) status(""); // mantém avisos deixados pela etapa
  } catch (e) {
    if (e.name === "AbortError") status("Cancelado.");
    else { console.error(e); status(e instanceof AIError ? e.message : "Erro: " + (e.message || e), "error"); }
  } finally {
    busy = false;
    if (P) { await store.saveProject(P); renderProject(); }
  }
}

const aiCfg = () => { const s = store.settings.get(); return { key: s.key, model: s.model }; };

async function loadBrand() {
  let md = store.brandStore.get();
  if (!md) {
    for (const url of ["../brand/CLAUDE.md", "brand/CLAUDE.md"]) {
      try { const r = await fetch(url, { cache: "no-cache" }); if (r.ok) { md = await r.text(); break; } } catch { /* tenta o próximo */ }
    }
  }
  if (!md) { status("Guia da marca não encontrado. Importe o CLAUDE.md em Ajustes.", "error"); return; }
  brand = parseBrand(md);
  $("#brandName").textContent = brand.short;
  $("#brandInfo").textContent = `${brand.name}: ${brand.official.length} cores oficiais (${brand.official.map((c) => c.hex).join(", ")})` + (brand.deprecated.length ? `; proibidas: ${brand.deprecated.join(", ")}` : "") + ".";
}

async function loadFonts() {
  const faces = [
    new FontFace("Cormorant Garamond", "url(fonts/CormorantGaramond.ttf)", { weight: "300 700" }),
    new FontFace("Cormorant Garamond", "url(fonts/CormorantGaramond-Italic.ttf)", { weight: "300 700", style: "italic" }),
    new FontFace("Jost", "url(fonts/Jost.ttf)", { weight: "100 900" }),
  ];
  await Promise.all(faces.map(async (f) => { try { document.fonts.add(await f.load()); } catch (e) { console.warn("fonte", e); } }));
}

// ---------- início ----------
async function showHome() {
  stopPreview();
  P = null;
  $("#home").hidden = false;
  $("#project").hidden = true;
  history.replaceState(null, "", location.pathname);
  const list = await store.listProjects();
  $("#projectsCard").hidden = !list.length;
  $("#projects").innerHTML = list.map((p) => {
    const name = p.confirmed?.product_name || p.identification?.product_name || "Sem nome";
    return `<li><a href="#${p.id}">${esc(name)}<small>${p.options.aspect} · ${p.options.duration} s · ${p.created_at.slice(0, 10)}</small></a><button class="icon" data-del="${p.id}">Apagar</button></li>`;
  }).join("");
}

$("#projects").addEventListener("click", async (e) => {
  const id = e.target.dataset?.del;
  if (id && confirm("Apagar este projeto do aparelho?")) { await store.deleteProject(id); showHome(); }
});

$("#newForm").photo.addEventListener("change", (e) => {
  const f = e.target.files[0];
  if (!f) return;
  $("#newPreview").src = URL.createObjectURL(f);
  $("#newPreview").hidden = false;
  $("#newHint").hidden = true;
});

$("#newForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const photo = f.photo.files[0];
  if (!photo) return;
  if (!store.settings.get().key) { status("Antes, cadastre sua chave gratuita do Gemini em Ajustes.", "error"); $("#settings").showModal(); return; }
  P = {
    id: Date.now().toString(36),
    created_at: new Date().toISOString(),
    options: { aspect: f.aspect.value, duration: Number(f.duration.value) },
    photo,
    tolerance: 28,
    versions: [],
  };
  await store.saveProject(P);
  location.hash = P.id;
  await openProject(P.id);
  runIdentify();
});

// ---------- projeto ----------
async function openProject(id) {
  P = await store.getProject(id);
  if (!P) return showHome();
  $("#home").hidden = true;
  $("#project").hidden = false;
  $("#photo").src = URL.createObjectURL(P.photo);
  bottleBitmap = P.cutout ? await createImageBitmap(P.cutout) : null;
  shownVersion = P.approved ?? Math.max(0, P.versions.length - 1);
  const f = $("#confirmForm");
  const ci = P.confirmed || P.identification || {};
  f.brand.value = ci.brand || ""; f.product_name.value = ci.product_name || ""; f.concentration.value = ci.concentration || "";
  $("#tolerance").value = P.tolerance;
  renderProject();
  if (P.approved != null) renderCutEditor();
  if (P.approved != null) await startPreview();
}

function runIdentify() {
  task("Lendo o frasco e o rótulo…", async () => {
    P.identification = await identify(aiCfg(), P.photo);
    const f = $("#confirmForm");
    f.brand.value = P.identification.brand; f.product_name.value = P.identification.product_name; f.concentration.value = P.identification.concentration;
    status("");
  });
}

$("#confirmForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  P.confirmed = { brand: f.brand.value.trim(), product_name: f.product_name.value.trim(), concentration: f.concentration.value.trim() };
  runResearch();
});

function runResearch() {
  task("Pesquisando a ficha olfativa em fontes oficiais e lojas…", async () => {
    P.research = await research(aiCfg(), P.confirmed);
    setTimeout(() => $("#s-research").scrollIntoView({ behavior: "smooth" }), 50);
  });
}
$("#redoResearch").addEventListener("click", runResearch);

function runDirection(feedback = null) {
  task("Criando o conceito com o guia da marca…", async () => {
    const previous = store.fingerprints.all().filter((f) => f.id !== P.id);
    const args = { brand, ident: P.identification, profile: P.research.profile, duration: P.options.duration, previous, feedback };
    let out = await createDirection(aiCfg(), args);
    const clash = previous.find((p) => similarity(out.direction.fingerprint, p) >= 0.5);
    if (clash) {
      status(`Parecido com um conceito anterior (${clash.environment}); criando outro…`, "busy");
      out = await createDirection(aiCfg(), { ...args, feedback: (feedback || "") + ` Evite totalmente o ambiente "${clash.environment}".` });
    }
    P.versions.push({ ...out, feedback, created_at: new Date().toISOString() });
    shownVersion = P.versions.length - 1;
    setTimeout(() => $("#s-concept").scrollIntoView({ behavior: "smooth" }), 50);
  });
}
$("#toConcept").addEventListener("click", () => runDirection());
$("#feedbackForm").addEventListener("submit", (e) => { e.preventDefault(); runDirection(e.target.feedback.value.trim() || null); e.target.feedback.value = ""; });

$("#approveBtn").addEventListener("click", () => task("Recortando o frasco e montando as cenas…", async () => {
  P.approved = shownVersion;
  P.edit = structuredClone(P.versions[shownVersion].direction);
  store.fingerprints.put(P.id, P.edit.fingerprint);
  await makeCutout();
  // ficha do produto na seção 5 do guia (como o guia pede)
  const pr = P.research.profile, id = P.identification;
  const card = `### ${pr.official_name || P.confirmed.product_name} (${pr.brand || P.confirmed.brand})
- Tipo / concentração: ${pr.concentration || P.confirmed.concentration || "não informado"}
- Notas (topo, coração, fundo): topo: ${joinNotes(pr.top_notes) || "não encontrado"}; coração: ${joinNotes(pr.heart_notes) || "não encontrado"}; fundo: ${joinNotes(pr.base_notes) || "não encontrado"}
- Frase de campanha: ${P.edit.campaign_line} (sugestão)
- Frasco (descrição visual): ${id.bottle_description}
- Foto fornecida pelo usuário: sim
- Peças criadas (posts, vídeos): vídeo ${P.options.aspect} de ${P.options.duration} s
- Fonte das informações: ${pr.sources.map((s) => s.url).join(", ") || "nenhuma"} (conferir com o fornecedor antes de publicar)
`;
  const updated = upsertProduct(brand.raw, card);
  if (updated) { store.brandStore.set(updated); brand = parseBrand(updated); }
  await startPreview();
  setTimeout(() => $("#s-scenes").scrollIntoView({ behavior: "smooth" }), 50);
}));

async function makeCutout() {
  let res;
  if (P.cutMode === "manual") {
    res = await cutoutShapes(P.photo, P.shapes || DEFAULT_SHAPES);
  } else {
    res = await cutout(P.photo, { tolerance: Number(P.tolerance) });
    // fundo não removido (foto com cenário): passa para o recorte manual
    if (res.info.coverage > 0.85 || P.identification?.white_background === false) {
      P.cutMode = "manual";
      P.shapes ||= structuredClone(DEFAULT_SHAPES);
      res = await cutoutShapes(P.photo, P.shapes);
      status("A foto tem cenário ao fundo. Ajuste o recorte manual em Cenas → Recorte do frasco.", "error");
      setTimeout(() => { $(".cut").open = true; }, 100);
    }
  }
  P.cutout = await res.canvas.convertToBlob({ type: "image/png" });
  P.cutoutInfo = res.info;
  bottleBitmap = await createImageBitmap(P.cutout);
  renderCutEditor();
}

// ---------- editor manual do recorte ----------
function renderCutEditor() {
  const manual = P.cutMode === "manual";
  document.querySelector(`#cutMode input[value="${manual ? "manual" : "auto"}"]`).checked = true;
  $("#cutAuto").hidden = manual;
  $("#cutManual").hidden = !manual;
  if (!manual) return;
  P.shapes ||= structuredClone(DEFAULT_SHAPES);
  $("#shapesImg").src = URL.createObjectURL(P.photo);
  $("#radius").value = P.shapes[0].r;
  const box = $("#shapes");
  box.querySelectorAll(".shape").forEach((el) => el.remove());
  P.shapes.forEach((sh, i) => {
    const el = document.createElement("div");
    el.className = "shape";
    el.innerHTML = `<b>${sh.name}</b><i></i>`;
    const place = () => Object.assign(el.style, { left: sh.x * 100 + "%", top: sh.y * 100 + "%", width: sh.w * 100 + "%", height: sh.h * 100 + "%", borderRadius: `${sh.r * 100}% / ${sh.r * 100 * sh.w / sh.h}%` });
    place();
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      const rect = box.getBoundingClientRect();
      const resize = e.target.tagName === "I";
      const start = { x: e.clientX, y: e.clientY, sh: { ...sh } };
      const move = (ev) => {
        const dx = (ev.clientX - start.x) / rect.width, dy = (ev.clientY - start.y) / rect.height;
        if (resize) { sh.w = Math.max(0.02, Math.min(1 - sh.x, start.sh.w + dx)); sh.h = Math.max(0.02, Math.min(1 - sh.y, start.sh.h + dy)); }
        else { sh.x = Math.max(0, Math.min(1 - sh.w, start.sh.x + dx)); sh.y = Math.max(0, Math.min(1 - sh.h, start.sh.y + dy)); }
        place();
      };
      const up = () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); store.saveProject(P); };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
    });
    box.appendChild(el);
  });
}

$("#cutMode").addEventListener("change", (e) => {
  P.cutMode = e.target.value;
  renderCutEditor();
  if (P.cutMode === "auto") task("Refazendo o recorte…", async () => { await makeCutout(); await startPreview(); });
});
$("#radius").addEventListener("input", (e) => { P.shapes.forEach((sh, i) => (sh.r = i === 0 ? Number(e.target.value) : Math.max(Number(e.target.value), sh.r))); renderCutEditor(); });
$("#applyShapes").addEventListener("click", () => task("Aplicando o recorte…", async () => { await makeCutout(); await startPreview(); }));

let tolTimer = null;
$("#tolerance").addEventListener("input", (e) => {
  P.tolerance = Number(e.target.value);
  clearTimeout(tolTimer);
  tolTimer = setTimeout(() => task("Refazendo o recorte…", async () => { await makeCutout(); await startPreview(); }), 350);
});

// ---------- prévia ----------
async function startPreview() {
  stopPreview();
  const [w, h] = SIZES[P.options.aspect];
  const s = 540 / w;
  const engine = new Engine({ canvas: $("#preview"), brand, direction: P.edit, bottle: bottleBitmap, width: Math.round(w * s), height: Math.round(h * s) });
  preview = { engine, playing: false, t: Math.min(engine.timeline[0].dur * 0.95, engine.duration - 0.1), raf: 0, last: 0 };
  drawPreview();
  renderScenes();
}

function stopPreview() {
  if (preview) cancelAnimationFrame(preview.raf);
  preview = null;
  $("#playBtn").textContent = "Play";
}

function drawPreview() {
  const { engine, t } = preview;
  engine.render(t);
  $("#scrub").value = Math.round((t / engine.duration) * 1000);
  $("#time").textContent = t.toFixed(1).replace(".", ",") + " s";
}

function loop(now) {
  if (!preview?.playing) return;
  const dt = preview.last ? (now - preview.last) / 1000 : 0;
  preview.last = now;
  preview.t += dt;
  if (preview.t >= preview.engine.duration) preview.t = 0;
  drawPreview();
  preview.raf = requestAnimationFrame(loop);
}

$("#playBtn").addEventListener("click", () => {
  if (!preview) return;
  preview.playing = !preview.playing;
  $("#playBtn").textContent = preview.playing ? "Pausa" : "Play";
  preview.last = 0;
  if (preview.playing) preview.raf = requestAnimationFrame(loop);
});
$("#scrub").addEventListener("input", (e) => {
  if (!preview) return;
  preview.t = (Number(e.target.value) / 1000) * preview.engine.duration;
  drawPreview();
});

function seekScene(i) {
  if (!preview) return;
  preview.t = preview.engine.timeline[i].start + 0.05;
  drawPreview();
}

function applyEdit() {
  preview.engine.setDirection(P.edit);
  preview.t = Math.min(preview.t, preview.engine.duration - 0.01);
  drawPreview();
  store.saveProject(P);
}

// ---------- editor de cenas (refazer cada cena individualmente) ----------
function renderScenes() {
  const d = P.edit;
  const opt = (list, v) => list.map((x) => `<option ${x === v ? "selected" : ""}>${x}</option>`).join("");
  $("#scenes").innerHTML = d.scenes.map((s, i) => `
    <li class="scene"><details data-i="${i}">
      <summary><span class="n">${i + 1}</span><span class="t">${esc(s.title)}</span><span class="d">${s.duration_s.toFixed(1)} s</span></summary>
      <div class="body">
        <p>${esc(s.description)}</p>
        <label>Tipo<select data-k="type">${opt(Object.keys(SCENE_TYPES), s.type)}</select></label>
        ${["abertura", "notas", "packshot"].includes(s.type) ? "" : `<label>Texto na tela<input data-k="text" value="${esc(s.text)}"></label>`}
        <label>Duração (s)<input data-k="duration_s" type="number" min="2" max="8" step="0.5" value="${s.duration_s}"></label>
        <label>Partículas<select data-k="particles">${opt(PARTICLES, s.particles)}</select></label>
        <label>Quantidade<input data-k="particle_density" type="range" min="0" max="1" step="0.05" value="${s.particle_density}"></label>
        <label>Câmera<select data-k="camera">${opt(CAMERAS, s.camera)}</select></label>
        <label>Entrada<select data-k="transition_in">${opt(TRANSITIONS, s.transition_in)}</select></label>
        ${s.type === "ingrediente" ? `<div class="glyphs">${Object.keys(GLYPHS).map((g) => `<label><input type="checkbox" data-glyph="${g}" ${s.glyphs.includes(g) ? "checked" : ""}>${g.replace("_", " ")}</label>`).join("")}</div>` : ""}
        <div class="row"><button data-act="play">Ver cena</button><button data-act="vary">Variar movimento</button></div>
      </div>
    </details></li>`).join("");
}

$("#scenes").addEventListener("toggle", (e) => { if (e.target.open) seekScene(Number(e.target.dataset.i)); }, true);
$("#scenes").addEventListener("input", (e) => {
  const det = e.target.closest("details");
  if (!det) return;
  const s = P.edit.scenes[Number(det.dataset.i)];
  const k = e.target.dataset.k;
  if (e.target.dataset.glyph) {
    s.glyphs = [...det.querySelectorAll("[data-glyph]:checked")].map((x) => x.dataset.glyph).slice(0, 3);
  } else if (k) {
    s[k] = e.target.type === "number" || e.target.type === "range" ? Number(e.target.value) : e.target.value;
    if (k === "duration_s") s.duration_s = Math.min(8, Math.max(2, s.duration_s || 3));
  }
  applyEdit();
  if (k === "type" || k === "duration_s") { const open = det.dataset.i; renderScenes(); $(`#scenes details[data-i="${open}"]`).open = true; }
});
$("#scenes").addEventListener("click", (e) => {
  const act = e.target.dataset.act;
  if (!act) return;
  const i = Number(e.target.closest("details").dataset.i);
  if (act === "vary") { P.edit.scenes[i].seed = (P.edit.scenes[i].seed || 0) + 1; applyEdit(); }
  seekScene(i);
  if (!preview.playing) $("#playBtn").click();
});

// ---------- exportação ----------
$("#exportBtn").addEventListener("click", () => {
  exportAbort = new AbortController();
  $("#cancelBtn").hidden = false;
  $(".progress").hidden = false;
  task("Gerando o comercial…", async () => {
    if (preview?.playing) $("#playBtn").click();
    const [w, h] = SIZES[P.options.aspect];
    const cv = document.createElement("canvas");
    const engine = new Engine({ canvas: cv, brand, direction: P.edit, bottle: bottleBitmap, width: w, height: h });
    status("Criando os efeitos sonoros…", "busy");
    const audio = await renderSoundtrack(P.edit.scenes, engine.duration);
    const out = await exportMP4(engine, audio, {
      signal: exportAbort.signal,
      onProgress: (p, label) => { $("#bar").style.width = Math.round(p * 100) + "%"; status(`${label}… ${Math.round(p * 100)}%`, "busy"); },
    });
    const name = `${(P.confirmed.product_name || "comercial").replace(/[^\w-]+/g, "-").toLowerCase()}-${P.options.aspect.replace(":", "x")}-${P.options.duration}s.${out.ext}`;
    P.result = { blob: out.blob, name, audio: out.audio };
    showResult();
  }).finally(() => { $("#cancelBtn").hidden = true; $(".progress").hidden = true; });
});
$("#cancelBtn").addEventListener("click", () => exportAbort?.abort());

function showResult() {
  if (!P.result) return;
  const url = URL.createObjectURL(P.result.blob);
  $("#result").src = url;
  $("#result").hidden = false;
  $("#resultActions").hidden = false;
  $("#downloadLink").href = url;
  $("#downloadLink").download = P.result.name;
  $("#downloadLink").textContent = P.result.name.endsWith(".mp4") ? "Baixar MP4" : "Baixar vídeo";
  const file = new File([P.result.blob], P.result.name, { type: P.result.blob.type });
  $("#shareBtn").hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
  $("#shareBtn").onclick = () => navigator.share({ files: [file], title: P.result.name }).catch(() => {});
  $("#exportHint").textContent = P.result.audio ? "Pronto. Vídeo com efeitos sonoros." : "Pronto. Este navegador não codificou o áudio; o vídeo saiu sem som.";
}

// ---------- renderização das etapas ----------
function renderProject() {
  if (!P) return;
  const id = P.identification;
  $("#confirmForm button").disabled = busy || !id;
  if (id) {
    $("#identInfo").innerHTML = `
      ${id.is_perfume ? "" : '<div class="warn">A foto não parece mostrar um perfume.</div>'}
      <dl class="kv">
        <dt>Marca</dt><dd>${esc(id.brand) || "<em>ilegível</em>"}</dd>
        <dt>Perfume</dt><dd>${esc(id.product_name) || "<em>ilegível</em>"}</dd>
        <dt>Confiança</dt><dd>${esc(id.confidence)}</dd>
        <dt>No frasco</dt><dd>${esc(id.visible_text.join(" · "))}</dd>
      </dl>
      ${id.possible_confusions.length ? `<div class="warn">Atenção a nomes parecidos: ${esc(id.possible_confusions.join("; "))}</div>` : ""}
      ${id.has_box_in_photo ? '<div class="warn">A caixa aparece na foto. O guia pede só o frasco.</div>' : ""}
      ${!id.white_background || id.photo_issues.length ? `<div class="warn">Foto: ${esc([!id.white_background ? "fundo não é branco (o recorte pode falhar)" : "", ...id.photo_issues].filter(Boolean).join("; "))}</div>` : ""}`;
  } else {
    $("#identInfo").innerHTML = busy ? '<p class="hint">Analisando…</p>' : `<button id="retryIdent">Identificar novamente</button>`;
    $("#retryIdent")?.addEventListener("click", runIdentify);
  }

  // pesquisa
  const r = P.research;
  $("#s-research").hidden = !(r || P.confirmed);
  if (r) {
    const pr = r.profile;
    const src = (f) => (pr.field_sources.find((x) => x.field === f)?.urls || []).map((u) => esc(new URL(u).hostname.replace(/^www\./, ""))).join(", ");
    const nf = (v) => v || "<em>não encontrado</em>";
    $("#researchOut").innerHTML = `
      <dl class="kv">
        <dt>Nome</dt><dd>${nf(esc(pr.official_name))}</dd>
        <dt>Marca</dt><dd>${nf(esc(pr.brand))}</dd>
        <dt>Concentração</dt><dd>${nf(esc(pr.concentration))}</dd>
        <dt>Família</dt><dd>${nf(esc(pr.olfactory_family))}</dd>
        <dt>Acordes</dt><dd>${nf(esc(joinNotes(pr.main_accords)))}</dd>
        <dt>Perfumista</dt><dd>${nf(esc(pr.perfumer))}</dd>
        <dt>Ano</dt><dd>${nf(esc(pr.launch_year))}</dd>
      </dl>
      ${pr.notes_structure === "linear" ? '<p class="hint">A marca não divide este perfume em pirâmide.</p>' : ""}
      <div class="notes">
        <div><div class="label">Topo</div><div class="text">${nf(esc(joinNotes(pr.top_notes)))}</div><div class="src">${src("top_notes")}</div></div>
        <div><div class="label">Coração</div><div class="text">${nf(esc(joinNotes(pr.heart_notes)))}</div><div class="src">${src("heart_notes")}</div></div>
        <div><div class="label">Fundo</div><div class="text">${nf(esc(joinNotes(pr.base_notes)))}</div><div class="src">${src("base_notes")}</div></div>
      </div>
      ${pr.concept ? `<h3>Conceito da fragrância</h3><p>${esc(pr.concept)}</p>` : ""}
      ${pr.conflicts.length ? `<div class="warn">Divergências: ${esc(pr.conflicts.join("; "))}</div>` : ""}
      ${pr.not_found.length ? `<div class="warn">Sem fonte confiável: ${esc(pr.not_found.map((f) => FIELD_LABEL[f] || f).join(", "))}</div>` : ""}
      ${r.warnings.length ? `<details><summary class="hint">${r.warnings.length} dado(s) descartado(s) por falta de fonte</summary><div class="warn">${r.warnings.map(esc).join("<br>")}</div></details>` : ""}
      <h3>Fontes</h3>
      <div class="sources">${pr.sources.map((s) => `<div><span class="tag">${esc(s.kind)}</span><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title || s.url)}</a></div>`).join("") || '<p class="hint">Nenhuma fonte verificada.</p>'}</div>
      <p class="hint">As notas vêm de sites e lojas; confira com o fornecedor antes de publicar.</p>`;
  } else if (P.confirmed) {
    $("#researchOut").innerHTML = busy ? '<p class="hint">Pesquisando…</p>' : '<p class="hint">A pesquisa não terminou. Toque em "Refazer pesquisa".</p>';
  }
  $("#toConcept").disabled = busy || !r;
  $("#redoResearch").disabled = busy || !P.confirmed;

  // conceito
  const vs = P.versions;
  $("#s-concept").hidden = !(vs.length || (busy && r));
  $("#versions").innerHTML = vs.map((v, i) => `<button class="${i === shownVersion ? "sel" : ""}" data-v="${i}">Versão ${i + 1}${P.approved === i ? " ✓" : ""}</button>`).join("");
  $("#conceptOut").innerHTML = vs.length ? conceptHTML(vs[shownVersion]) : '<p class="hint">Criando…</p>';
  $("#approveBtn").disabled = busy || !vs.length;
  $("#feedbackForm button[type=submit]").disabled = busy || !r;

  // cenas e exportação
  $("#s-scenes").hidden = P.approved == null;
  $("#s-export").hidden = P.approved == null;
  $("#exportBtn").disabled = busy;
  if (P.cutout) $("#cutImg").src = URL.createObjectURL(P.cutout);
  if (P.result && $("#result").hidden) showResult();

  // trilha de etapas
  const done = { "s-identify": !!P.confirmed, "s-research": !!r, "s-concept": P.approved != null, "s-scenes": P.approved != null, "s-export": !!P.result };
  const active = !P.confirmed ? "s-identify" : !r ? "s-research" : P.approved == null ? "s-concept" : !P.result ? "s-scenes" : "s-export";
  document.querySelectorAll("#steps a").forEach((a) => {
    const k = a.getAttribute("href").slice(1);
    a.classList.toggle("done", done[k]);
    a.classList.toggle("active", k === active);
  });
}

$("#versions").addEventListener("click", (e) => { if (e.target.dataset.v != null) { shownVersion = Number(e.target.dataset.v); renderProject(); } });

function conceptHTML(v) {
  const d = v.direction;
  return `
    <h3>${esc(d.campaign_title)}</h3>
    <blockquote>${esc(d.campaign_line)}</blockquote>
    <p>${esc(d.concept)}</p>
    ${v.warnings.length ? `<div class="warn">${v.warnings.map(esc).join("<br>")}</div>` : ""}
    <h3>Das notas para a imagem</h3>
    <dl class="kv">${d.olfactory_translation.map((n) => `<dt>${esc(n.note)}</dt><dd>${esc(n.visual)}</dd>`).join("")}</dl>
    <h3>Ambiente e luz</h3><p>${esc(d.setting)}</p><p class="hint">${esc(d.lighting)}</p>
    <h3>Paleta</h3>
    <div class="palette">${[...brand.official.slice(0, 6).map((c) => ({ hex: c.hex, role: c.name })), ...d.accent_colors].map((c) => `<div class="swatch"><i style="background:${esc(c.hex)}"></i>${esc(c.hex)}<br>${esc(c.role)}</div>`).join("")}</div>
    <h3>Roteiro</h3>
    <ol>${d.scenes.map((s) => `<li><b>${esc(s.title)}</b> · ${s.duration_s.toFixed(1)} s<br><span class="hint">${esc(s.description)}${s.text ? ` — “${esc(s.text)}”` : ""}</span></li>`).join("")}</ol>
    <h3>Fechamento</h3>
    <p><b>${esc(d.end_card.perfume_name)}</b> · <em>${esc(d.end_card.subtitle)}</em><br>
    <span class="hint">Topo: ${esc(d.end_card.top)} · Coração: ${esc(d.end_card.heart)} · Fundo: ${esc(d.end_card.base)}<br>${esc(d.end_card.cta)}</span></p>`;
}

// ---------- ajustes ----------
$("#settingsBtn").addEventListener("click", () => {
  const s = store.settings.get();
  const f = $("#settingsForm");
  f.key.value = s.key; f.model.value = s.model;
  $("#settings").showModal();
});
$("#settings").addEventListener("close", () => {
  if ($("#settings").returnValue !== "save") return;
  const f = $("#settingsForm");
  store.settings.set({ key: f.key.value.trim(), model: f.model.value.trim() || "gemini-flash-latest" });
  status("Ajustes salvos.");
});
$("#brandFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const md = await file.text();
  store.brandStore.set(md);
  await loadBrand();
  status(`Guia "${brand.name}" importado.`);
});
$("#brandDownload").addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([brand.raw], { type: "text/markdown" }));
  a.download = "CLAUDE.md";
  a.click();
});

$("#homeBtn").addEventListener("click", () => { location.hash = ""; showHome(); });
window.addEventListener("hashchange", () => { const id = location.hash.slice(1); if (id && id !== P?.id) openProject(id); else if (!id) showHome(); });

// ---------- início do app ----------
(async () => {
  await Promise.all([loadFonts(), loadBrand()]);
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  const id = location.hash.slice(1);
  if (id) await openProject(id); else await showHome();
  if (!store.settings.get().key) status("Primeiro passo: toque em Ajustes e cadastre sua chave gratuita do Gemini.");
})();
