import "server-only";
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  ARCHIVE_KEY,
  parseArchive,
  parseHero,
  isPublicProduct,
} from "@shopy/shared/editorial";
import {
  PRODUCT_COLUMNS,
  mapProduct,
  type DbProductRow,
  type CatalogProduct,
  type CatalogCollection,
} from "./catalogProduct";
import { publicImageUrl } from "./productImageUrl";
export function publicServerDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Backend no configurado");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          cache: "no-store",
          signal: AbortSignal.timeout(2500),
        }),
    },
  });
}
export const initialEditorial = cache(async function initialEditorial() {
  const { data, error } = await publicServerDb()
    .from("home_sections")
    .select("key,config")
    .in("key", ["hero", ARCHIVE_KEY])
    .eq("is_active", true);
  if (error) throw error;
  return {
    hero: parseHero(data?.find((r) => r.key === "hero")?.config),
    archive: parseArchive(
      data?.find((r) => r.key === ARCHIVE_KEY)?.config,
    ).items.filter((i) => i.visible),
  };
});
export async function initialProducts() {
  const { data, error } = await publicServerDb()
    .from("products")
    .select(PRODUCT_COLUMNS)
    .not("published_at", "is", null)
    .neq("availability", "ARCHIVED")
    .order("published_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as DbProductRow[])
    .filter(isPublicProduct)
    .map((r) => mapProduct(r, new Map(), publicImageUrl));
}

/** Prenda individual ya mapeada, lista para SSR (elimina el fetch-in-skeleton de /producto). */
export async function initialProductBySlug(slug: string) {
  const { data, error } = await publicServerDb()
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("slug", slug)
    .not("published_at", "is", null)
    .neq("availability", "ARCHIVED")
    .maybeSingle();
  if (error) throw error;
  if (!data || !isPublicProduct(data as unknown as DbProductRow)) return null;
  return mapProduct(data as unknown as DbProductRow, new Map(), publicImageUrl);
}

/** Colección + prendas ordenadas por sort_order, en un solo render SSR. */
export async function initialCollection(slug: string) {
  const db = publicServerDb();
  const { data: col, error } = await db
    .from("collections")
    .select("slug,name")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  if (!col) return null;
  const { data: items, error: itemsError } = await db
    .from("collection_products")
    .select("product_id,collections!inner(slug)")
    .eq("collections.slug", slug)
    .order("sort_order");
  if (itemsError) throw itemsError;
  const ids = (items ?? []).map((i: { product_id: string }) => i.product_id);
  const products: CatalogProduct[] = [];
  if (ids.length > 0) {
    const { data, error: prodsError } = await db
      .from("products")
      .select(PRODUCT_COLUMNS)
      .in("id", ids)
      .not("published_at", "is", null)
      .neq("availability", "ARCHIVED");
    if (prodsError) throw prodsError;
    const byId = new Map((data as unknown as DbProductRow[]).map((r) => [r.id, r]));
    for (const id of ids) {
      const row = byId.get(id);
      if (row && isPublicProduct(row)) products.push(mapProduct(row, new Map(), publicImageUrl));
    }
  }
  return {
    collection: { slug: col.slug, name: col.name, productIds: ids } as CatalogCollection,
    products,
  };
}
