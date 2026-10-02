/**
 * Smoke Fase 4: catálogo real vía PostgREST + Storage + Auth + favoritos.
 * Uso:
 *   SUPABASE_URL=http://127.0.0.1:54321 \
 *   SUPABASE_ANON_KEY=sb_publishable_... \
 *   node supabase/tests/smoke_fase4.mjs
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

const sb = createClient(url, anon);

// 1. Catálogo público
{
  const { data, error } = await sb
    .from("products")
    .select("id,slug,price_clp,brand:brands(slug,name)")
    .not("published_at", "is", null)
    .neq("availability", "ARCHIVED")
    .order("trending_score", { ascending: false });
  check("list products", !error && data?.length === 20, `${data?.length ?? "?"} productos`);
  check("brand embed", !error && (data?.[0]?.brand?.slug ?? "") !== "");
}

// 2. Búsqueda full-text español (plain = AND de tokens)
{
  const { data, error } = await sb
    .from("products")
    .select("slug")
    .textSearch("search_vector", "chaqueta", { type: "plain", config: "spanish" });
  check("textSearch chaqueta", !error && (data ?? []).length >= 2, `${data?.length ?? "?"} hits`);
  const r2 = await sb
    .from("products")
    .select("slug")
    .textSearch("search_vector", "chaqueta cuero", { type: "plain", config: "spanish" });
  check("textSearch AND", !r2.error && (r2.data ?? []).length === 1, `${r2.data?.length ?? "?"} hits`);
}

// 3. Categorías / marcas / colección
{
  const { data: cats, error: e1 } = await sb.from("categories").select("slug").eq("is_active", true);
  const { data: brands, error: e2 } = await sb.from("brands").select("slug");
  const { data: col, error: e3 } = await sb.from("collections").select("slug").eq("slug", "ofertas").maybeSingle();
  const { data: items, error: e4 } = await sb
    .from("collection_products")
    .select("product_id,collections!inner(slug)")
    .eq("collections.slug", "ofertas");
  check("taxonomías", !e1 && !e2 && !e3 && (cats ?? []).length === 16 && (brands ?? []).length === 12 && col?.slug === "ofertas");
  check("colección ofertas", !e4 && (items ?? []).length === 4, `${items?.length ?? "?"} items`);
}

// 4. Detalle + imágenes
{
  const id = "d0000000-0000-4000-8000-000000000001";
  const { data: p, error: e1 } = await sb.from("products").select("slug,price_clp").eq("id", id).maybeSingle();
  const { data: imgs, error: e2 } = await sb
    .from("product_images")
    .select("storage_path,is_defect_detail")
    .eq("product_id", id)
    .order("sort_order");
  check("detalle producto", !e1 && p?.slug === "chaqueta-trucker-levis" && p?.price_clp === 34990);
  check("imágenes detalle", !e2 && (imgs ?? []).length === 2);
}

// 5. anon NO escribe catálogo
{
  const { error } = await sb.from("products").insert({ slug: "hack", name: "Hack", price_clp: 1 });
  check("anon no inserta", Boolean(error));
}

// 6. Storage público
{
  const res = await fetch(
    `${url}/storage/v1/object/public/product-images/products/vestido-zara-midi/01.png`,
  );
  check("storage público", res.status === 200, `http ${res.status}`);
}

// 7. product_view anónimo
{
  const { error } = await sb.from("analytics_events").insert({
    event_type: "product_view",
    product_id: "d0000000-0000-4000-8000-000000000001",
  });
  check("ingesta analytics anon", !error, error?.message ?? "");
}

// 8. Auth + favoritos sincronizados
{
  const email = `fase4+${Date.now()}@shopy.cl`;
  const { data: up, error: eUp } = await sb.auth.signUp({ email, password: "secreta123" });
  check("signup", !eUp && Boolean(up.user), eUp?.message ?? "");
  const { data: inn, error: eIn } = await sb.auth.signInWithPassword({ email, password: "secreta123" });
  const userId = inn.user?.id ?? "";
  check("signin", !eIn && userId !== "", eIn?.message ?? "");
  if (userId) {
    const pid = "d0000000-0000-4000-8000-000000000002";
    const { error: eFav } = await sb.from("favorites").insert({ user_id: userId, product_id: pid });
    const { data: favs, error: eList } = await sb.from("favorites").select("product_id").eq("user_id", userId);
    check("favorito remoto", !eFav && !eList && (favs ?? []).length === 1, eFav?.message ?? eList?.message ?? "");
    await sb.from("favorites").delete().eq("user_id", userId).eq("product_id", pid);
    await sb.auth.signOut();
  }
  // Limpieza: borrar usuario de prueba (requiere service; se deja al cron de confirmación)
}

if (failures > 0) {
  console.error(`${failures} smoke checks fallaron`);
  process.exit(1);
}
console.log("ALL SMOKE CHECKS PASSED");
