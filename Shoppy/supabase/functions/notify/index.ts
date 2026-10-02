/**
 * notify — Edge Function (Fase 9).
 * POST { order_id, event } con JWT de admin → envía el email transaccional
 * correspondiente (idempotente por order_notifications).
 * El checkout llama al helper directamente (sin HTTP) para
 * order_created / payment_confirmed.
 */
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.2";
import { isOrderEmailEvent, sendOrderEmail } from "../_shared/notify.ts";
import { rateLimit } from "../_shared/ratelimit.ts";

function svc() {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY") ?? "";
  if (!url || !key) throw new Error("faltan SUPABASE_URL / service key");
  return createClient(url, key, { auth: { persistSession: false } });
}

serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json({ error: { code: "METHOD", message: "Solo POST." } }, { status: 405 });
  }
  let body: { order_id?: unknown; event?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: { code: "VALIDATION", message: "JSON inválido." } }, { status: 400 });
  }
  if (typeof body.order_id !== "string" || !isOrderEmailEvent(body.event)) {
    return Response.json({ error: { code: "VALIDATION", message: "order_id y event válidos requeridos." } }, { status: 400 });
  }
  const limited = rateLimit(req, { bucket: "notify", max: 60 });
  if (limited) return limited;
  try {
    const db = svc();
    // Solo administradores (o service_role interno).
    const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!jwt) {
      return Response.json({ error: { code: "UNAUTH", message: "Requiere sesión admin." } }, { status: 401 });
    }
    const { data: { user } } = await db.auth.getUser(jwt);
    if (!user) {
      return Response.json({ error: { code: "UNAUTH", message: "Sesión inválida." } }, { status: 401 });
    }
    const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if ((profile as { role: string } | null)?.role !== "admin") {
      return Response.json({ error: { code: "FORBIDDEN", message: "Solo administradores." } }, { status: 403 });
    }
    const result = await sendOrderEmail(db, body.order_id, body.event);
    return Response.json(result, { status: 200 });
  } catch (e) {
    console.error("notify error:", e);
    return Response.json({ error: { code: "INTERNAL", message: "Error interno." } }, { status: 500 });
  }
});
