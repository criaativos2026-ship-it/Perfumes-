// Cliente da API Gemini (Google AI Studio). Chamado direto do navegador com a chave do próprio usuário,
// que fica salva só no aparelho. Plano gratuito: sujeito aos limites do Google.
const BASE = "https://generativelanguage.googleapis.com/v1beta/models/";

export class AIError extends Error {
  constructor(message, retryable = true) { super(message); this.retryable = retryable; }
}

function explain(status, body) {
  const msg = body?.error?.message || "";
  if (status === 400 && /API key not valid|API_KEY_INVALID/i.test(msg)) return new AIError("Chave do Gemini inválida. Confira em Ajustes.", false);
  if (status === 403) return new AIError("A chave do Gemini não tem permissão para este modelo: " + msg, false);
  if (status === 404) return new AIError("Modelo do Gemini não encontrado. Troque o modelo em Ajustes. (" + msg + ")", false);
  if (status === 429) return new AIError("Limite gratuito do Gemini atingido. Aguarde um pouco (ou até amanhã) e tente de novo.");
  if (status >= 500) return new AIError(`O Gemini está instável (${status}). Tente novamente.`);
  return new AIError(`Erro do Gemini (${status}): ${msg}`, status >= 500);
}

export async function generate({ key, model, system, parts, schema = null, search = false, signal }) {
  if (!key) throw new AIError("Cadastre sua chave gratuita do Gemini em Ajustes.", false);
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts }],
    generationConfig: {},
  };
  if (search) body.tools = [{ googleSearch: {} }];
  if (schema) {
    body.generationConfig.responseMimeType = "application/json";
    body.generationConfig.responseJsonSchema = schema;
  }
  let res;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      res = await fetch(`${BASE}${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
        signal,
      });
    } catch (e) {
      if (e.name === "AbortError") throw e;
      if (attempt === 2) throw new AIError("Sem conexão com o Gemini. Verifique a internet.");
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    if (res.ok || ![500, 502, 503, 504].includes(res.status) || attempt === 2) break;
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw explain(res.status, data);
  if (data.promptFeedback?.blockReason) throw new AIError("O Gemini bloqueou o pedido (" + data.promptFeedback.blockReason + ").", false);
  const cand = data.candidates?.[0];
  if (!cand) throw new AIError("O Gemini não devolveu resposta.");
  if (["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "RECITATION"].includes(cand.finishReason)) throw new AIError("O Gemini interrompeu a resposta (" + cand.finishReason + ").");
  if (cand.finishReason === "MAX_TOKENS") throw new AIError("A resposta do Gemini foi cortada por tamanho. Tente novamente.");
  const text = (cand.content?.parts || []).filter((p) => p.text && !p.thought).map((p) => p.text).join("");
  let json = null;
  if (schema) {
    try { json = JSON.parse(text); } catch { throw new AIError("O Gemini devolveu dados fora do formato esperado. Tente novamente."); }
  }
  const chunks = (cand.groundingMetadata?.groundingChunks || []).map((c) => c.web).filter(Boolean);
  return { text, json, grounding: chunks, queries: cand.groundingMetadata?.webSearchQueries || [] };
}

export async function imagePart(blob, maxSide = 1536) {
  const bmp = await createImageBitmap(blob);
  const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = new OffscreenCanvas(Math.round(bmp.width * s), Math.round(bmp.height * s));
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  const out = await c.convertToBlob({ type: "image/jpeg", quality: 0.92 });
  const b64 = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(",")[1]); fr.readAsDataURL(out); });
  return { inlineData: { mimeType: "image/jpeg", data: b64 } };
}
