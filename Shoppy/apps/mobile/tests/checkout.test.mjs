import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

// Ejecutar el cliente real con transporte aislado, sin cargar módulos nativos.
const source = readFileSync(new URL("../src/lib/checkout.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
function client({ fetch, results = {}, setTimeout = () => 1, clearTimeout = () => {} } = {}) {
  const supabase = {
    auth: { getSession: async () => ({ data: { session: null } }) },
    from(table) {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        maybeSingle: () => Promise.resolve(results[table]),
        then: (resolve, reject) => Promise.resolve(results[table]).then(resolve, reject),
      };
      return query;
    },
  };
  const exports = {};
  new Function("require", "exports", "fetch", "process", "setTimeout", "clearTimeout", outputText)(
    () => ({ getSupabase: () => supabase, isSupabaseConfigured: true }),
    exports, fetch, { env: { EXPO_PUBLIC_SUPABASE_URL: "https://example.test" } }, setTimeout, clearTimeout,
  );
  return exports;
}
const input = { items: [], shipping_rate_id: "rate", region: "Metropolitana" };

test("preserva errores de negocio del backend", async () => {
  const api = client({ fetch: async () => new Response(JSON.stringify({ error: { code: "SOLD_OUT", message: "Agotado" } }), { status: 409 }) });
  await assert.rejects(api.quoteCheckout(input), { code: "SOLD_OUT", status: 409, message: "Agotado" });
});

test("respuesta HTML se informa como respuesta inválida, no como desconexión", async () => {
  const api = client({ fetch: async () => new Response("<html>Error</html>", { status: 502 }) });
  await assert.rejects(api.quoteCheckout(input), { code: "INVALID_RESPONSE", status: 502 });
});

test("el timeout cubre también la lectura del cuerpo", async () => {
  let expire;
  let cleared = false;
  const api = client({
    setTimeout: (callback) => { expire = callback; return 1; },
    clearTimeout: () => { cleared = true; },
    fetch: async (_url, { signal }) => ({
      ok: true, status: 200,
      text: async () => {
        assert.equal(cleared, false);
        expire();
        assert.equal(signal.aborted, true);
        throw Object.assign(new Error("Aborted"), { name: "AbortError" });
      },
    }),
  });
  await assert.rejects(api.quoteCheckout(input), { code: "TIMEOUT" });
  assert.equal(cleared, true);
});

test("devuelve cotización válida y clasifica fallos de red", async () => {
  const quote = { total_clp: 12000 };
  assert.deepEqual(await client({ fetch: async () => new Response(JSON.stringify(quote)) }).quoteCheckout(input), quote);
  await assert.rejects(client({ fetch: async () => { throw new TypeError("Network failed"); } }).quoteCheckout(input), { code: "OFFLINE" });
});

for (const table of ["order_items", "order_status_history", "shipments"]) {
  test(`propaga error de ${table} sin mostrar pedido incompleto`, async () => {
    const error = { message: "Consulta fallida" };
    const results = {
      orders: { data: { id: "order" } },
      order_items: { data: [] },
      order_status_history: { data: [] },
      shipments: { data: null },
      [table]: { data: null, error },
    };
    await assert.rejects(client({ results }).getMyOrderDetail("order"), (actual) => actual === error);
  });
}

test("pedido válido admite envío pendiente y pedido inexistente devuelve null", async () => {
  const results = {
    orders: { data: { id: "order" } },
    order_items: { data: [{ product_name: "Chaqueta" }] },
    order_status_history: { data: [] },
    shipments: { data: null },
  };
  const order = await client({ results }).getMyOrderDetail("order");
  assert.equal(order.items[0].product_name, "Chaqueta");
  assert.equal(order.carrier, null);
  assert.equal(await client({ results: { orders: { data: null } } }).getMyOrderDetail("missing"), null);
});
