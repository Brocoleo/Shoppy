import { randomUUID, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { z } from "zod";

export const product = "10000000-0000-4000-8000-000000000001";
export const rate = "20000000-0000-4000-8000-000000000001";
const source = readFileSync(new URL("../../functions/checkout/index.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
function loadRules(path = new URL("../../functions/_shared/checkout-rules.ts", import.meta.url)) {
  const source = readFileSync(path, "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function("require", "exports", compiled)((name) => loadRules(new URL(name, path)), exports);
  return exports;
}
export function fixture({ failProvider = false, verdict = "APPROVED", webhookAmount = 1000, webhookCurrency = "CLP", webhookStatus = "APPROVED", webhookError = false, dbError = false, settleError = false, discountAmount = 100, discountError = false, interactive = false, paymentUrl = null, refundError = false } = {}) {
  const rows = {
    products: [{ id: product, slug: "prenda", name: "Prenda", price_clp: 1000, stock: 1, availability: "AVAILABLE", published_at: "2026-01-01", condition: "bueno" }],
    shipping_rates: [{ id: rate, region: "Metropolitana", price_clp: 0, is_active: true }],
    checkout_attempts: [], orders: [], order_items: [], payments: [], product_images: [], brands: [], addresses: [], profiles: [],
    product_reservations: [], order_status_history: [], return_requests: [],
  };
  let createCalls = 0;
  let stockDeductions = 0;
  const db = {
    auth: { getUser: async (token) => ({ data: { user: token === "valid" ? { id: "account" } : null } }) },
    from(table) {
      let filters = []; let operation = "select"; let payload;
      const execute = () => {
        if (dbError && table === "products") return { data: null, error: { message: "secret connection credentials" } };
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
      if (name === "validate_discount_code" && discountError) return { data: null, error: { message: "PRIVATE_CREDENTIAL: private diagnostic" } };
      if (name === "validate_discount_code") return { data: { discount_id: "discount", amount_clp: discountAmount }, error: null };
      if (name === "create_checkout_order") {
        const order = { id: randomUUID(), order_number: "SHO-TEST", guest_token: input.p_guest_token, user_id: input.p_user, ...input.p_quote, shipping_address: input.p_input.address, created_at: new Date().toISOString(), status: "PENDING_PAYMENT" };
        // Mirrors the reservation phase only: real SQL decrements stock at
        // create, then settlement consumes reservations without a second decrement.
        // PostgreSQL locking/rollback itself is NOT exercised by this transport.
        for (const item of input.p_input.items) {
          rows.products.find((row) => row.id === item.product_id).stock -= item.qty;
          stockDeductions += item.qty;
        }
        rows.orders.push(order); rows.checkout_attempts.find((a) => a.id === input.p_attempt).order_id = order.id;
        if (interactive) {
          for (const line of input.p_quote.lines) {
            rows.order_items.push({ ...line, order_id: order.id });
            rows.product_reservations.push({ order_id: order.id, product_id: line.product_id, qty: line.qty, status: "active" });
          }
        }
        return { data: order, error: null };
      }
      if (name === "settle_checkout_payment") {
        if (settleError) return { data: null, error: { message: "private SQL details" } };
        const payment = rows.payments.find((p) => p.id === input.p_payment);
        const order = rows.orders.find((o) => o.id === payment.order_id);
        if (interactive && rows.product_reservations.some(r => r.order_id === order.id && r.status !== "active") && order.status !== "PAID") {
          payment.status = "approved";
          payment.incident = "RESERVATION_EXPIRED";
          return { data: "REFUND_REQUIRED", error: null };
        }
        if (interactive && order.status !== "PAID") {
          rows.order_status_history.push({ order_id: order.id, from_status: order.status, to_status: "PAID", created_at: new Date().toISOString() });
          rows.product_reservations.filter(r => r.order_id === order.id).forEach(r => { r.status = "consumed"; });
        }
        order.status = "PAID";
        payment.status = "approved";
        return { data: "PAID", error: null };
      }
      if (interactive && name === "close_checkout_attempt") {
        const order = rows.orders.find(o => o.id === input.p_order);
        if (!order || rows.payments.some(p => p.order_id === order.id && p.status === "approved")) return { data: false, error: null };
        const reservations = rows.product_reservations.filter(r => r.order_id === order.id);
        if (!rows.payments.some(p => p.order_id === order.id && p.status === "rejected") && reservations.some(r => r.status === "active")) return { data: false, error: null };
        for (const r of reservations.filter(r => r.status === "active")) {
          rows.products.find(p => p.id === r.product_id).stock += r.qty; r.status = "released";
        }
        order.status = "CANCELLED";
        return { data: true, error: null };
      }
      if (name === "request_return") {
        const order = rows.orders.find((o) => o.id === input.p_order);
        if (!order) return { data: null, error: { message: "ORDER_NOT_FOUND" } };
        rows.return_requests = rows.return_requests ?? [];
        rows.return_requests.push({ order_id: order.id, reason: input.p_reason, detail: input.p_detail ?? null });
        return { data: randomUUID(), error: null };
      }
      if (name === "finish_checkout_refund") {
        const payment = rows.payments.find((p) => p.id === input.p_payment);
        if (!payment) return { data: null, error: { message: "PAYMENT_NOT_FOUND" } };
        payment.status = "refunded"; payment.refund_state = "done"; payment.incident = null;
        const order = rows.orders.find((o) => o.id === payment.order_id);
        if (order) order.status = "REFUNDED";
        return { data: true, error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
  };
  let handler;
  let refundCalls = 0;
  const provider = {
    name: "mock",
    async createPayment(input) { createCalls++; if (failProvider) throw new Error("Lost response"); return { providerPaymentId: "mock-payment", status: "PENDING", checkoutUrl: paymentUrl ? paymentUrl(input.orderId) : null }; },
    async verifyPayment() { return verdict; },
    async refundPayment() { refundCalls++; if (refundError) throw new Error("Reembolso no confirmado"); },
    async handleWebhook() { if (webhookError) throw new Error(typeof webhookError === "string" ? webhookError : "firma inválida: secret credentials"); return { orderId: rows.orders[0]?.id, status: webhookStatus, amountClp: webhookAmount, currency: webhookCurrency, providerPaymentId: "123" }; },
  };
  const modules = {
    "https://deno.land/std@0.208.0/http/server.ts": { serve: (fn) => { handler = fn; } },
    "node:crypto": { timingSafeEqual },
    "https://esm.sh/@supabase/supabase-js@2.117.2": { createClient: () => db },
    "npm:zod@3.25.76": { z },
    "../_shared/checkout-rules.ts": loadRules(),
    "../_shared/payment.ts": { getPaymentProvider: () => provider, enabledPaymentProviders: () => ["mock"], sandboxOnly: () => true },
    "../_shared/notify.ts": { sendOrderEmail: async () => ({ sent: true }) },
    "../_shared/ratelimit.ts": { rateLimit: () => null },
  };
  new Function("require", "exports", "Deno", outputText)((id) => { if (!modules[id]) throw new Error(id); return modules[id]; }, {}, { env: { get: (key) => ({ SUPABASE_URL: "https://example.test", SUPABASE_SECRET_KEY: "test" })[key] } });
  return { rows, setVerdict(value) { verdict = value; }, get stockDeductions() { return stockDeductions; }, setWebhookStatus(value) { webhookStatus = value; }, get createCalls() { return createCalls; }, get refundCalls() { return refundCalls; }, async call(body, token, options = {}) { return handler(new Request("https://example.test/functions/v1/checkout", { method: options.method ?? "POST", headers: { "Content-Type": "application/json", Origin: "https://store.test", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(options.method === "OPTIONS" ? {} : { body: JSON.stringify(body) }) })); } };
}
export function input() { return { action: "create", items: [{ product_id: product, qty: 1 }], shipping_rate_id: rate, address: { fullName: "Test User", email: "test@example.test", phone: "+56911111111", street: "Calle 123", comuna: "Santiago", region: "Metropolitana" }, idempotency_key: randomUUID(), attempt_secret: randomUUID() }; }

