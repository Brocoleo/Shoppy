"use client";

/**
 * Catálogo web contra Supabase (puerto de SupabaseCatalogRepository móvil).
 * Lee con la anon key bajo RLS: solo catálogo publicado, sin ARCHIVED.
 */
import { isPublicProduct } from "@shopy/shared/editorial";
import { publicImageUrl } from "./productImageUrl";
import type { SupabaseClient } from "@supabase/supabase-js";

/** supabase-js con carga diferida: evita llevarlo al bundle crítico de TODAS las rutas. */
async function db() {
  const { getSupabase } = await import("./supabase");
  return getSupabase();
}

/** Sondeo en vivo de una ficha: ¿sigue disponible o alguien la reservó/vendió? */
export async function observeProduct(slug: string): Promise<{ stock: number; availability: string } | null> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("products")
    .select("slug,stock,availability")
    .eq("slug", slug)
    .not("published_at", "is", null)
    .neq("availability", "ARCHIVED")
    .maybeSingle();
  if (error) throw error;
  return data ? { stock: Number(data.stock ?? 0), availability: String(data.availability ?? "") } : null;
}

import {
  mapProduct,
  PRODUCT_COLUMNS,
  type DbProductRow,
  type CatalogProduct,
  type CatalogCategory,
  type CatalogCollection,
  type ProductSort,
  type ProductFilters,
} from "./catalogProduct";
export type {
  RemoteImage,
  CatalogProduct,
  CatalogCategory,
  CatalogCollection,
  ProductSort,
  ProductFilters,
} from "./catalogProduct";

let categoriesCache: CatalogCategory[] | null = null;
let brandsCache: { slug: string; name: string; id?: string }[] | null = null;
const categoriesById = new Map<string, string>();
const brandIdBySlug = new Map<string, string>();

// Share taxonomy requests between the concurrent home/catalog queries.
let taxonomyRequest: Promise<void> | null = null;

async function taxonomy() {
  if (categoriesCache && brandsCache) return;
  if (!taxonomyRequest) {
    taxonomyRequest = loadTaxonomy().finally(() => {
      taxonomyRequest = null;
    });
  }
  await taxonomyRequest;
}

async function loadTaxonomy() {
  const supabase = await db();
  // En paralelo: antes eran 2 RTT secuenciales previos a cada consulta de
  // productos (retrasa el descubrimiento de la imagen LCP del hero).
  const [cats, brands] = await Promise.all([
    categoriesCache
      ? Promise.resolve(null)
      : supabase
          .from("categories")
          .select("id,slug,name,parent_id")
          .eq("is_active", true)
          .order("sort_order"),
    brandsCache !== null
      ? Promise.resolve(null)
      : supabase.from("brands").select("id,slug,name").order("name"),
  ]);
  if (cats) {
    const { data, error } = cats;
    if (error) throw error;
    const idToSlug = new Map<string, string>();
    for (const c of data ?? []) idToSlug.set(c.id, c.slug);
    categoriesById.clear();
    for (const [k, v] of idToSlug) categoriesById.set(k, v);
    categoriesCache = (data ?? []).map((c) => ({
      slug: c.slug,
      name: c.name,
      parentSlug: c.parent_id ? (idToSlug.get(c.parent_id) ?? null) : null,
    }));
  }
  if (brands) {
    const { data, error } = brands;
    if (error) throw error;
    brandsCache = data ?? [];
    brandIdBySlug.clear();
    for (const b of data ?? []) brandIdBySlug.set(b.slug, b.id);
  }
}

function toProduct(row: DbProductRow): CatalogProduct {
  return mapProduct(row, categoriesById, publicImageUrl);
}

function sortSpec(sort: ProductSort): { column: string; ascending: boolean } {
  switch (sort) {
    case "novedades":
      return { column: "published_at", ascending: false };
    case "precio-asc":
      return { column: "price_clp", ascending: true };
    case "precio-desc":
      return { column: "price_clp", ascending: false };
    case "tendencia":
    default:
      return { column: "trending_score", ascending: false };
  }
}

export function productCover(p: CatalogProduct): string | null {
  const imgs = p.remoteImages ?? [];
  if (imgs.length === 0) return null;
  return (imgs.find((i) => !i.isDefect) ?? imgs[0]).url;
}

export async function listProducts(
  sort: ProductSort = "tendencia",
): Promise<CatalogProduct[]> {
  await taxonomy();
  const spec = sortSpec(sort);
  const supabase = await db();
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .not("published_at", "is", null)
    .neq("availability", "ARCHIVED")
    .order(spec.column, { ascending: spec.ascending });
  if (error) throw error;
  return (data as unknown as DbProductRow[])
    .filter(isPublicProduct)
    .map(toProduct);
}

