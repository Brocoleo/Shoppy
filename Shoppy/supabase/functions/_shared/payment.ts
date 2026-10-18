/**
 * PaymentProvider desacoplado (Fase 8).
 * - mock: default, sin cargos, stateless.
 * - mercadopago: Checkout Pro (preferences + webhook HMAC + verify por
 *   external_reference). Requiere MERCADOPAGO_ACCESS_TOKEN; webhook con
 *   MERCADOPAGO_WEBHOOK_SECRET. Ver docs/PAYMENTS.md.
 * - transbank: Webpay Plus REST (create + commit vía verify + refund).
 *   TEST usa los códigos públicos de integración de Transbank SOLO si no hay
 *   env (ver docs); LIVE exige TRANSBANK_COMMERCE_CODE + TRANSBANK_API_KEY_SECRET.
 *
 * Idempotencia real en DB (payments.idempotency_key). Nunca hardcodear
 * secretos productivos.
 */
import { timingSafeEqual } from "node:crypto";

export function enabledPaymentProviders(): string[] {
  const names = (Deno.env.get("PAYMENT_PROVIDERS") ?? Deno.env.get("PAYMENT_PROVIDER") ?? "mock").split(",").map((v) => v.trim().toLowerCase());
  if (names.some((v) => !["mock", "mercadopago", "transbank"].includes(v))) throw new Error("PAYMENT_PROVIDERS inválido");
  if (!sandboxOnly() && names.includes("mock")) throw new Error("mock no permitido en modo live");
  return [...new Set(names)];
}

export function sandboxOnly(): boolean { return (Deno.env.get("PAYMENT_MODE") ?? "sandbox") !== "live"; }

export type PaymentStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface CreatePaymentInput {
  orderId: string;
  orderNumber: string;
  amountClp: number;
  /** URL de retorno tras pagar en el proveedor (deep link shopy://…). */
  returnUrl?: string;
  /** URL pública del webhook (solo MP). */
  webhookUrl?: string;
  email?: string;
}

export interface PaymentResult {
  providerPaymentId: string;
  checkoutUrl: string | null;
  status: PaymentStatus;
}

export interface WebhookInput {
  headers: Record<string, string | undefined>;
  query: Record<string, string | undefined>;
  body: unknown;
}

export interface PaymentProvider {
  readonly name: "mock" | "mercadopago" | "transbank";
  createPayment(input: CreatePaymentInput, idempotencyKey: string): Promise<PaymentResult>;
  /**
   * Verifica/finaliza el pago. Para Transbank ejecuta el COMMIT con el token
   * de retorno; para MP busca el pago aprobado por external_reference.
   */
  verifyPayment(providerPaymentId: string, expectedAmountClp: number, orderId?: string): Promise<PaymentStatus>;
  refundPayment(providerPaymentId: string, amountClp?: number, orderId?: string): Promise<void>;
  handleWebhook(input: WebhookInput): Promise<{ orderId: string; status: PaymentStatus; amountClp?: number; currency?: string; providerPaymentId?: string }>;
}

// ---------------------------------------------------------------- mock ---
export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock" as const;

  async createPayment(input: CreatePaymentInput, idempotencyKey: string): Promise<PaymentResult> {
    if (input.amountClp <= 0) {
      return { providerPaymentId: `mock_${idempotencyKey}`, checkoutUrl: null, status: "REJECTED" };
    }
    return { providerPaymentId: `mock_${idempotencyKey}`, checkoutUrl: null, status: "PENDING" };
  }

  async verifyPayment(providerPaymentId: string, expectedAmountClp: number): Promise<PaymentStatus> {
    if (!providerPaymentId.startsWith("mock_") || expectedAmountClp <= 0) return "REJECTED";
    return "APPROVED";
  }

  async refundPayment(): Promise<void> {
    // Mock sin estado: el reembolso real se implementa con cada proveedor.
  }

  async handleWebhook(): Promise<{ orderId: string; status: PaymentStatus; amountClp?: number; currency?: string; providerPaymentId?: string }> {
    throw new Error("mock provider has no webhook; use confirm action");
  }
}

// ------------------------------------------------------- mercadopago ---
const MP_API = "https://api.mercadopago.com";

function mpAuth(): { accessToken: string; webhookSecret: string } {
  const accessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") ?? "";
  const webhookSecret = Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET") ?? "";
  if (!accessToken) throw new Error("falta MERCADOPAGO_ACCESS_TOKEN");
  return { accessToken, webhookSecret };
}

type MercadoPagoTestIdentity = { sellerId: string; buyerId: string };

