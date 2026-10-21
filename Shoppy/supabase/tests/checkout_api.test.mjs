import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { fixture, input, product, rate } from "./helpers/checkout-fixture.mjs";

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

test("pago tardío se reembolsa solo y avisa al cliente", async () => {
  const f = fixture({ interactive: true });
  const created = await (await f.call(input())).json();
  // La reserva venció: el pago llega cuando la prenda ya está libre.
  f.rows.product_reservations
    .filter((r) => r.order_id === created.order_id)
    .forEach((r) => { r.status = "expired"; });
  const confirmed = await f.call({ action: "confirm", order_id: created.order_id, guest_token: created.guest_token });
  assert.equal(confirmed.status, 409);
  assert.equal((await confirmed.json()).error.code, "REFUNDED");
  assert.equal(f.refundCalls, 1);
  const payment = f.rows.payments.find((p) => p.order_id === created.order_id);
  assert.equal(payment.status, "refunded");
  assert.equal(payment.refund_state, "done");
  assert.equal(f.rows.orders.find((o) => o.id === created.order_id).status, "REFUNDED");
});

test("si el reembolso automático falla, el pago queda en revisión y no se reintenta", async () => {
  const f = fixture({ interactive: true, refundError: true });
  const created = await (await f.call(input())).json();
  f.rows.product_reservations
    .filter((r) => r.order_id === created.order_id)
    .forEach((r) => { r.status = "expired"; });
  const confirmed = await f.call({ action: "confirm", order_id: created.order_id, guest_token: created.guest_token });
  assert.equal(confirmed.status, 409);
  assert.equal((await confirmed.json()).error.code, "REFUND_REQUIRED");
  const payment = f.rows.payments.find((p) => p.order_id === created.order_id);
  assert.equal(payment.refund_state, "review");
  assert.match(payment.incident, /REFUND_REVIEW/);
});

test("el precio cambió entre la cotización y el pago: no se cobra otro importe", async () => {
  const f = fixture();
  const res = await f.call({ ...input(), expected_total_clp: 999 });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error.code, "PRICE_CHANGED");
  assert.equal(f.rows.orders.length, 0);
  assert.equal(f.rows.products[0].stock, 1);
});

test("con el total cotizado correcto la compra sigue adelante", async () => {
  const f = fixture();
  const res = await f.call({ ...input(), expected_total_clp: 1000 });
  assert.equal(res.status, 200);
  assert.equal(f.rows.orders.length, 1);
});

test("un cupón del 100 % con envío gratis no deja un pedido de 0 CLP", async () => {
  const f = fixture({ discountAmount: 1000 });
  const res = await f.call({ ...input(), discount_code: "TODO" });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, "INVALID_TOTAL");
  assert.equal(f.rows.orders.length, 0);
});

