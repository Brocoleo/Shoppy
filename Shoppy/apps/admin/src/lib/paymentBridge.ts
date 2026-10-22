// `server-only` convierte este módulo en un error de build si algún componente
// de cliente llega a importarlo: aquí vive la service key y jamás debe entrar
// al bundle del navegador.
import "server-only";
import { createClient } from "@supabase/supabase-js";

export async function bridgePayment(state: string | null) {
  if (!state || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(state))
    throw new Error("Enlace inválido");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Puente de pagos no configurado");
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await db
    .from("payments")
    .select("provider,provider_payment_id,checkout_url,status,created_at")
    .eq("return_token", state)
    .maybeSingle();
  if (error || !data) throw new Error("Enlace inválido");
  return data;
}

export function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}

export function bridgeHtml(body: string, script = "", formOrigin = "'none'") {
  const nonce = crypto.randomUUID();
  return new Response(
    `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>vinta.zhe · Pago de prueba</title><body><h1>vinta.zhe · Beta</h1>${body}${script ? `<script nonce="${nonce}">${script}</script>` : ""}</body></html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; form-action ${formOrigin}; base-uri 'none'; frame-ancestors 'none'`,
      },
    },
  );
}
