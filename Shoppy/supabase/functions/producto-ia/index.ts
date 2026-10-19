/**
 * producto-ia — Edge Function (admin).
 * POST { image_base64, mime_type? } con JWT de admin → analiza la foto cruda
 * de una prenda con Gemini (visión) y devuelve un borrador de campos
 * (marca, tipo, categoría, color, estado, talla, descripción, tags) para
 * prellenar el formulario del producto.
 *
 * Nada se guarda aquí: solo se lee la imagen y se devuelve JSON. El admin
 * siempre revisa y corrige antes de publicar. La llave vive en secretos de
 * Supabase (GEMINI_API_KEY); el navegador nunca la ve.
 */
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.2";
import { rateLimit } from "../_shared/ratelimit.ts";

/** Modelos gratuitos de vision; se prueban en orden hasta que uno responda. */
const DEFAULT_MODELS = [
  "gemini-3.8-flash",
  "gemini-flash-latest",
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
  "gemini-2.5-flash",
];

const CONDITIONS = ["como_nuevo", "excelente", "bueno", "con_detalles"];

const PROMPT = `Eres un asistente experto en ropa de segunda mano (Chile).
Analiza la fotografía de esta prenda y devuelve SOLO un JSON válido, sin texto
adicional, con exactamente estas claves:

{
  "name": string,               // nombre comercial breve, ej. "Falda denim tiro alto"
  "brand": string|null,         // marca si se lee en etiqueta o logo; si no, null
  "category": string|null,      // categoría amplia, ej. "Mujer", "Hombre", "Niños", "Accesorios"
  "subcategory": string|null,   // ej. "Faldas", "Poleras", "Pantalones", "Vestidos", "Chaquetas"
  "segment": string|null,       // "mujer" | "hombre" | "unisex" | "niños"
  "color": string|null,         // color dominante, ej. "Azul denim medio"
  "condition": string,          // uno de: "como_nuevo" | "excelente" | "bueno" | "con_detalles"
  "size": string|null,          // talla SOLO si es legible en la etiqueta; si no, null
  "material": string|null,      // composición si es legible; si no, null
  "description": string,        // 1-3 frases reales sobre la prenda (tipo, corte, estado visible)
  "tags": string[],             // 3-6 etiquetas en minúsculas, ej. ["denim","falda","vintage"]
  "label_text": string|null,    // texto literal de la etiqueta si se lee; si no, null
  "notes": string|null          // dudas o lo que no se pudo determinar con la foto
}

Reglas:
- No inventes marca, talla ni composición: si no se ve, usa null.
- El "name" NO debe incluir la marca si ya la devuelves aparte.
- "condition" evalúa desgaste real visible (roturas, manchas, pelusas).
- Responde en español de Chile. Nada de texto fuera del JSON.`;

interface Extracted {
  name?: unknown;
  brand?: unknown;
  category?: unknown;
  subcategory?: unknown;
  segment?: unknown;
  color?: unknown;
  condition?: unknown;
  size?: unknown;
  material?: unknown;
  description?: unknown;
  tags?: unknown;
  label_text?: unknown;
  notes?: unknown;
}

function svc() {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY") ?? "";
  if (!url || !key) throw new Error("faltan SUPABASE_URL / service key");
  return createClient(url, key, { auth: { persistSession: false } });
}

function corsHeaders(req: Request): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": req.headers.get("Origin") ?? "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, apikey, Authorization, x-client-info",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

/** Acepta data URL o base64 puro. Devuelve null si no es una imagen razonable. */
function parseImage(raw: unknown, hintedMime: unknown): { data: string; mime: string } | null {
  if (typeof raw !== "string" || raw.length < 16) return null;
  let mime = typeof hintedMime === "string" && hintedMime.startsWith("image/") ? hintedMime : "image/jpeg";
  let data = raw.trim();
  const m = data.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (m) {
    mime = m[1]!.toLowerCase();
    data = m[2]!;
  }
  if (!/^[a-z0-9+/=\s]+$/i.test(data)) return null;
  data = data.replace(/\s+/g, "");
  // Gemini inline_data admite ~20MB; limitamos a 8MB de base64 (~6MB reales).
  if (data.length > 8_000_000) return null;
  return { data, mime };
}

/** JSON tolerante: recorta fences ```json y toma el primer objeto. */
function parseJson(text: string): Extracted | null {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as Extracted;
  } catch {
    return null;
  }
}

function cleanStr(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
}

