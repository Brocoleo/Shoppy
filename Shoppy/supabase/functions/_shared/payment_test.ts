/**
 * Tests Fase 8 (sin credenciales reales, sin red salvo imports cacheados).
 * Correr: deno test --allow-env --allow-net supabase/functions/_shared/payment_test.ts
 */
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  MockPaymentProvider,
  MercadoPagoProvider,
  enabledPaymentProviders,
  TransbankProvider,
  getPaymentProvider,
  verifyMercadoPagoSignature,
} from "./payment.ts";

async function hmacHex(secret: string, manifest: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.test("mock: create/verify roundtrip", async () => {
  const p = new MockPaymentProvider();
  const created = await p.createPayment({ orderId: "o1", orderNumber: "SHO-1", amountClp: 1000 }, "o1");
  assertEquals(created.status, "PENDING");
  assertEquals(created.checkoutUrl, null);
  assertEquals(await p.verifyPayment(created.providerPaymentId, 1000), "APPROVED");
  assertEquals(await p.verifyPayment("mock_x", 0), "REJECTED");
});

Deno.test("factory: mock por defecto y selección por env", () => {
  assertEquals(getPaymentProvider().name, "mock");
  Deno.env.set("PAYMENT_PROVIDER", "transbank");
  try {
    assertEquals(getPaymentProvider().name, "transbank");
  } finally {
    Deno.env.delete("PAYMENT_PROVIDER");
  }
  Deno.env.set("PAYMENT_PROVIDER", "mercadopago");
  try {
    assertEquals(getPaymentProvider().name, "mercadopago");
  } finally {
    Deno.env.delete("PAYMENT_PROVIDER");
  }
});

Deno.test("MP: firma HMAC válida pasa, manipulada no", async () => {
  const secret = "test_secret_123";
  const dataId = "123456789";
  const xRequestId = "req-abc";
  const ts = "1704908010";
  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const v1 = await hmacHex(secret, manifest);
  const xSignature = `ts=${ts},v1=${v1}`;
  assert(
    await verifyMercadoPagoSignature({ xSignature, xRequestId, dataId, secret }),
    "firma válida debe pasar",
  );
  assertEquals(
    await verifyMercadoPagoSignature({ xSignature: `ts=${ts},v1=00${v1.slice(2)}`, xRequestId, dataId, secret }),
    false,
    "firma manipulada debe fallar",
  );
  assertEquals(
    await verifyMercadoPagoSignature({ xSignature, xRequestId, dataId, secret: "otro" }),
    false,
    "secret distinto debe fallar",
  );
  assertEquals(
    await verifyMercadoPagoSignature({ xSignature: undefined, xRequestId, dataId, secret }),
    false,
    "sin firma debe fallar",
  );
  assertEquals(
    await verifyMercadoPagoSignature({ xSignature: `ts=${ts},v1=corta`, xRequestId, dataId, secret }),
    false,
    "firma de largo distinto debe fallar sin lanzar",
  );
});

Deno.test("transbank: exige returnUrl antes de red", async () => {
  const p = new TransbankProvider();
  let msg = "";
  try {
    await p.createPayment({ orderId: "o1", orderNumber: "SHO-1", amountClp: 1000 }, "o1");
  } catch (e) {
    msg = (e as Error).message;
  }
  assert(msg.includes("returnUrl"), `debe pedir returnUrl, fue: ${msg}`);
  assertEquals(await p.verifyPayment("", 1000), "REJECTED");
});

Deno.test("transbank LIVE sin env falla explícito", async () => {
  Deno.env.set("TRANSBANK_ENVIRONMENT", "LIVE");
  try {
    const p = new TransbankProvider();
    let msg = "";
    try {
      await p.createPayment({ orderId: "o1", orderNumber: "SHO-1", amountClp: 1000, returnUrl: "shopy://x" }, "o1");
    } catch (e) {
      msg = (e as Error).message;
    }
    assert(msg.includes("no permitido en beta"), `debe exigir credenciales LIVE, fue: ${msg}`);
  } finally {
    Deno.env.delete("TRANSBANK_ENVIRONMENT");
  }
});

Deno.test("factory: proveedor guardado prevalece sobre configuración global", () => {
  Deno.env.set("PAYMENT_PROVIDER", "mock");
  Deno.env.set("PAYMENT_PROVIDERS", "mercadopago,transbank");
  try {
    assertEquals(getPaymentProvider("transbank").name, "transbank");
    assertEquals(enabledPaymentProviders(), ["mercadopago", "transbank"]);
  } finally { Deno.env.delete("PAYMENT_PROVIDER"); Deno.env.delete("PAYMENT_PROVIDERS"); }
});

Deno.test("Webpay: verificación repetida consulta estado sin repetir commit", async () => {
  const original = globalThis.fetch;
  let commits = 0;
  let authorized = false;
  globalThis.fetch = (_url, init) => {
    if (init?.method === "PUT") { commits++; authorized = true; }
    return Promise.resolve(Response.json({ status: authorized ? "AUTHORIZED" : "INITIALIZED", response_code: 0, amount: 1000, session_id: "order" }));
  };
  try {
    const provider = new TransbankProvider();
    assertEquals(await provider.verifyPayment("tbk_token", 1000, "order"), "APPROVED");
    assertEquals(await provider.verifyPayment("tbk_token", 1000, "order"), "APPROVED");
    assertEquals(commits, 1);
    assertEquals(await provider.verifyPayment("tbk_token", 2000, "order"), "REJECTED");
    assertEquals(await provider.verifyPayment("tbk_token", 1000, "other"), "REJECTED");
  } finally { globalThis.fetch = original; }
});

Deno.test("MP: solo monto, referencia, CLP y modo prueba correctos confirman", async () => {
  const original = globalThis.fetch;
  Deno.env.set("MERCADOPAGO_ACCESS_TOKEN", "test");
  let payment: Record<string, unknown> = { status: "approved", transaction_amount: 1000, currency_id: "CLP", external_reference: "order", live_mode: false };
  globalThis.fetch = () => Promise.resolve(Response.json({ results: [payment] }));
  try {
    const provider = new MercadoPagoProvider();
    assertEquals(await provider.verifyPayment("mp_pref_test", 1000, "order"), "APPROVED");
    for (const patch of [{ currency_id: "USD" }, { transaction_amount: 999 }, { external_reference: "other" }, { live_mode: true }]) {
      const old = payment; payment = { ...payment, ...patch };
      assertEquals(await provider.verifyPayment("mp_pref_test", 1000, "order"), "PENDING");
      payment = old;
    }
  } finally { globalThis.fetch = original; Deno.env.delete("MERCADOPAGO_ACCESS_TOKEN"); }
});

Deno.test("MP beta usa sandbox_init_point y webhook mantiene monto e identificador", async () => {
  const original = globalThis.fetch;
  Deno.env.set("MERCADOPAGO_ACCESS_TOKEN", "test");
  Deno.env.set("MERCADOPAGO_WEBHOOK_SECRET", "secret");
  globalThis.fetch = (url) => Promise.resolve(Response.json(String(url).includes("preferences") ? { id: "pref", init_point: "https://live.test", sandbox_init_point: "https://sandbox.test" } : { id: 123, status: "approved", external_reference: "order", transaction_amount: 1000, currency_id: "CLP", live_mode: false }));
  try {
    const provider = new MercadoPagoProvider();
    const created = await provider.createPayment({ orderId: "order", orderNumber: "SHO-test", amountClp: 1000 }, "key");
    assertEquals(created.checkoutUrl, "https://sandbox.test");
    const signature = await hmacHex("secret", "id:123;request-id:req;ts:1;");
    const event = await provider.handleWebhook({ headers: { "x-signature": `ts=1,v1=${signature}`, "x-request-id": "req" }, query: {}, body: { type: "payment", data: { id: 123 } } });
    assertEquals(event.amountClp, 1000); assertEquals(event.currency, "CLP"); assertEquals(event.providerPaymentId, "123");
  } finally { globalThis.fetch = original; Deno.env.delete("MERCADOPAGO_ACCESS_TOKEN"); Deno.env.delete("MERCADOPAGO_WEBHOOK_SECRET"); }
});