/** Test-user credentials use the regular API and may return live_mode=true.
 * This explicit flow requires a server-verified test seller and a pinned buyer;
 * it never treats the browser return or the live_mode flag as proof of payment.
 */
async function mpTestIdentity(accessToken: string): Promise<MercadoPagoTestIdentity | null> {
  if (Deno.env.get("MERCADOPAGO_TEST_USER_FLOW") !== "true") return null;
  if (!sandboxOnly()) throw new Error("Flujo de usuarios test no permitido en modo live");
  const buyerId = Deno.env.get("MERCADOPAGO_TEST_BUYER_ID") ?? "";
  if (!/^\d+$/.test(buyerId)) throw new Error("Falta comprador de prueba configurado");
  const seller = await mpFetch(accessToken, "/users/me");
  const tags = seller["tags"];
  const sellerId = String(seller["id"] ?? "");
  if (!Array.isArray(tags) || !tags.includes("test_user") || seller["site_id"] !== "MLC"
    || !/^\d+$/.test(sellerId) || sellerId === buyerId) {
    throw new Error("La credencial no pertenece a un vendedor de prueba chileno");
  }
  return { sellerId, buyerId };
}

function mpPaymentEnvironmentMatches(payment: Record<string, unknown>, identity: MercadoPagoTestIdentity | null): boolean {
  if (!identity) return payment["live_mode"] === !sandboxOnly();
  const payer = payment["payer"] as { id?: unknown } | null;
  return typeof payment["live_mode"] === "boolean"
    && String(payment["collector_id"] ?? "") === identity.sellerId
    && String(payer?.id ?? "") === identity.buyerId;
}

async function mpFetch(accessToken: string, path: string, init?: RequestInit) {
  const res = await fetch(`${MP_API}${path}`, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    throw new Error(`mercadopago HTTP ${res.status}`);
  }
  return json as Record<string, unknown>;
}

/**
 * Validación HMAC de webhooks MP (algoritmo oficial: manifest
 * `id:{dataId};request-id:{xRequestId};ts:{ts};`, HMAC-SHA256 hex con el
 * secret de la app, comparado con `v1` del header `x-signature`).
 */