/** Normaliza y acota lo que devuelve el modelo antes de exponerlo al cliente. */
function sanitize(raw: Extracted) {
  const conditionRaw = cleanStr(raw.condition, 30)?.toLowerCase().replace(/\s+/g, "_") ?? "";
  const condition = CONDITIONS.includes(conditionRaw) ? conditionRaw : "bueno";
  const tags = Array.isArray(raw.tags)
    ? [...new Set(raw.tags.map((t) => cleanStr(t, 30)?.toLowerCase()).filter((t): t is string => Boolean(t)))].slice(0, 8)
    : [];
  return {
    name: cleanStr(raw.name, 180),
    brand: cleanStr(raw.brand, 120),
    category: cleanStr(raw.category, 80),
    subcategory: cleanStr(raw.subcategory, 80),
    segment: cleanStr(raw.segment, 40),
    color: cleanStr(raw.color, 60),
    condition,
    size: cleanStr(raw.size, 20),
    material: cleanStr(raw.material, 120),
    description: cleanStr(raw.description, 1200),
    tags,
    labelText: cleanStr(raw.label_text, 300),
    notes: cleanStr(raw.notes, 400),
  };
}

async function callGemini(
  model: string,
  apiKey: string,
  image: { data: string; mime: string },
): Promise<{ ok: true; text: string } | { ok: false; status: number; detail: string }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [
            { text: PROMPT },
            { inline_data: { mime_type: image.mime, data: image.data } },
          ],
        }],
        generationConfig: { responseMimeType: "application/json", maxOutputTokens: 2048 },
      }),
    });
  } catch (e) {
    return { ok: false, status: 0, detail: e instanceof Error ? e.message : "fetch failed" };
  }
  const bodyText = await res.text();
  if (!res.ok) return { ok: false, status: res.status, detail: bodyText.slice(0, 400) };
  try {
    const json = JSON.parse(bodyText) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = (json.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("");
    if (!text) return { ok: false, status: 502, detail: "respuesta sin contenido" };
    return { ok: true, text };
  } catch {
    return { ok: false, status: 502, detail: "respuesta no JSON del proveedor" };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  const json = (status: number, payload: unknown) =>
    Response.json(payload, { status, headers: corsHeaders(req) });

  if (req.method !== "POST") return json(405, { error: { code: "METHOD", message: "Solo POST." } });
  const limited = rateLimit(req, { bucket: "producto-ia", max: 20 });
  if (limited) return limited;

  let body: { image_base64?: unknown; mime_type?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: { code: "VALIDATION", message: "JSON inválido." } });
  }

  try {
    const db = svc();
    const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!jwt) return json(401, { error: { code: "UNAUTH", message: "Requiere sesión admin." } });
    const { data: { user } } = await db.auth.getUser(jwt);
    if (!user) return json(401, { error: { code: "UNAUTH", message: "Sesión inválida." } });
    const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if ((profile as { role: string } | null)?.role !== "admin") {
      return json(403, { error: { code: "FORBIDDEN", message: "Solo administradores." } });
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
    if (!apiKey) {
      return json(503, {
        error: {
          code: "NOT_CONFIGURED",
          message: "Falta la llave GEMINI_API_KEY en los secretos del proyecto.",
        },
      });
    }

    const image = parseImage(body.image_base64, body.mime_type);
    if (!image) {
      return json(400, {
        error: { code: "BAD_IMAGE", message: "La imagen no es válida o supera el tamaño permitido." },
      });
    }

    const envModel = (Deno.env.get("GEMINI_MODEL") ?? "").trim();
    const models = envModel ? [envModel] : DEFAULT_MODELS;

    let last: { status: number; detail: string } | null = null;
    for (const model of models) {
      const out = await callGemini(model, apiKey, image);
      if (out.ok) {
        const parsed = parseJson(out.text);
        if (!parsed) return json(502, { error: { code: "BAD_AI_OUTPUT", message: "La IA devolvió un formato inesperado. Reintenta." } });
        return json(200, { model, fields: sanitize(parsed) });
      }
      last = { status: out.status, detail: out.detail };
      // 404 = modelo no disponible; probamos el siguiente. Otros errores cortan.
      if (out.status !== 404) break;
    }

    console.error("producto-ia gemini error:", last);
    const status = last?.status === 429 ? 429 : 502;
    return json(status, {
      error: {
        code: last?.status === 429 ? "RATE_LIMITED" : "AI_FAILED",
        message: last?.status === 429
          ? "La IA está saturada en este momento. Intenta en un minuto."
          : "La IA no pudo analizar la foto. Reintenta o completa los campos a mano.",
      },
    });
  } catch (e) {
    console.error("producto-ia error:", e);
    return json(500, { error: { code: "INTERNAL", message: "Error interno." } });
  }
});
