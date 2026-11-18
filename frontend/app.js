// AI Perfume Commercial Studio — interface (Fase 1: upload → identificação → pesquisa → conceito)
const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const joinNotes = (a) => !a || !a.length ? "<em>não encontrado</em>" : a.length === 1 ? esc(a[0]) : esc(a.slice(0, -1).join(", ")) + " e " + esc(a.at(-1));

let project = null;
let source = null;
let shownVersion = null;

async function api(path, opts = {}) {
  const res = await fetch(path, opts);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail || `Erro ${res.status}`);
  return body;
}

function logEvent(ev) {
  const li = document.createElement("li");
  li.className = ev.kind;
  li.textContent = `${ev.ts.slice(11, 19)} · ${ev.message}`;
  $("#log").prepend(li);
}

function setStatus(text, busy = false) {
  $("#status").textContent = text || "";
  $("#status").classList.toggle("busy", busy);
}

async function loadConfig() {
  const cfg = await api("/api/config");
  $("#providers").innerHTML = Object.values(cfg.providers)
    .map((p) => `<span class="pill ${p.configured ? "on" : "off"}" title="Fase ${p.phase}">${esc(p.label)}</span>`).join("");
  if (cfg.brand.loaded) $("#brandName").textContent = cfg.brand.name.split(" ")[0].toUpperCase();
  else setStatus(cfg.brand.error);
  $("#aspect").innerHTML = Object.entries(cfg.formats).map(([k, f]) => `<option value="${k}">${esc(f.label)}</option>`).join("");
  $("#duration").innerHTML = cfg.durations.map((d) => `<option value="${d}" ${d === 30 ? "selected" : ""}>${d} s</option>`).join("");
  const list = await api("/api/projects");
  $("#history").innerHTML = list.length ? "<h3>Projetos anteriores</h3>" + list.map((p) =>
    `<a href="#${p.id}">${esc(p.name || "Sem nome")} · ${esc(p.status)} · ${p.created_at.slice(0, 10)}</a>`).join("") : "";
}

function stepState(p) {
  const st = p.status || "";
  const done = new Set(["upload"]);
  let active = "identify";
  if (p.identification) { done.add("identify"); active = "identify"; }
  if (p.research) { done.add("research"); active = "direction"; }
  else if (p.confirmed_identity) active = "research";
  if (p.direction_versions?.length) active = "direction";
  if (st === "concept:approved") { done.add("direction"); active = "scenes"; }
  document.querySelectorAll("#steps li").forEach((li) => {
    li.classList.toggle("done", done.has(li.dataset.step));
    li.classList.toggle("active", li.dataset.step === active);
  });
}

