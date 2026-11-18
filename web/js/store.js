// Armazenamento local no aparelho (IndexedDB + localStorage). Nada sai do celular, exceto as chamadas ao Gemini.
const DB = "perfume-studio";
let dbp = null;
function db() {
  dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("projects", { keyPath: "id" });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
const tx = async (mode, fn) => {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction("projects", mode);
    const out = fn(t.objectStore("projects"));
    t.oncomplete = () => res(out?.result ?? out);
    t.onerror = () => rej(t.error);
  });
};
export const saveProject = (p) => tx("readwrite", (s) => s.put({ ...p, updated_at: new Date().toISOString() }));
export const getProject = (id) => tx("readonly", (s) => s.get(id));
export const listProjects = async () => (await tx("readonly", (s) => s.getAll())).sort((a, b) => b.created_at.localeCompare(a.created_at));
export const deleteProject = (id) => tx("readwrite", (s) => s.delete(id));

export const settings = {
  get: () => ({ key: "", model: "gemini-flash-latest", ...JSON.parse(localStorage.getItem("settings") || "{}") }),
  set: (v) => localStorage.setItem("settings", JSON.stringify(v)),
};
export const fingerprints = {
  all: () => JSON.parse(localStorage.getItem("fingerprints") || "[]"),
  put: (id, fp) => { const all = fingerprints.all().filter((x) => x.id !== id); all.push({ id, ...fp }); localStorage.setItem("fingerprints", JSON.stringify(all.slice(-40))); },
};
export const brandStore = {
  get: () => localStorage.getItem("brand_md"),
  set: (md) => localStorage.setItem("brand_md", md),
  clear: () => localStorage.removeItem("brand_md"),
};