export async function verifyMercadoPagoSignature(input: {
  xSignature: string | undefined;
  xRequestId: string | undefined;
  dataId: string | undefined;
  secret: string;
}): Promise<boolean> {
  const { xSignature, xRequestId, dataId, secret } = input;
  if (!xSignature || !xRequestId || !dataId || !secret) return false;
  const ts = xSignature.split(",").find((p) => p.trim().startsWith("ts="))?.split("=")[1];
  const v1 = xSignature.split(",").find((p) => p.trim().startsWith("v1="))?.split("=")[1];
  if (!ts || !v1) return false;
  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  // Comparación timing-safe (nunca ===): evita filtrar la firma por tiempo.
  const a = new TextEncoder().encode(hex);
  const b = new TextEncoder().encode(v1.toLowerCase());
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export class MercadoPagoProvider implements PaymentProvider {
  readonly name = "mercadopago" as const;

  async createPayment(input: CreatePaymentInput, _idempotencyKey: string): Promise<PaymentResult> {
    const { accessToken, webhookSecret } = mpAuth();
    await mpTestIdentity(accessToken);
    if (!sandboxOnly() && !webhookSecret) throw new Error("falta MERCADOPAGO_WEBHOOK_SECRET para modo live");
    const buyerEmail = sandboxOnly()
      ? Deno.env.get("MERCADOPAGO_TEST_BUYER_EMAIL") ?? input.email
      : input.email;
    const pref = await mpFetch(accessToken, "/checkout/preferences", {
      method: "POST",
      body: JSON.stringify({
        items: [
          {
            id: input.orderId,
            title: `Pedido ${input.orderNumber} · Shopy`,
            quantity: 1,
            currency_id: "CLP",
            unit_price: input.amountClp,
          },
        ],
        payer: buyerEmail ? { email: buyerEmail } : undefined,
        back_urls: input.returnUrl
          ? { success: input.returnUrl, pending: input.returnUrl, failure: input.returnUrl }
          : undefined,
        auto_return: input.returnUrl ? "approved" : undefined,
        notification_url: webhookSecret ? input.webhookUrl : undefined,
        external_reference: input.orderId,
      }),
    });
    const id = String(pref["id"] ?? "");
    // Test-user purchases also use init_point; the legacy sandbox URL fails.
    const url = pref["init_point"] as string | null;
    if (!id || !url) throw new Error("mercadopago no devolvió preferencia válida");
    return { providerPaymentId: `mp_pref_${id}`, checkoutUrl: url, status: "PENDING" };
  }

  async verifyPayment(providerPaymentId: string, expectedAmountClp: number, orderId?: string): Promise<PaymentStatus> {
    const { accessToken } = mpAuth();
    const testIdentity = await mpTestIdentity(accessToken);
    const ref = orderId ?? providerPaymentId;
    const search = await mpFetch(
      accessToken,
      `/v1/payments/search?external_reference=${encodeURIComponent(ref)}&sort=date_created&criteria=desc`,
    );
    const results = (search["results"] ?? []) as Record<string, unknown>[];
    const matching = results.filter(
      (p) => Number(p["transaction_amount"]) === expectedAmountClp && p["currency_id"] === "CLP" && p["external_reference"] === ref && mpPaymentEnvironmentMatches(p, testIdentity),
    );
    if (matching.some((p) => p["status"] === "approved")) return "APPROVED";
    // La búsqueda está ordenada por fecha descendente. Un intento pendiente
    // más reciente no se rechaza por un pago fallido anterior.
    return ["rejected", "cancelled", "refunded", "charged_back"].includes(String(matching[0]?.["status"])) ? "REJECTED" : "PENDING";
  }

  async refundPayment(providerPaymentId: string, amountClp?: number, orderId?: string): Promise<void> {
    const { accessToken } = mpAuth();
    let paymentId = providerPaymentId;
    if (!/^\d+$/.test(paymentId)) {
      if (!orderId || !amountClp) throw new Error("Faltan datos para recuperar el pago");
      const search = await mpFetch(accessToken, `/v1/payments/search?external_reference=${encodeURIComponent(orderId)}`);
      const payment = ((search["results"] ?? []) as Record<string, unknown>[]).find((p) => p["status"] === "approved" && p["external_reference"] === orderId && p["currency_id"] === "CLP" && Number(p["transaction_amount"]) === amountClp && p["live_mode"] === !sandboxOnly());
      if (!payment) throw new Error("Pago aprobado no encontrado");
      paymentId = String(payment["id"]);
    }
    const refund = await mpFetch(accessToken, `/v1/payments/${paymentId}/refunds`, { method: "POST", headers: { "X-Idempotency-Key": `shopy-refund-${paymentId}` }, body: "{}" });
    if (refund["status"] !== "approved") throw new Error("Reembolso Mercado Pago no confirmado");
  }

  async handleWebhook(input: WebhookInput): Promise<{ orderId: string; status: PaymentStatus; amountClp?: number; currency?: string; providerPaymentId?: string }> {
    const { webhookSecret, accessToken } = mpAuth();
    const type = input.query["type"] ?? (input.body as Record<string, unknown> | null)?.["type"];
    const dataId = input.query["data.id"] ?? String((input.body as { data?: { id?: unknown } } | null)?.data?.id ?? "");
    if (type !== "payment" || !dataId) throw new Error("webhook MP: evento no soportado");
    const ok = await verifyMercadoPagoSignature({
      xSignature: input.headers["x-signature"],
      xRequestId: input.headers["x-request-id"],
      dataId,
      secret: webhookSecret,
    });
    if (!ok) throw new Error("webhook MP: firma inválida");
    const payment = await mpFetch(accessToken, `/v1/payments/${encodeURIComponent(dataId)}`);
    const orderId = String(payment["external_reference"] ?? "");
    if (!orderId) throw new Error("webhook MP: sin external_reference");
    if (String(payment["id"]) !== dataId) throw new Error("webhook MP: identificador no coincide");
    const testIdentity = await mpTestIdentity(accessToken);
    if (!mpPaymentEnvironmentMatches(payment, testIdentity)) throw new Error("Modo de pago incompatible con el entorno");
    return { orderId, status: payment["status"] === "approved" ? "APPROVED" : "PENDING", amountClp: Number(payment["transaction_amount"]), currency: String(payment["currency_id"]), providerPaymentId: String(payment["id"]) };
  }
}

// ----------------------------------------------------------- transbank ---
const TBK_TEST = { commerceCode: "597055555532", apiKey: "579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C" };

function tbkAuth(): { commerceCode: string; apiKey: string; base: string } {
  const env = (Deno.env.get("TRANSBANK_ENVIRONMENT") ?? "TEST").toUpperCase();
  const live = env === "LIVE" || env === "PROD" || env === "PRODUCCION";
  if (live && sandboxOnly()) throw new Error("Transbank LIVE no permitido en beta");
  const commerceCode = Deno.env.get("TRANSBANK_COMMERCE_CODE") ?? (live ? "" : TBK_TEST.commerceCode);
  const apiKey = Deno.env.get("TRANSBANK_API_KEY_SECRET") ?? (live ? "" : TBK_TEST.apiKey);
  if (!commerceCode || !apiKey) throw new Error("faltan TRANSBANK_COMMERCE_CODE / TRANSBANK_API_KEY_SECRET para LIVE");
  return {
    commerceCode,
    apiKey,
    base: live ? "https://webpay3g.transbank.cl" : "https://webpay3gint.transbank.cl",
  };
}

async function tbkFetch(auth: { commerceCode: string; apiKey: string; base: string }, path: string, init?: RequestInit) {
  const res = await fetch(`${auth.base}${path}`, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(15000),
    headers: {
      "Tbk-Api-Key-Id": auth.commerceCode,
      "Tbk-Api-Key-Secret": auth.apiKey,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const json = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    throw new Error(`transbank HTTP ${res.status}`);
  }
  return json as Record<string, unknown>;
}

export class TransbankProvider implements PaymentProvider {
  readonly name = "transbank" as const;

  async createPayment(input: CreatePaymentInput, _idempotencyKey: string): Promise<PaymentResult> {
    const auth = tbkAuth();
    if (!input.returnUrl) throw new Error("transbank requiere returnUrl");
    // buy_order ≤ 26 chars (SHO-XXXXXXXX = 12), session_id ≤ 61.
    const created = await tbkFetch(auth, "/rswebpaytransaction/api/webpay/v1.2/transactions", {
      method: "POST",
      body: JSON.stringify({
        buy_order: input.orderNumber,
        session_id: input.orderId,
        amount: input.amountClp,
        return_url: input.returnUrl,
      }),
    });
    const token = String(created["token"] ?? "");
    const url = String(created["url"] ?? "");
    if (!token || !url) throw new Error("transbank no devolvió token/url");
    return { providerPaymentId: `tbk_${token}`, checkoutUrl: url, status: "PENDING" };
  }

  /** Para Webpay Plus, verificar == hacer COMMIT con el token de retorno. */
  async verifyPayment(providerPaymentId: string, expectedAmountClp: number, orderId?: string): Promise<PaymentStatus> {
    const auth = tbkAuth();
    const token = providerPaymentId.replace(/^tbk_/, "");
    if (!token) return "REJECTED";
    const path = `/rswebpaytransaction/api/webpay/v1.2/transactions/${encodeURIComponent(token)}`;
    let committed = await tbkFetch(auth, path);
    if (committed["status"] === "INITIALIZED") committed = await tbkFetch(auth, path, { method: "PUT" });
    if (Number(committed["amount"]) !== expectedAmountClp || (orderId && committed["session_id"] !== orderId)) return "REJECTED";
    if (committed["status"] === "AUTHORIZED" && Number(committed["response_code"]) === 0) return "APPROVED";
    return committed["status"] === "INITIALIZED" ? "PENDING" : "REJECTED";
  }

  async refundPayment(providerPaymentId: string, amountClp?: number): Promise<void> {
    const auth = tbkAuth();
    const token = providerPaymentId.replace(/^tbk_/, "");
    const status = await tbkFetch(auth, `/rswebpaytransaction/api/webpay/v1.2/transactions/${encodeURIComponent(token)}`);
    const buyOrder = String(status["buy_order"] ?? "");
    const authorized = Number(status["amount"] ?? amountClp ?? 0);
    if (!buyOrder || !authorized) throw new Error("transbank refund: transacción sin datos");
    const refund = await tbkFetch(auth, `/rswebpaytransaction/api/webpay/v1.2/transactions/${encodeURIComponent(token)}/refunds`, {
      method: "POST",
      body: JSON.stringify({ amount: amountClp ?? authorized }),
    });
    if (!["REVERSED", "NULLIFIED"].includes(String(refund["type"])) || (refund["response_code"] !== undefined && Number(refund["response_code"]) !== 0)) throw new Error("Reembolso Webpay no confirmado");
  }

  async handleWebhook(): Promise<{ orderId: string; status: PaymentStatus; amountClp?: number; currency?: string; providerPaymentId?: string }> {
    // Webpay Plus usa return_url + commit, no webhook.
    throw new Error("transbank usa return_url + commit; sin webhook");
  }
}

// -------------------------------------------------------------- factory ---
export function getPaymentProvider(selected?: string): PaymentProvider {
  const name = (selected ?? Deno.env.get("PAYMENT_PROVIDER") ?? "mock").toLowerCase();
  if (name === "mercadopago") return new MercadoPagoProvider();
  if (name === "transbank") return new TransbankProvider();
  if (name === "mock" && !sandboxOnly()) throw new Error("mock no permitido en modo live");
  if (name !== "mock") throw new Error(`provider ${name} desconocido (mock|mercadopago|transbank)`);
  return new MockPaymentProvider();
}