test("CORS cubre preflight, éxito y errores sin credenciales", async () => {
  const f = fixture();
  for (const response of [await f.call(null, null, { method: "OPTIONS" }), await f.call({ action: "providers" }), await f.call({ action: "unknown" })]) {
    assert.equal(response.headers.get("access-control-allow-origin"), "https://store.test");
    assert.match(response.headers.get("vary"), /Origin/i);
    assert.equal(response.headers.get("access-control-allow-credentials"), null);
  }
});
test("servidor rechaza direcciones manipuladas y no crea pedidos", async () => {
  for (const address of [{ street: "123" }, { street: "5 de Abril" }, { comuna: "Temuco" }, { region: "Desconocida" }]) {
    const f = fixture(); const request = input();
    assert.equal((await f.call({ ...request, address: { ...request.address, ...address } })).status, 400);
    assert.equal(f.rows.orders.length, 0);
    assert.equal(f.rows.checkout_attempts.length, 0);
  }
});
test("quote rechaza cantidades, duplicados y región desconocida", async () => {
  const f = fixture();
  const quote = { action: "quote", shipping_rate_id: rate, region: "Metropolitana", items: [{ product_id: product, qty: 1 }] };
  for (const patch of [{ items: [{ product_id: product, qty: 0 }] }, { items: [{ product_id: product, qty: 1.5 }] }, { items: [...quote.items, ...quote.items] }, { region: "inventada" }]) {
    assert.equal((await f.call({ ...quote, ...patch })).status, 400);
  }
});
test("precios y totales del cliente se ignoran; precios monetarios inválidos se rechazan", async () => {
  const f = fixture();
  const quote = { action: "quote", shipping_rate_id: rate, region: "Metropolitana", items: [{ product_id: product, qty: 1, price_clp: 1 }], total_clp: 1 };
  assert.equal((await (await f.call(quote)).json()).total_clp, 1000);
  for (const price of [-1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    f.rows.products[0].price_clp = price;
    assert.equal((await f.call(quote)).status, 409);
  }
});
test("ejemplos, demos, ocultos y stock insuficiente no se compran", async () => {
  for (const patch of [{ metadata: { example: true } }, { metadata: { demo: true } }, { published_at: null }, { availability: "ARCHIVED" }, { availability: "SOLD" }, { stock: 0 }]) {
    const f = fixture(); Object.assign(f.rows.products[0], patch);
    assert.equal((await f.call(input())).status, 409);
    assert.equal(f.rows.orders.length, 0);
    assert.equal(f.createCalls, 0);
  }
});
test("tarifas ajenas e inactivas se rechazan; OTRAS admite región conocida", async () => {
  const f = fixture();
  const quote = { action: "quote", shipping_rate_id: rate, region: "Ñuble", items: [{ product_id: product, qty: 1 }] };
  f.rows.shipping_rates[0].region = "Biobío";
  assert.equal((await f.call(quote)).status, 400);
  f.rows.shipping_rates[0].region = "OTRAS";
  assert.equal((await f.call(quote)).status, 200);
  f.rows.shipping_rates[0].is_active = false;
  assert.equal((await f.call(quote)).status, 400);
});
test("cuenta ajena e invitado no pueden confirmar pedido autenticado", async () => {
  const f = fixture(); const created = await (await f.call(input(), "valid")).json();
  assert.equal((await f.call({ action: "confirm", order_id: created.order_id })).status, 403);
  assert.equal((await f.call({ action: "confirm", order_id: created.order_id, guest_token: "cualquier" })).status, 403);
  f.rows.orders[0].user_id = "other-account";
  assert.equal((await f.call({ action: "confirm", order_id: created.order_id }, "valid")).status, 403);
});
test("save_address asigna exclusivamente el dueño autenticado", async () => {
  const f = fixture(); const request = input();
  await f.call({ ...request, save_address: true, user_id: "attacker", address: { ...request.address, user_id: "attacker" } }, "valid");
  assert.equal(f.rows.addresses.length, 1);
  assert.equal(f.rows.addresses[0].user_id, "account");
  assert.equal(f.rows.addresses[0].region, "Metropolitana");
});
test("pago rechazado no liquida ni descuenta stock adicional a la reserva", async () => {
  const f = fixture({ verdict: "REJECTED" }); const created = await (await f.call(input())).json();
  assert.equal((await f.call({ action: "confirm", order_id: created.order_id, guest_token: created.guest_token })).status, 402);
  assert.equal(f.rows.orders[0].status, "PENDING_PAYMENT");
  assert.equal(f.rows.products[0].stock, 0);
});
test("confirmaciones repetidas convergen sin repetir descuento (RPC simulado)", async () => {
  const f = fixture(); const created = await (await f.call(input())).json();
  const confirm = { action: "confirm", order_id: created.order_id, guest_token: created.guest_token };
  assert.equal((await f.call(confirm)).status, 200);
  assert.equal((await f.call(confirm)).status, 200);
  assert.equal(f.rows.products[0].stock, 0);
  assert.equal(f.rows.orders[0].status, "PAID");
});
test("monto de pago almacenado distinto al pedido impide confirmación", async () => {
  const f = fixture(); const created = await (await f.call(input())).json(); f.rows.payments[0].amount_clp = 999;
  assert.equal((await f.call({ action: "confirm", order_id: created.order_id, guest_token: created.guest_token })).status, 409);
  assert.equal(f.rows.orders[0].status, "PENDING_PAYMENT");
});
test("webhook inválido, moneda incorrecta y pendiente nunca liquidan", async () => {
  for (const options of [{ webhookError: true }, { webhookCurrency: "USD" }, { webhookStatus: "PENDING" }]) {
    const f = fixture(options); await f.call(input());
    const response = await f.call({ action: "webhook" });
    assert.equal(response.status, options.webhookError ? 401 : options.webhookCurrency ? 400 : 200);
    assert.equal(f.rows.products[0].stock, 0);
    assert.equal(f.rows.payments[0].status, "pending");
    assert.doesNotMatch(await response.text(), /secret credentials/);
  }
});
test("webhooks duplicados y pendientes tardíos no revierten PAID (RPC simulado)", async () => {
  const f = fixture(); await f.call(input()); f.rows.payments[0].provider = "mercadopago";
  assert.equal((await f.call({ action: "webhook" })).status, 200);
  assert.equal((await f.call({ action: "webhook" })).status, 200);
  f.setWebhookStatus("PENDING");
  assert.equal((await f.call({ action: "webhook" })).status, 200);
  assert.equal(f.rows.products[0].stock, 0);
  assert.equal(f.rows.orders[0].status, "PAID");
});
test("errores de DB no exponen detalles y error de liquidación permanece reintentable", async () => {
  const broken = fixture({ dbError: true }); const failed = await broken.call(input());
  assert.equal(failed.status, 500); assert.doesNotMatch(await failed.text(), /credentials/);
  const f = fixture({ settleError: true }); const created = await (await f.call(input())).json();
  const response = await f.call({ action: "confirm", order_id: created.order_id, guest_token: created.guest_token });
  assert.equal(response.status, 500); assert.doesNotMatch(await response.text(), /private SQL/);
  assert.equal(f.rows.products[0].stock, 0);
});

test("fallo transitorio del proveedor en webhook devuelve 503 para reintentar", async () => {
  const f = fixture({ webhookError: "mercadopago HTTP 503: secret credentials" }); await f.call(input());
  const response = await f.call({ action: "webhook" });
  assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /secret credentials/);
  assert.equal(f.rows.orders[0].status, "PENDING_PAYMENT");
});

