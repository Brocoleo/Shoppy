/**
 * Smoke Fase 6: checkout end-to-end (quote/create/confirm, guest + authed,
 * cupón, doble-compra bloqueada, confirm idempotente, tracking invitado).
 * Requiere functions serve: `supabase functions serve checkout --no-verify-jwt`.
 * Uso:
 *   SUPABASE_URL=http://127.0.0.1:54321 \
 *   SUPABASE_ANON_KEY=sb_publishable_... \
 *   node supabase/tests/smoke_fase6.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
if (!url || !anon) {
  console.error("Faltan SUPABASE_URL o SUPABASE_ANON_KEY");
  process.exit(1);
}
const FN = `${url}/functions/v1/checkout`;
const RATE = "f0000000-0000-4000-8000-000000000001"; // Metropolitana/Starken
const P_GUEST = "d0000000-0000-4000-8000-000000000015"; // pañuelo stock 3
const P_USER = "d0000000-0000-4000-8000-000000000016"; // polera puma stock 1

let failures = 0;
function check(name, cond, extra = "") {
  if (cond) console.log(`PASS ${name}${extra ? ` (${extra})` : ""}`);
  else {
    console.error(`FAIL ${name} ${extra}`);
    failures++;
  }
}

async function call(body, token) {
  const res = await fetch(FN, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

const ADDR = {
  fullName: "Test Seis",
  email: "fase6@shopy.cl",
  phone: "+56912345678",
  street: "Calle 6",
  comuna: "Providencia",
  region: "Metropolitana",
};

// 1. quote con cupón (pañuelo 4990 < mínimo 19990 → debe fallar con código)
{
  const r = await call({
    action: "quote",
    items: [{ product_id: P_GUEST, qty: 1 }],
    shipping_rate_id: RATE,
    discount_code: "BIENVENIDA10",
    region: "Metropolitana",
  });
  check("cupón bajo mínimo", r.status === 400 && r.json?.error?.code === "DISCOUNT_MIN_SUBTOTAL", JSON.stringify(r.json));
}

// 2. quote válido sin cupón
{
  const r = await call({
    action: "quote",
    items: [{ product_id: P_GUEST, qty: 2 }],
    shipping_rate_id: RATE,
    region: "Metropolitana",
  });
  check("quote", r.status === 200 && r.json.total_clp === 4990 * 2 + 2990, `total=${r.json.total_clp}`);
}

// 3. create guest + confirm + confirm idempotente
let guestOrder = null;
{
  const r = await call({
    action: "create",
    items: [{ product_id: P_GUEST, qty: 1 }],
    address: ADDR,
    shipping_rate_id: RATE,
  });
  check("create guest", r.status === 200 && Boolean(r.json.guest_token), r.json?.error?.code ?? r.json.order_number);
  guestOrder = r.json;
  const c1 = await call({ action: "confirm", order_id: guestOrder.order_id, guest_token: guestOrder.guest_token });
  check("confirm guest PAID", c1.status === 200 && c1.json.status === "PAID");
  const c2 = await call({ action: "confirm", order_id: guestOrder.order_id, guest_token: guestOrder.guest_token });
  check("confirm idempotente", c2.status === 200 && c2.json.already === true);
}

// 3b. BOLA en confirm (skill api-security-review, API1): sin prueba de
// propiedad no se puede confirmar ni filtrar el guest_token ajeno.
{
  const v = await call({
    action: "create",
    items: [{ product_id: P_GUEST, qty: 1 }],
    address: ADDR,
    shipping_rate_id: RATE,
  });
  check("create víctima", v.status === 200 && Boolean(v.json.guest_token));
  const victimId = v.json.order_id;
  const a1 = await call({ action: "confirm", order_id: victimId });
  check(
    "confirm ajeno sin token rechazado",
    a1.status === 403 && a1.json?.error?.code === "FORBIDDEN",
    `status=${a1.status}`,
  );
  const a2 = await call({ action: "confirm", order_id: victimId, guest_token: "token-falso" });
  check("confirm con token falso rechazado", a2.status === 403, `status=${a2.status}`);
  const c = await call({ action: "confirm", order_id: victimId, guest_token: v.json.guest_token });
  check(
    "confirm dueño con token PAID (transición fresca, no already)",
    c.status === 200 && c.json.status === "PAID" && c.json.already !== true,
    JSON.stringify(c.json),
  );
}

// 4. tracking invitado vía RPC
{
  const sb = createClient(url, anon);
  const { data, error } = await sb.rpc("get_guest_order", {
    p_order_id: guestOrder.order_id,
    p_token: guestOrder.guest_token,
  });
  check("tracking guest", !error && data?.order_number === guestOrder.order_number, error?.message ?? "");
}

// 5. flujo autenticado con dirección guardada
{
  const sb = createClient(url, anon);
  const email = `fase6+${Date.now()}@shopy.cl`;
  await sb.auth.signUp({ email, password: "secreta123" });
  const { data: { session } } = await sb.auth.signInWithPassword({ email, password: "secreta123" });
  const r = await call(
    {
      action: "create",
      items: [{ product_id: P_USER, qty: 1 }],
      address: { ...ADDR, email },
      shipping_rate_id: RATE,
      save_address: true,
    },
    session.access_token,
  );
  check("create authed", r.status === 200 && r.json.guest_token === null, r.json?.error?.code ?? r.json.order_number);
  const c = await call({ action: "confirm", order_id: r.json.order_id }, session.access_token);
  check("confirm authed", c.status === 200 && c.json.status === "PAID");
  const other = await call({ action: "confirm", order_id: r.json.order_id });
  check("confirm authed sin JWT rechazado", other.status === 403, `status=${other.status}`);
  const { data: addrs } = await sb.from("addresses").select("id").eq("user_id", session.user.id);
  check("dirección guardada", (addrs ?? []).length === 1);
  const { data: mine } = await sb.from("orders").select("id").eq("user_id", session.user.id);
  check("pedido visible al dueño", (mine ?? []).length === 1);
}

// 6. doble-compra del producto único vendido en (5) → 409
{
  const r = await call({
    action: "create",
    items: [{ product_id: P_USER, qty: 1 }],
    address: ADDR,
    shipping_rate_id: RATE,
  });
  check("doble-compra bloqueada", r.status === 409, r.json?.error?.code ?? "");
}

if (failures > 0) {
  console.error(`${failures} smoke checks fallaron`);
  process.exit(1);
}
console.log("ALL CHECKOUT SMOKE CHECKS PASSED");
