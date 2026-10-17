import assert from "node:assert/strict";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import { z } from "zod";

const product = "10000000-0000-4000-8000-000000000001";
const rate = "20000000-0000-4000-8000-000000000001";
const source = readFileSync(new URL("../functions/checkout/index.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
function fixture({ failProvider = false, verdict = "APPROVED", webhookAmount = 1000 } = {}) {
  const rows = {
    products: [{ id: product, slug: "prenda", name: "Prenda", price_clp: 1000, stock: 1, availability: "AVAILABLE", published_at: "2026-01-01", condition: "bueno" }],
    shipping_rates: [{ id: rate, region: "Metropolitana", price_clp: 0, is_active: true }],
    checkout_attempts: [], orders: [], order_items: [], payments: [], product_images: [], brands: [], addresses: [], profiles: [],
  };
  let createCalls = 0;
  const db = {
    auth: { getUser: async (token) => ({ data: { user: token === "valid" ? { id: "account" } : null } }) },
    from(table) {
      let filters = []; let operation = "select"; let payload;
      const execute = () => {
        const selected = rows[table].filter((row) => filters.every((fn) => fn(row)));
        if (operation === "insert") {
          if (table === "checkout_attempts" && rows[table].some((row) => row.id === payload.id)) return { data: null, error: { code: "23505" } };
          const inserted = (Array.isArray(payload) ? payload : [payload]).map((row) => ({ id: randomUUID(), ...row }));
          rows[table].push(...inserted); return { data: inserted, error: null };
        }
        if (operation === "update") selected.forEach((row) => Object.assign(row, payload));
        return { data: selected, error: null };
      };
      const query = {
        select() { return query; }, insert(value) { operation = "insert"; payload = value; return query; },
        update(value) { operation = "update"; payload = value; return query; },
        eq(key, value) { filters.push((row) => row[key] === value); return query; },
        is(key, value) { filters.push((row) => (row[key] ?? null) === value); return query; },
        in(key, values) { filters.push((row) => values.includes(row[key])); return query; },
        order() { return query; }, limit() { return query; },
        async single() { const result = execute(); return { ...result, data: result.data?.[0] ?? null }; },
        async maybeSingle() { return query.single(); },
        then(resolve, reject) { return Promise.resolve(execute()).then(resolve, reject); },
      }; return query;
    },
    async rpc(name, input) {
      if (name === "create_checkout_order") {
        const order = { id: randomUUID(), order_number: "SHO-TEST", guest_token: input.p_guest_token, user_id: input.p_user, total_clp: input.p_quote.total_clp, status: "PENDING_PAYMENT" };
        rows.orders.push(order); rows.checkout_attempts.find((a) => a.id === input.p_attempt).order_id = order.id;
        return { data: order, error: null };
      }
      if (name === "settle_checkout_payment") {
        rows.payments.find((p) => p.id === input.p_payment).status = "approved";
        return { data: "PAID", error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
  };
  let handler;
  const provider = {
    name: "mock",
    async createPayment() { createCalls++; if (failProvider) throw new Error("Lost response"); return { providerPaymentId: "mock-payment", status: "PENDING", checkoutUrl: null }; },
    async verifyPayment() { return verdict; },
    async handleWebhook() { return { orderId: rows.orders[0]?.id, status: "APPROVED", amountClp: webhookAmount, currency: "CLP", providerPaymentId: "123" }; },
  };
  const modules = {
    "https://deno.land/std@0.208.0/http/server.ts": { serve: (fn) => { handler = fn; } },
    "node:crypto": { timingSafeEqual },
    "https://esm.sh/@supabase/supabase-js@2.117.2": { createClient: () => db },
    "npm:zod": { z },
    "../_shared/payment.ts": { getPaymentProvider: () => provider, enabledPaymentProviders: () => ["mock"], sandboxOnly: () => true },
    "../_shared/notify.ts": { sendOrderEmail: async () => ({ sent: true }) },
    "../_shared/ratelimit.ts": { rateLimit: () => null },
  };
  new Function("require", "exports", "Deno", outputText)((id) => { if (!modules[id]) throw new Error(id); return modules[id]; }, {}, { env: { get: (key) => ({ SUPABASE_URL: "https://example.test", SUPABASE_SECRET_KEY: "test" })[key] } });
  return { rows, get createCalls() { return createCalls; }, async call(body, token) { return handler(new Request("https://example.test/functions/v1/checkout", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) })); } };
}
function input() { return { action: "create", items: [{ product_id: product, qty: 1 }], shipping_rate_id: rate, address: { fullName: "Test User", email: "test@example.test", phone: "+56911111111", street: "Calle 123", comuna: "Santiago", region: "Metropolitana" }, idempotency_key: randomUUID(), attempt_secret: randomUUID() }; }

test("dos solicitudes simultáneas crean un solo pedido y un solo pago", async () => {
  const f = fixture(); const request = input();
  const results = await Promise.all([f.call(request), f.call(request)]);
  assert.equal(f.rows.orders.length, 1); assert.equal(f.createCalls, 1);
  assert.ok(results.some((r) => r.status === 200));
  const replay = await f.call(request);
  assert.equal(replay.status, 200); assert.equal(f.createCalls, 1);
});
test("recuperación exige secreto y cuenta; un cambio de payload no crea otro pedido", async () => {
  const f = fixture(); const request = input(); await f.call(request);
  assert.equal((await f.call({ ...request, items: [{ product_id: product, qty: 2 }] })).status, 409);
  assert.equal((await f.call({ action: "recover", idempotency_key: request.idempotency_key, attempt_secret: randomUUID() })).status, 403);
  assert.equal((await f.call({ action: "recover", idempotency_key: request.idempotency_key, attempt_secret: request.attempt_secret }, "valid")).status, 403);
  assert.equal((await f.call({ action: "recover", idempotency_key: request.idempotency_key, attempt_secret: request.attempt_secret })).status, 200);
});
test("respuesta desconocida del proveedor conserva pedido sin repetir llamada", async () => {
  const f = fixture({ failProvider: true }); const request = input();
  assert.equal((await f.call(request)).status, 409);
  assert.equal((await f.call(request)).status, 409);
  assert.equal(f.createCalls, 1); assert.equal(f.rows.orders.length, 1);
  assert.equal(f.rows.checkout_attempts[0].state, "review");
});
test("JWT inválido nunca degrada compra a invitado", async () => {
  const f = fixture();
  assert.equal((await f.call(input(), "expired")).status, 401);
  assert.equal(f.rows.orders.length, 0);
});
test("pago pendiente no se marca rechazado y confirmar exige propiedad", async () => {
  const f = fixture({ verdict: "PENDING" }); const created = await (await f.call(input())).json();
  assert.equal((await f.call({ action: "confirm", order_id: created.order_id, guest_token: "wrong" })).status, 403);
  const pending = await f.call({ action: "confirm", order_id: created.order_id, guest_token: created.guest_token });
  assert.equal((await pending.json()).error.code, "PAYMENT_PENDING");
  assert.equal(f.rows.payments[0].status, "pending");
});
test("webhook con monto distinto no confirma el pedido", async () => {
  const f = fixture({ webhookAmount: 999 }); await f.call(input());
  assert.equal((await f.call({ action: "webhook" })).status, 400);
  assert.equal(f.rows.payments[0].status, "pending");
});
