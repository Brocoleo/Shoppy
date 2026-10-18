/** Actual provider module, with all HTTP and environment isolated per fixture. */
import assert from "node:assert/strict";
import { timingSafeEqual, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../functions/_shared/payment.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const reference = "10000000-0000-4000-8000-000000000001";
const basePayment = { id: 123, status: "approved", transaction_amount: 1000, currency_id: "CLP", external_reference: reference, live_mode: false };
function fixture({ mode = "sandbox", payment = basePayment, results, httpStatus = 200, seller = { id: 111, tags: ["test_user"], site_id: "MLC" }, preference = { id: "local-pref", sandbox_init_point: "https://sandbox.mercadopago.cl/checkout/local", init_point: "https://www.mercadopago.cl/checkout/local" } } = {}) {
  const calls = [];
  const env = { PAYMENT_MODE: mode, MERCADOPAGO_ACCESS_TOKEN: "local-test-token", MERCADOPAGO_WEBHOOK_SECRET: "local-test-secret" };
  const exports = {};
  const fetch = async (url, init) => {
    calls.push({ url: String(url), method: init?.method ?? "GET", body: init?.body ? JSON.parse(init.body) : null });
    if (String(url).endsWith("/users/me")) return Response.json(seller, { status: httpStatus });
    if (String(url).endsWith("/checkout/preferences")) return Response.json(preference);
    return Response.json(String(url).includes("/search?") ? { results: results ?? [payment] } : payment, { status: httpStatus });
  };
  new Function("require", "exports", "Deno", "fetch", compiled)((name) => {
    assert.equal(name, "node:crypto"); return { timingSafeEqual };
  }, exports, { env: { get: (key) => env[key] } }, fetch);
  return { ...exports, calls, env };
}
function notification({ id = "123", secret = "local-test-secret", signature } = {}) {
  const manifest = `id:${id};request-id:test-request;ts:1700000000;`;
  return { headers: { "x-signature": signature ?? `ts=1700000000,v1=${createHmac("sha256", secret).update(manifest).digest("hex")}`, "x-request-id": "test-request" }, query: { type: "payment", "data.id": id }, body: { status: "approved", transaction_amount: 1, external_reference: "attacker" } };
}

test("MP consulta al proveedor y valida importe, moneda, referencia y entorno", async () => {
  const f = fixture();
  assert.equal(await new f.MercadoPagoProvider().verifyPayment("mp_pref_test", 1000, reference), "APPROVED");
  assert.equal(f.calls.length, 1);
  for (const patch of [{ transaction_amount: 999 }, { currency_id: "USD" }, { external_reference: "other" }, { live_mode: true }]) {
    const bad = fixture({ payment: { ...basePayment, ...patch } });
    assert.equal(await new bad.MercadoPagoProvider().verifyPayment("mp_pref_test", 1000, reference), "PENDING");
  }
});
test("MP distingue pendiente, rechazado y cancelado sin acreditar retorno", async () => {
  for (const [status, expected] of [["pending", "PENDING"], ["in_process", "PENDING"], ["rejected", "REJECTED"], ["cancelled", "REJECTED"]]) {
    const f = fixture({ payment: { ...basePayment, status } });
    assert.equal(await new f.MercadoPagoProvider().verifyPayment("mp_pref_test", 1000, reference), expected);
  }
  const f = fixture({ results: [{ ...basePayment, status: "pending" }, { ...basePayment, status: "rejected" }] });
  assert.equal(await new f.MercadoPagoProvider().verifyPayment("mp_pref_test", 1000, reference), "PENDING");
});
test("MP webhook verifica firma antes de consultar; no confía en datos del body", async () => {
  const f = fixture(); const provider = new f.MercadoPagoProvider();
  const verified = await provider.handleWebhook(notification());
  assert.equal(verified.orderId, reference); assert.equal(verified.amountClp, 1000); assert.equal(verified.currency, "CLP");
  assert.equal(f.calls.length, 1);
  for (const value of [notification({ signature: "ts=1700000000,v1=00" }), notification({ secret: "other" }), { ...notification(), headers: {} }]) {
    await assert.rejects(provider.handleWebhook(value), /firma inválida/);
  }
  assert.equal(f.calls.length, 1);
});
test("MP webhook exige que el pago consultado corresponda al identificador firmado", async () => {
  const f = fixture({ payment: { ...basePayment, id: 999 } });
  await assert.rejects(new f.MercadoPagoProvider().handleWebhook(notification()), /identificador/);
});
test("modo live rechaza pagos sandbox y proveedor mock", async () => {
  const f = fixture({ mode: "live" });
  assert.equal(await new f.MercadoPagoProvider().verifyPayment("mp_pref_test", 1000, reference), "PENDING");
  await assert.rejects(new f.MercadoPagoProvider().handleWebhook(notification()), /Modo/);
  assert.throws(() => f.enabledPaymentProviders(), /mock/);
  assert.throws(() => f.getPaymentProvider("mock"), /mock/);
  const valid = fixture({ mode: "live", payment: { ...basePayment, live_mode: true } });
  assert.equal(await new valid.MercadoPagoProvider().verifyPayment("mp_pref_test", 1000, reference), "APPROVED");
});
test("sandbox rechaza notificaciones de pagos live", async () => {
  const f = fixture({ payment: { ...basePayment, live_mode: true } });
  await assert.rejects(new f.MercadoPagoProvider().handleWebhook(notification()), /Modo/);
});
test("fallo HTTP del proveedor no acredita un pago", async () => {
  const f = fixture({ httpStatus: 503 });
  await assert.rejects(new f.MercadoPagoProvider().verifyPayment("mp_pref_test", 1000, reference), /HTTP 503/);
});
test("Transbank valida monto y sesión; repetición no repite commit", async () => {
  const exports = {}; let committed = false; let commits = 0;
  new Function("require", "exports", "Deno", "fetch", compiled)(() => ({ timingSafeEqual }), exports, { env: { get: () => undefined } }, async (_url, init) => {
    if (init?.method === "PUT") { committed = true; commits++; }
    return Response.json({ status: committed ? "AUTHORIZED" : "INITIALIZED", response_code: 0, amount: 1000, session_id: reference });
  });
  const provider = new exports.TransbankProvider();
  assert.equal(await provider.verifyPayment("tbk_test", 1000, reference), "APPROVED");
  assert.equal(await provider.verifyPayment("tbk_test", 1000, reference), "APPROVED");
  assert.equal(commits, 1);
  assert.equal(await provider.verifyPayment("tbk_test", 999, reference), "REJECTED");
  assert.equal(await provider.verifyPayment("tbk_test", 1000, "other"), "REJECTED");
});

test("preferencia sandbox usa comprador test y no anuncia un webhook sin firma", async () => {
  const f = fixture(); f.env.MERCADOPAGO_TEST_BUYER_EMAIL = "buyer@testuser.example"; delete f.env.MERCADOPAGO_WEBHOOK_SECRET;
  const result = await new f.MercadoPagoProvider().createPayment({ orderId: reference, orderNumber: "LOCAL", amountClp: 1000, email: "customer@example.test", returnUrl: "https://bridge.example.test/return", webhookUrl: "https://backend.example.test/webhook" }, "local-key");
  assert.equal(result.checkoutUrl, "https://www.mercadopago.cl/checkout/local");
  assert.deepEqual(f.calls[0].body.payer, { email: "buyer@testuser.example" });
  assert.equal(f.calls[0].body.notification_url, undefined);
  assert.equal(f.calls[0].body.external_reference, reference);
});
test("preferencia rechaza respuesta sin init_point aunque exista URL sandbox antigua", async () => {
  const f = fixture({ preference: { id: "local-pref", sandbox_init_point: "https://sandbox.mercadopago.cl/checkout/local" } });
  await assert.rejects(new f.MercadoPagoProvider().createPayment({ orderId: reference, orderNumber: "LOCAL", amountClp: 1000 }, "local"), /preferencia válida/);
});
test("live nunca usa comprador test y exige secreto de firma antes de crear preferencia", async () => {
  const f = fixture({ mode: "live" }); f.env.MERCADOPAGO_TEST_BUYER_EMAIL = "buyer@testuser.example";
  await new f.MercadoPagoProvider().createPayment({ orderId: reference, orderNumber: "LOCAL", amountClp: 1000, email: "customer@example.test" }, "local");
  assert.deepEqual(f.calls[0].body.payer, { email: "customer@example.test" });
  delete f.env.MERCADOPAGO_WEBHOOK_SECRET;
  await assert.rejects(new f.MercadoPagoProvider().createPayment({ orderId: reference, orderNumber: "LOCAL", amountClp: 1000 }, "local"), /WEBHOOK_SECRET/);
  assert.equal(f.calls.length, 1);
});

function enableTestUsers(f) {
  f.env.MERCADOPAGO_TEST_USER_FLOW = "true";
  f.env.MERCADOPAGO_TEST_BUYER_ID = "222";
  return f;
}
const testUserPayment = { ...basePayment, live_mode: true, collector_id: 111, payer: { id: 222 } };

test("flujo explícito test acepta el pago solo con vendedor verificado y comprador fijado", async () => {
  const f = enableTestUsers(fixture({ payment: testUserPayment }));
  const p = new f.MercadoPagoProvider();
  assert.equal(await p.verifyPayment("mp_pref_test", 1000, reference), "APPROVED");
  assert.equal(await p.verifyPayment("mp_pref_test", 999, reference), "PENDING");
  assert.equal(await p.verifyPayment("mp_pref_test", 1000, "otra-referencia"), "PENDING");
  assert.equal((await p.handleWebhook(notification())).status, "APPROVED");
});

test("flujo test no acepta otro vendedor, comprador, moneda ni entorno ausente", async () => {
  for (const patch of [
    { collector_id: 333 }, { payer: { id: 333 } }, { payer: null },
    { currency_id: "USD" }, { live_mode: undefined },
  ]) {
    const f = enableTestUsers(fixture({ payment: { ...testUserPayment, ...patch } }));
    assert.equal(await new f.MercadoPagoProvider().verifyPayment("mp_pref_test", 1000, reference), "PENDING");
  }
});

test("flujo test rechaza credenciales reales o de otro país antes de crear preferencia", async () => {
  for (const seller of [
    { id: 111, tags: [], site_id: "MLC" },
    { id: 111, tags: ["test_user"], site_id: "MLA" },
    { id: 222, tags: ["test_user"], site_id: "MLC" },
  ]) {
    const f = enableTestUsers(fixture({ seller }));
    await assert.rejects(new f.MercadoPagoProvider().createPayment({ orderId: reference, orderNumber: "LOCAL", amountClp: 1000 }, "local"), /vendedor de prueba/);
    assert.equal(f.calls.some(c => c.method === "POST"), false);
  }
});

test("flujo test falla cerrado sin comprador o con fallo al verificar vendedor", async () => {
  const f = enableTestUsers(fixture()); delete f.env.MERCADOPAGO_TEST_BUYER_ID;
  await assert.rejects(new f.MercadoPagoProvider().verifyPayment("mp_pref_test", 1000, reference), /comprador de prueba/);
  assert.equal(f.calls.length, 0);
  const unavailable = enableTestUsers(fixture({ httpStatus: 503 }));
  await assert.rejects(new unavailable.MercadoPagoProvider().verifyPayment("mp_pref_test", 1000, reference), /HTTP 503/);
});

test("flujo test no se activa implícitamente ni puede habilitarse en modo live", async () => {
  const normal = fixture({ payment: testUserPayment });
  assert.equal(await new normal.MercadoPagoProvider().verifyPayment("mp_pref_test", 1000, reference), "PENDING");
  const live = enableTestUsers(fixture({ mode: "live", payment: testUserPayment }));
  await assert.rejects(new live.MercadoPagoProvider().verifyPayment("mp_pref_test", 1000, reference), /no permitido en modo live/);
  assert.equal(live.calls.length, 0);
});

test("flujo test conserva firma e identidades en webhook", async () => {
  const f = enableTestUsers(fixture({ payment: { ...testUserPayment, payer: { id: 333 } } }));
  await assert.rejects(new f.MercadoPagoProvider().handleWebhook(notification({ signature: "ts=1,v1=bad" })), /firma inválida/);
  assert.equal(f.calls.length, 0);
  await assert.rejects(new f.MercadoPagoProvider().handleWebhook(notification()), /Modo de pago/);
});
