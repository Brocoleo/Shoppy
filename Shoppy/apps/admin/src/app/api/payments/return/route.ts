import { bridgeHtml, bridgePayment, escapeHtml } from "../../../../lib/paymentBridge";

async function handle(request: Request) {
  try {
    const url = new URL(request.url);
    const state = url.searchParams.get("state");
    const payment = await bridgePayment(state);
    const params = request.method === "POST" ? await request.formData() : url.searchParams;
    const token = params.get("token_ws") ?? params.get("TBK_TOKEN");
    if (payment.provider === "transbank" && token && `tbk_${token}` !== payment.provider_payment_id) throw new Error("Retorno inválido");
    const target = `shopy://checkout-return?state=${encodeURIComponent(state!)}`;
    // El retorno no cambia el pedido: la app verifica con el backend autenticado.
    return bridgeHtml(`<p>Vuelve a la app para verificar el resultado con el proveedor.</p><a href="${escapeHtml(target)}">Abrir Shopy</a><p>Si no se abre, entra a Shopy, abre Checkout y pulsa Verificar pago.</p>`, `window.location.href=${JSON.stringify(target)};`);
  } catch {
    return bridgeHtml("<p>Retorno no reconocido. Abre Shopy y verifica tu pedido pendiente.</p>");
  }
}
export const GET = handle;
export const POST = handle;