function render(p) {
  project = p;
  stepState(p);
  const running = p.running || (p.status || "").endsWith(":running");
  if (running) setStatus("Processando…", true);
  else if (p.error) setStatus(`Falhou: ${p.error.message}`);
  else setStatus("");

  $("#panel-upload").hidden = true;
  // Identificação
  $("#panel-identify").hidden = false;
  $("#bottleImg").src = "/media/" + p.image;
  const id = p.identification;
  if (id) {
    const issues = id.photo_issues?.length ? `<div class="warn">Foto: ${esc(id.photo_issues.join("; "))}</div>` : "";
    const conf = id.possible_confusions?.length ? `<div class="warn">Atenção a nomes parecidos: ${esc(id.possible_confusions.join("; "))}</div>` : "";
    $("#identResult").innerHTML = `
      ${!id.is_perfume ? '<div class="warn">A foto não parece mostrar um perfume.</div>' : ""}
      <dl class="kv">
        <dt>Marca</dt><dd>${esc(id.brand) || "<em>ilegível</em>"}</dd>
        <dt>Perfume</dt><dd>${esc(id.product_name) || "<em>ilegível</em>"}</dd>
        <dt>Concentração</dt><dd>${esc(id.concentration) || "—"}</dd>
        <dt>Confiança</dt><dd>${esc(id.confidence)}</dd>
        <dt>Textos no frasco</dt><dd>${esc((id.visible_text || []).join(" · "))}</dd>
        <dt>Frasco</dt><dd>${esc(id.bottle_description)}</dd>
      </dl>${issues}${conf}`;
    const f = $("#confirmForm");
    const ci = p.confirmed_identity || id;
    if (!f.dataset.filled) {
      f.brand.value = ci.brand || ""; f.product_name.value = ci.product_name || ""; f.concentration.value = ci.concentration || "";
      f.dataset.filled = "1";
    }
  } else if (p.error?.step === "identify") {
    $("#identResult").innerHTML = `<div class="warn">${esc(p.error.message)}</div><button onclick="retryIdentify()">Tentar novamente</button>`;
  } else {
    $("#identResult").innerHTML = '<p class="hint">Analisando a foto…</p>';
  }
  $("#confirmForm").querySelector("button").disabled = running;

  // Pesquisa
  const r = p.research;
  $("#panel-research").hidden = !(r || p.confirmed_identity);
  if (r) {
    const pr = r.profile;
    const srcFor = (field) => (pr.field_sources.find((f) => f.field === field)?.urls || []);
    const linkList = (urls) => urls.map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(new URL(u).hostname)}</a>`).join(", ");
    $("#researchResult").innerHTML = `
      <dl class="kv">
        <dt>Nome oficial</dt><dd>${esc(pr.official_name) || "—"}</dd>
        <dt>Marca</dt><dd>${esc(pr.brand) || "—"}${pr.manufacturer ? " · " + esc(pr.manufacturer) : ""}</dd>
        <dt>Concentração</dt><dd>${esc(pr.concentration) || "—"}</dd>
        <dt>Perfumista</dt><dd>${esc(pr.perfumer) || "—"}</dd>
        <dt>Lançamento</dt><dd>${esc(pr.launch_year) || "—"}</dd>
        <dt>Família olfativa</dt><dd>${esc(pr.olfactory_family) || "<em>não encontrada</em>"}</dd>
        <dt>Acordes</dt><dd>${joinNotes(pr.main_accords)}</dd>
        <dt>Ingredientes</dt><dd>${joinNotes(pr.key_ingredients)}</dd>
      </dl>
      ${pr.notes_structure === "linear" ? '<p class="hint">A marca não divide este perfume em pirâmide (estrutura linear).</p>' : ""}
      <div class="notes">
        <div><div class="label">Topo</div><div class="text">${joinNotes(pr.top_notes)}</div><div class="sources">${linkList(srcFor("top_notes"))}</div></div>
        <div><div class="label">Coração</div><div class="text">${joinNotes(pr.heart_notes)}</div><div class="sources">${linkList(srcFor("heart_notes"))}</div></div>
        <div><div class="label">Fundo</div><div class="text">${joinNotes(pr.base_notes)}</div><div class="sources">${linkList(srcFor("base_notes"))}</div></div>
      </div>
      ${pr.concept ? `<h4>Conceito da fragrância</h4><p>${esc(pr.concept)}</p>` : ""}
      ${pr.conflicts.length ? `<div class="warn">Divergências entre fontes: ${esc(pr.conflicts.join("; "))}</div>` : ""}
      ${pr.not_found.length ? `<div class="warn">Não encontrado em fonte confiável: ${esc(pr.not_found.join(", "))}</div>` : ""}
      ${r.warnings.length ? `<div class="warn">${r.warnings.map(esc).join("<br>")}</div>` : ""}
      <h4>Fontes</h4>
      <div class="sources">${pr.sources.map((s) => `<div><span class="tag">${esc(s.kind)}</span><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title || s.url)}</a></div>`).join("")}</div>
      <p class="hint">As notas vêm de sites e lojas; confira com o fornecedor antes de publicar.</p>`;
  } else if (p.error?.step === "research") {
    $("#researchResult").innerHTML = `<div class="warn">${esc(p.error.message)}</div>`;
  } else {
    $("#researchResult").innerHTML = '<p class="hint">Pesquisando…</p>';
  }
  $("#goDirection").disabled = running || !r;
  $("#redoResearch").disabled = running || !p.confirmed_identity;

  // Direção
  const versions = p.direction_versions || [];
  $("#panel-direction").hidden = !(versions.length || (p.status || "").startsWith("direction"));
  if (shownVersion === null || shownVersion >= versions.length) shownVersion = p.direction_index ?? versions.length - 1;
  $("#versions").innerHTML = versions.map((v, i) =>
    `<button class="${i === shownVersion ? "sel" : ""}" onclick="showVersion(${i})">Versão ${i + 1}${p.approved_direction === i ? " ✓" : ""}</button>`).join("");
  if (versions.length) renderDirection(versions[shownVersion]);
  else $("#directionResult").innerHTML = p.error?.step === "direction" ? `<div class="warn">${esc(p.error.message)}</div>` : '<p class="hint">Criando conceito…</p>';
  $("#approveBtn").disabled = running || !versions.length;
  $("#feedbackForm").querySelector("button[type=submit]").disabled = running || !r;

  // Próximas fases
  $("#panel-next").hidden = p.status !== "concept:approved";
  $("#nextText").textContent = "Conceito aprovado" + (p.catalog_updated ? " e ficha registrada no guia da marca" : "") +
    ". A geração de keyframes, vídeo por cena, áudio e montagem entra nas próximas fases (Gemini/Veo, Kling, ElevenLabs e FFmpeg).";
}

function renderDirection(v) {
  const d = v.direction;
  const total = d.scenes.reduce((a, s) => a + s.duration_s, 0);
  $("#directionResult").innerHTML = `
    <h3>${esc(d.campaign_title)}</h3>
    <blockquote>${esc(d.campaign_line)}</blockquote>
    <p>${esc(d.concept)}</p>
    ${v.warnings.length ? `<div class="warn">${v.warnings.map(esc).join("<br>")}</div>` : ""}
    <h4>Das notas para a imagem</h4>
    <dl class="kv">${d.olfactory_translation.map((n) => `<dt>${esc(n.note)}</dt><dd>${esc(n.visual)}</dd>`).join("")}</dl>
    <h4>Ambientação e cenário</h4><p>${esc(d.setting)}</p><p>${esc(d.scenery)}</p>
    <dl class="kv">
      <dt>Elementos naturais</dt><dd>${esc(d.natural_elements.join(", "))}</dd>
      <dt>Ingredientes flutuantes</dt><dd>${esc(d.floating_ingredients.join(", "))}</dd>
      <dt>Texturas</dt><dd>${esc(d.textures.join(", "))}</dd>
      <dt>Iluminação</dt><dd>${esc(d.lighting)}</dd>
      <dt>Câmera</dt><dd>${esc(d.camera_language)}</dd>
      <dt>Som</dt><dd>${esc(d.sound_direction)}</dd>
    </dl>
    <h4>Paleta</h4>
    <div class="palette">${d.palette.map((c) => `<div class="swatch"><i style="background:${esc(c.hex)}"></i>${esc(c.hex)}<br>${esc(c.role)} · ${esc(c.origin)}</div>`).join("")}</div>
    <h4>Roteiro (${total.toFixed(1)} s)</h4>
    ${d.scenes.map((s) => `
      <div class="scene">
        <div class="num">${s.index}</div>
        <div>
          <strong>${esc(s.title)}</strong>
          <div class="meta">${s.duration_s}s · ${esc(s.shot_type)} · frasco ${esc(s.product_on_screen)} · entra com ${esc(s.transition_in)} · ${esc(s.recommended_provider)}</div>
          <p>${esc(s.description)}</p>
          <div class="meta">Câmera: ${esc(s.camera_movement)} · Luz: ${esc(s.lighting)}${s.sfx.length ? " · Som: " + esc(s.sfx.join(", ")) : ""}</div>
          ${s.on_screen_text ? `<div class="meta">Texto: “${esc(s.on_screen_text)}”</div>` : ""}
          <details><summary>Prompts</summary><code>IMAGEM: ${esc(s.image_prompt)}\n\nMOVIMENTO: ${esc(s.motion_prompt)}</code></details>
        </div>
      </div>`).join("")}
    <h4>Cartela final</h4>
    <p><strong>${esc(d.end_card.perfume_name)}</strong> · <em>${esc(d.end_card.subtitle)}</em><br>
    Topo: ${esc(d.end_card.notes_line_top)} · Coração: ${esc(d.end_card.notes_line_heart)} · Fundo: ${esc(d.end_card.notes_line_base)}<br>
    ${esc(d.end_card.cta)}</p>
    <h4>Conformidade com a marca</h4><ul>${d.brand_compliance.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
}

window.showVersion = (i) => { shownVersion = i; render(project); };
window.retryIdentify = async () => { await act(() => api(`/api/projects/${project.id}/identify`, { method: "POST" })); };

async function refresh() {
  if (!project) return;
  render(await api(`/api/projects/${project.id}`));
}

async function act(fn) {
  try { await fn(); await refresh(); } catch (e) { setStatus(e.message); }
}

function openProject(id) {
  if (source) source.close();
  $("#log").innerHTML = "";
  source = new EventSource(`/api/projects/${id}/events`);
  source.onmessage = (m) => { const ev = JSON.parse(m.data); logEvent(ev); if (ev.kind !== "progress") refresh(); };
  api(`/api/projects/${id}`).then(render).catch((e) => setStatus(e.message));
  location.hash = id;
}

// Upload
const fileInput = $("#uploadForm input[type=file]");
$("#drop").addEventListener("dragover", (e) => e.preventDefault());
$("#drop").addEventListener("drop", (e) => { e.preventDefault(); fileInput.files = e.dataTransfer.files; preview(); });
fileInput.addEventListener("change", preview);
function preview() {
  const f = fileInput.files[0];
  if (!f) return;
  $("#dropPreview").src = URL.createObjectURL(f);
  $("#dropPreview").hidden = false;
  $("#dropText").hidden = true;
}
$("#uploadForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = e.submitter; btn.disabled = true;
  setStatus("Enviando…", true);
  try {
    const p = await api("/api/projects", { method: "POST", body: new FormData(e.target) });
    openProject(p.id);
  } catch (err) { setStatus(err.message); } finally { btn.disabled = false; }
});

$("#confirmForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  act(() => api(`/api/projects/${project.id}/research`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brand: f.brand.value, product_name: f.product_name.value, concentration: f.concentration.value || null }),
  }));
});
$("#redoResearch").addEventListener("click", () => {
  const ci = project.confirmed_identity;
  act(() => api(`/api/projects/${project.id}/research`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ci) }));
});
$("#goDirection").addEventListener("click", () => act(() => api(`/api/projects/${project.id}/direction`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })));
$("#feedbackForm").addEventListener("submit", (e) => {
  e.preventDefault();
  shownVersion = null;
  act(() => api(`/api/projects/${project.id}/direction`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ feedback: e.target.feedback.value || null }) }));
});
$("#approveBtn").addEventListener("click", () => act(() => api(`/api/projects/${project.id}/direction/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ index: shownVersion }) })));

loadConfig().catch((e) => setStatus(e.message));
if (location.hash.length > 1) openProject(location.hash.slice(1));
window.addEventListener("hashchange", () => { const id = location.hash.slice(1); if (id && id !== project?.id) openProject(id); });