export async function getProductBySlug(
  slug: string,
): Promise<CatalogProduct | null> {
  await taxonomy();
  const supabase = await db();
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!data || !isPublicProduct(data as unknown as DbProductRow)) return null;
  return toProduct(data as unknown as DbProductRow);
}

/** Una sola query para N productos (colecciones/home): evita N+1. */
export async function getProductsByIds(
  ids: string[],
): Promise<CatalogProduct[]> {
  if (ids.length === 0) return [];
  await taxonomy();
  const supabase = await db();
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .in("id", ids)
    .not("published_at", "is", null)
    .neq("availability", "ARCHIVED");
  if (error) throw error;
  const byId = new Map(
    ((data ?? []) as unknown as DbProductRow[])
      .filter(isPublicProduct)
      .map((r) => [r.id, toProduct(r)]),
  );
  return ids
    .map((id) => byId.get(id))
    .filter((p): p is CatalogProduct => p !== undefined);
}

/** Construye la query base con filtros por atributos (sin texto ni orden).
 *  Devuelve null cuando los filtros son imposibles (categoría/marca inexistente). */
function filteredQuery(filters: ProductFilters, supabase: SupabaseClient) {
  let query = supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .not("published_at", "is", null)
    .neq("availability", "ARCHIVED");

  if (filters.categorySlug && categoriesCache) {
    const wanted = filters.categorySlug;
    const children = categoriesCache
      .filter((c) => c.parentSlug === wanted)
      .map((c) => c.slug);
    const slugs = [wanted, ...children];
    const ids = [...categoriesById.entries()]
      .filter(([, slug]) => slugs.includes(slug))
      .map(([id]) => id);
    if (ids.length > 0) {
      const list = ids.join(",");
      query = query.or(`category_id.in.(${list}),subcategory_id.in.(${list})`);
    } else {
      return null;
    }
  }
  if (filters.brandSlug) {
    const brandId = brandIdBySlug.get(filters.brandSlug);
    if (!brandId) return null;
    query = query.eq("brand_id", brandId);
  }
  if (filters.condition) query = query.eq("condition", filters.condition);
  if (filters.size) query = query.eq("size", filters.size);
  if (filters.maxPriceClp !== undefined)
    query = query.lte("price_clp", filters.maxPriceClp);
  return query;
}

/**
 * Patrón difuso insensible a apóstrofes y guiones: "levis" matchea "Levi's".
 * Solo como fallback cuando el full-text no devuelve nada; exige ≥3 caracteres
 * alfanuméricos por palabra para no barrer el catálogo.
 */
function fuzzyWordPattern(word: string): string | null {
  const chars = word.toLowerCase().replace(/[^a-z0-9ñáéíóúü]/g, "");
  if (chars.length < 3) return null;
  return `%${[...chars].join("%")}%`;
}

export async function searchProducts(
  filters: ProductFilters,
  sort: ProductSort = "tendencia",
): Promise<CatalogProduct[]> {
  await taxonomy();
  const spec = sortSpec(sort);

  const run = async (mode: "ts" | "ilike"): Promise<CatalogProduct[]> => {
    const base = filteredQuery(filters, await db());
    if (!base) return [];
    let withSearch = base;
    if (filters.query) {
      if (mode === "ts") {
        withSearch = base.textSearch("search_vector", filters.query, {
          type: "plain",
          config: "spanish",
        });
      } else {
        const patterns = filters.query
          .split(/\s+/)
          .map(fuzzyWordPattern)
          .filter((p): p is string => p !== null);
        if (patterns.length === 0) return [];
        for (const pattern of patterns)
          withSearch = withSearch.ilike("name", pattern);
      }
    }
    const { data, error } = await withSearch.order(spec.column, {
      ascending: spec.ascending,
    });
    if (error) throw error;
    return (data as unknown as DbProductRow[])
      .filter(isPublicProduct)
      .map(toProduct);
  };

  const primary = await run("ts");
  if (primary.length > 0 || !filters.query) return primary;
  return run("ilike");
}

export async function listCategories(): Promise<CatalogCategory[]> {
  await taxonomy();
  return categoriesCache ?? [];
}

export async function listBrands(): Promise<{ slug: string; name: string }[]> {
  await taxonomy();
  return (brandsCache ?? []).map(({ slug, name }) => ({ slug, name }));
}

export async function getCollection(
  slug: string,
): Promise<CatalogCollection | null> {
  const supabase = await db();
  const { data: col, error } = await supabase
    .from("collections")
    .select("slug,name")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  if (!col) return null;
  const { data: items, error: itemsError } = await supabase
    .from("collection_products")
    .select("product_id,collections!inner(slug)")
    .eq("collections.slug", slug)
    .order("sort_order");
  if (itemsError) throw itemsError;
  return {
    slug: col.slug,
    name: col.name,
    productIds: (items ?? []).map((i: { product_id: string }) => i.product_id),
  };
}