test("cupón se calcula en servidor y descuento corrupto no produce total negativo", async () => {
  const quote = { action: "quote", shipping_rate_id: rate, region: "Metropolitana", items: [{ product_id: product, qty: 1 }], discount_code: "TEST", discount_clp: 999 };
  const f = fixture();
  const result = await (await f.call(quote)).json();
  assert.equal(result.discount_clp, 100); assert.equal(result.total_clp, 900);
  for (const discountAmount of [-1, 1001, 0.5]) {
    const bad = fixture({ discountAmount });
    assert.equal((await bad.call(quote)).status, 500);
  }
});

test("crear reserva stock una sola vez; confirmaciones duplicadas no vuelven a descontar (RPC simulado)", async () => {
  const f = fixture(); const request = input();
  const created = await (await f.call(request)).json();
  assert.equal(f.rows.orders[0].status, "PENDING_PAYMENT");
  assert.equal(f.rows.products[0].stock, 0);
  assert.equal(f.stockDeductions, 1);
  assert.equal((await f.call(request)).status, 200);
  assert.equal(f.stockDeductions, 1);
  const confirm = { action: "confirm", order_id: created.order_id, guest_token: created.guest_token };
  assert.equal((await f.call(confirm)).status, 200);
  assert.equal((await f.call(confirm)).status, 200);
  assert.equal(f.stockDeductions, 1);
  assert.equal(f.rows.products[0].stock, 0);
  assert.equal(f.rows.orders[0].status, "PAID");
});

test("errores desconocidos de RPC no se publican como códigos internos", async () => {
  const f = fixture({ discountError: true });
  const response = await f.call({ action: "quote", items: [{ product_id: product, qty: 1 }], region: "Metropolitana", shipping_rate_id: rate, discount_code: "TEST" });
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.equal(body.error.code, "INVALID_DISCOUNT");
  assert.doesNotMatch(JSON.stringify(body), /PRIVATE_CREDENTIAL|private diagnostic/);
});
