/**
 * Smoke Fase 5: carrito servidor (carts/cart_items), RLS y snapshots.
 * Uso:
 *   SUPABASE_URL=http://127.0.0.1:54321 \
 *   SUPABASE_ANON_KEY=sb_publishable_... \
 *   node supabase/tests/smoke_fase5.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
if (!url || !anon) {
  console.error("Faltan SUPABASE_URL o SUPABASE_ANON_KEY");
  process.exit(1);
}

let failures = 0;
function check(name, cond, extra = "") {
  if (cond) console.log(`PASS ${name}${extra ? ` (${extra})` : ""}`);
  else {
    console.error(`FAIL ${name} ${extra}`);
    failures++;
  }
}

const stamp = Date.now();
async function makeUser(tag) {
  const sb = createClient(url, anon);
  const email = `fase5-${tag}-${stamp}@shopy.cl`;
  const { error: eUp } = await sb.auth.signUp({ email, password: "secreta123" });
  if (eUp) throw new Error(`signup ${tag}: ${eUp.message}`);
  const { data, error: eIn } = await sb.auth.signInWithPassword({ email, password: "secreta123" });
  if (eIn) throw new Error(`signin ${tag}: ${eIn.message}`);
  return { sb, userId: data.user.id };
}

const P1 = "d0000000-0000-4000-8000-000000000001"; // 34990
const P2 = "d0000000-0000-4000-8000-000000000002"; // 12990

const { sb: a, userId: uidA } = await makeUser("a");
const { sb: b, userId: uidB } = await makeUser("b");
check("usuarios distintos", uidA !== uidB);

// 1. A crea su carrito + ítems con snapshot de precio vigente.
let cartId = "";
{
  const { data: cart, error: e1 } = await a.from("carts").insert({ user_id: uidA }).select("id").single();
  check("A crea carrito", !e1 && Boolean(cart?.id), e1?.message ?? "");
  cartId = cart?.id ?? "";
  const { data: prices } = await a.from("products").select("id,price_clp").in("id", [P1, P2]);
  const price = new Map((prices ?? []).map((r) => [r.id, r.price_clp]));
  const { error: e2 } = await a.from("cart_items").upsert(
    [
      { cart_id: cartId, product_id: P1, qty: 1, unit_price_clp: price.get(P1) },
      { cart_id: cartId, product_id: P2, qty: 2, unit_price_clp: price.get(P2) },
    ],
    { onConflict: "cart_id,product_id" },
  );
  check("A upsert ítems", !e2, e2?.message ?? "");
  const { data: items } = await a.from("cart_items").select("product_id,qty,unit_price_clp").eq("cart_id", cartId);
  const snap = (items ?? []).find((i) => i.product_id === P1)?.unit_price_clp;
  check("snapshot precio backend", (items ?? []).length === 2 && snap === 34990, `snapshot=${snap}`);
}

// 2. Merge: upsert suma (cliente) + borrado de stale.
{
  const { error } = await a.from("cart_items").upsert(
    [{ cart_id: cartId, product_id: P1, qty: 2, unit_price_clp: 34990 }],
    { onConflict: "cart_id,product_id" },
  );
  const { data } = await a.from("cart_items").select("qty").eq("cart_id", cartId).eq("product_id", P1).maybeSingle();
  check("upsert reemplaza qty", !error && data?.qty === 2);
  await a.from("cart_items").delete().eq("cart_id", cartId).eq("product_id", P2);
  const { data: rest } = await a.from("cart_items").select("product_id").eq("cart_id", cartId);
  check("delete stale", (rest ?? []).length === 1);
}

// 3. Aislamiento: B no ve ni toca el carrito de A.
{
  const { data: seen } = await b.from("carts").select("id").eq("id", cartId);
  check("B no ve carrito de A", (seen ?? []).length === 0);
  const { data: seenItems } = await b.from("cart_items").select("product_id").eq("cart_id", cartId);
  check("B no ve ítems de A", (seenItems ?? []).length === 0);
  const { error: eUpd } = await b.from("cart_items").update({ qty: 9 }).eq("cart_id", cartId).eq("product_id", P1);
  const { data: after } = await a.from("cart_items").select("qty").eq("cart_id", cartId).eq("product_id", P1).maybeSingle();
  check("B no modifica ítems de A", after?.qty === 2, eUpd?.message ?? `qty=${after?.qty}`);
  const { error: eIns } = await b.from("cart_items").insert({ cart_id: cartId, product_id: P2, qty: 1, unit_price_clp: 1 });
  check("B no inserta en carrito de A", Boolean(eIns));
}

// 4. anon no crea carritos ajenos ni huérfanos sin sesión.
{
  const anonSb = createClient(url, anon);
  const { error: e1 } = await anonSb.from("carts").insert({ user_id: uidA });
  check("anon no crea carrito ajeno", Boolean(e1));
  const { error: e2 } = await anonSb.from("cart_items").insert({ cart_id: cartId, product_id: P1, qty: 1, unit_price_clp: 1 });
  check("anon no inserta ítems", Boolean(e2));
}

if (failures > 0) {
  console.error(`${failures} smoke checks fallaron`);
  process.exit(1);
}
console.log("ALL CART SMOKE CHECKS PASSED");
