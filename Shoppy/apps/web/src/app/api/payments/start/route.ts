import { bridgeHtml, bridgePayment, escapeHtml } from "../../../../lib/paymentBridge";

export async function GET(request: Request) {
  try {
    const payment = await bridgePayment(new URL(request.url).searchParams.get("state"));
    if (payment.provider !== "transbank" || payment.status !== "pending" || Date.now() - Date.parse(payment.created_at) > 15 * 60_000) throw new Error("Pago no disponible");
    const url = new URL(payment.checkout_url);
    if (url.origin !== "https://webpay3gint.transbank.cl") throw new Error("Solo Webpay sandbox está habilitado");
    const token = String(payment.provider_payment_id ?? "").replace(/^tbk_/, "");
    if (!token) throw new Error("Pago aún no disponible");
    return bridgeHtml(`<p>Continuarás a Webpay de prueba. No uses una tarjeta real.</p><form id="pay" method="post" action="${escapeHtml(url.href)}"><input type="hidden" name="token_ws" value="${escapeHtml(token)}"><button type="submit">Continuar a Webpay</button></form>`, 'document.getElementById("pay").submit();', url.origin);
  } catch {
    return bridgeHtml("<p>No se puede abrir este pago. Vuelve a vinta.zhe y verifica el pedido pendiente.</p>");
  }
}
