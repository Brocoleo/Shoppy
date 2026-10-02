/**
 * Tests Fase 8 (sin credenciales reales, sin red salvo imports cacheados).
 * Correr: deno test --allow-env --allow-net supabase/functions/_shared/payment_test.ts
 */
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  MockPaymentProvider,
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
    assert(msg.includes("TRANSBANK"), `debe exigir credenciales LIVE, fue: ${msg}`);
  } finally {
    Deno.env.delete("TRANSBANK_ENVIRONMENT");
  }
});
