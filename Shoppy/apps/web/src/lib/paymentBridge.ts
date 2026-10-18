import { createClient } from "@supabase/supabase-js";

/**
 * Puente de pagos web (puerto del bridge del admin).
 * Lee la fila `payments` por `return_token` con la service key (solo servidor).
 */
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

function isMobileUa(ua: string): boolean {
  return /android|iphone|ipad|ipod|mobile/i.test(ua);
}

/**
 * HTML del retorno: en móvil abre la app (deep link shopy://),
 * en escritorio vuelve a la web (/checkout-return). El retorno no cambia
 * el pedido: la tienda verifica con el backend autenticado.
 */
export function bridgeReturnHtml(
  state: string,
  webOrigin: string,
  ua: string,
): Response {
  // A public HTTPS tunnel and localhost do not share the pending checkout storage.
  // An explicit sandbox-only origin brings the same browser back to its local cart.
  const sandboxOrigin = process.env.PAYMENT_SANDBOX_RETURN_ORIGIN;
  if (sandboxOrigin) {
    if (process.env.PAYMENT_MODE !== "sandbox") throw new Error("Retorno local solo permitido en sandbox");
    const destination = new URL(sandboxOrigin);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(destination.hostname);
    if (destination.username || destination.password || destination.search || destination.hash
      || destination.pathname !== "/" || (destination.protocol !== "https:" && !(destination.protocol === "http:" && loopback))) {
      throw new Error("Origen de retorno sandbox inválido");
    }
    webOrigin = destination.origin;
  }
  const appTarget = `shopy://checkout-return?state=${encodeURIComponent(state)}`;
  const webTarget = `${webOrigin}/checkout-return?state=${encodeURIComponent(state)}`;
  const target = !sandboxOrigin && isMobileUa(ua) ? appTarget : webTarget;
  return bridgeHtml(
    `<p>Vuelve a vinta.zhe para verificar el resultado con el proveedor.</p>` +
      `<p><a href="${escapeHtml(webTarget)}">Continuar en la web</a> · <a href="${escapeHtml(appTarget)}">Abrir la app</a></p>` +
      `<p>Si nada se abre, entra a vinta.zhe, abre Checkout y pulsa Verificar pago.</p>`,
    `window.location.href=${JSON.stringify(target)};`,
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
