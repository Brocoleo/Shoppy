import { bridgeHtml, bridgePayment, bridgeReturnHtml } from "../../../../lib/paymentBridge";

async function handle(request: Request) {
  try {
    const url = new URL(request.url);
    const state = url.searchParams.get("state");
    const payment = await bridgePayment(state);
    const params = request.method === "POST" ? await request.formData() : url.searchParams;
    const token = params.get("token_ws") ?? params.get("TBK_TOKEN");
    if (payment.provider === "transbank" && token && `tbk_${token}` !== payment.provider_payment_id) throw new Error("Retorno inválido");
    return bridgeReturnHtml(state!, url.origin, request.headers.get("user-agent") ?? "");
  } catch {
    return bridgeHtml("<p>Retorno no reconocido. Abre Shopy y verifica tu pedido pendiente.</p>");
  }
}
export const GET = handle;
export const POST = handle;
