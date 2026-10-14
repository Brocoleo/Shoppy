"use client";

/**
 * Catálogo web contra Supabase (puerto de SupabaseCatalogRepository móvil).
 * Lee con la anon key bajo RLS: solo catálogo publicado, sin ARCHIVED.
 */
import type { ProductCondition } from "@shopy/types";
import { getSupabase, publicImageUrl } from "./supabase";

export interface RemoteImage {
  url: string;
  isDefect: boolean;
}

export interface CatalogProduct {
  id: string;
  slug: string;
  name: string;
  description: string;
  brand: string;
  brandSlug: string;
  categorySlug: string;
  subcategorySlug: string | null;
  segment: string | null;
  priceClp: number;
  compareAtPriceClp: number | null;
  condition: ProductCondition;
  size: string;
  color: string;
  stock: number;
  publishedAt: string;
  tags: string[];
  viewCount: number;
  favoriteCount: number;
  trendingScore: number;
  isFeatured: boolean;
  remoteImages?: RemoteImage[];
}

export interface CatalogCategory {
  slug: string;
  name: string;
  parentSlug: string | null;
}

export interface CatalogCollection {
  slug: string;
  name: string;
  productIds: string[];
}

export type ProductSort = "tendencia" | "novedades" | "precio-asc" | "precio-desc";

export interface ProductFilters {
  query?: string;
  categorySlug?: string;
  brandSlug?: string;
  condition?: ProductCondition;
  size?: string;
  maxPriceClp?: number;
}

interface DbProductRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  brand_id: string | null;
  category_id: string | null;
  subcategory_id: string | null;
  segment: string | null;
  price_clp: number;
  compare_at_price_clp: number | null;
  condition: ProductCondition;
  size: string | null;
  color: string | null;
  stock: number;
  published_at: string | null;
  tags: string[] | null;
  view_count: number;
  favorite_count: number;
  trending_score: number | string;
  is_featured: boolean;
  brand: { slug: string; name: string } | null;
  product_images: { storage_path: string; sort_order: number; is_cover: boolean; is_defect_detail: boolean }[] | null;
}

const PRODUCT_COLUMNS = [
  "id", "slug", "name", "description", "brand_id", "category_id",
  "subcategory_id", "segment", "price_clp", "compare_at_price_clp",
  "condition", "size", "color", "stock", "published_at", "tags",
  "view_count", "favorite_count", "trending_score", "is_featured",
  "brand:brands(slug,name)",
  "product_images(storage_path,sort_order,is_cover,is_defect_detail)",
].join(",");

let categoriesCache: CatalogCategory[] | null = null;
let brandsCache: { slug: string; name: string; id?: string }[] | null = null;
const categoriesById = new Map<string, string>();
const brandIdBySlug = new Map<string, string>();

async function taxonomy() {
  const supabase = getSupabase();
  if (!categoriesCache) {
    const { data, error } = await supabase
      .from("categories")
      .select("id,slug,name,parent_id")
      .eq("is_active", true)
      .order("sort_order");
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
  if (brandsCache === null) {
    const { data, error } = await supabase
      .from("brands")
      .select("id,slug,name")
      .order("name");
    if (error) throw error;
    brandsCache = data ?? [];
    brandIdBySlug.clear();
    for (const b of data ?? []) brandIdBySlug.set(b.slug, b.id);
  }
}

function toImages(row: DbProductRow): RemoteImage[] | undefined {
  const imgs = row.product_images;
  if (!imgs || imgs.length === 0) return undefined;
  return [...imgs]
    .sort((a, b) => Number(b.is_cover) - Number(a.is_cover) || a.sort_order - b.sort_order)
    .map((i) => ({ url: publicImageUrl(i.storage_path), isDefect: i.is_defect_detail }));
}

function toProduct(row: DbProductRow): CatalogProduct {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? "",
    brand: row.brand?.name ?? "Sin marca",
    brandSlug: row.brand?.slug ?? "",
    categorySlug: (row.category_id && categoriesById.get(row.category_id)) ?? "",
    subcategorySlug: (row.subcategory_id && categoriesById.get(row.subcategory_id)) ?? null,
    segment: row.segment,
    priceClp: row.price_clp,
    compareAtPriceClp: row.compare_at_price_clp,
    condition: row.condition,
    size: row.size ?? "Única",
    color: row.color ?? "",
    stock: row.stock,
    publishedAt: row.published_at ?? new Date(0).toISOString(),
    tags: row.tags ?? [],
    viewCount: row.view_count,
    favoriteCount: row.favorite_count,
    trendingScore: Number(row.trending_score),
    isFeatured: row.is_featured,
    remoteImages: toImages(row),
  };
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

export async function listProducts(sort: ProductSort = "tendencia"): Promise<CatalogProduct[]> {
  await taxonomy();
  const spec = sortSpec(sort);
  const { data, error } = await getSupabase()
    .from("products")
    .select(PRODUCT_COLUMNS)
    .not("published_at", "is", null)
    .neq("availability", "ARCHIVED")
    .order(spec.column, { ascending: spec.ascending });
  if (error) throw error;
  return (data as unknown as DbProductRow[]).map(toProduct);
}

export async function getProductBySlug(slug: string): Promise<CatalogProduct | null> {
  await taxonomy();
  const { data, error } = await getSupabase()
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return toProduct(data as unknown as DbProductRow);
}

/** Una sola query para N productos (colecciones/home): evita N+1. */
export async function getProductsByIds(ids: string[]): Promise<CatalogProduct[]> {
  if (ids.length === 0) return [];
  await taxonomy();
  const { data, error } = await getSupabase()
    .from("products")
    .select(PRODUCT_COLUMNS)
    .in("id", ids)
    .not("published_at", "is", null)
    .neq("availability", "ARCHIVED");
  if (error) throw error;
  const byId = new Map(((data ?? []) as unknown as DbProductRow[]).map((r) => [r.id, toProduct(r)]));
  return ids.map((id) => byId.get(id)).filter((p): p is CatalogProduct => p !== undefined);
}

export async function searchProducts(filters: ProductFilters, sort: ProductSort = "tendencia"): Promise<CatalogProduct[]> {
  await taxonomy();
  const supabase = getSupabase();
  let query = supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .not("published_at", "is", null)
    .neq("availability", "ARCHIVED");

  if (filters.query) {
    query = query.textSearch("search_vector", filters.query, { type: "plain", config: "spanish" });
  }
  if (filters.categorySlug && categoriesCache) {
    const wanted = filters.categorySlug;
    const children = categoriesCache.filter((c) => c.parentSlug === wanted).map((c) => c.slug);
    const slugs = [wanted, ...children];
    const ids = [...categoriesById.entries()]
      .filter(([, slug]) => slugs.includes(slug))
      .map(([id]) => id);
    if (ids.length > 0) {
      const list = ids.join(",");
      query = query.or(`category_id.in.(${list}),subcategory_id.in.(${list})`);
    } else {
      return [];
    }
  }
  if (filters.brandSlug) {
    const brandId = brandIdBySlug.get(filters.brandSlug);
    if (!brandId) return [];
    query = query.eq("brand_id", brandId);
  }
  if (filters.condition) query = query.eq("condition", filters.condition);
  if (filters.size) query = query.eq("size", filters.size);
  if (filters.maxPriceClp !== undefined) query = query.lte("price_clp", filters.maxPriceClp);

  const spec = sortSpec(sort);
  const { data, error } = await query.order(spec.column, { ascending: spec.ascending });
  if (error) throw error;
  return (data as unknown as DbProductRow[]).map(toProduct);
}

export async function listCategories(): Promise<CatalogCategory[]> {
  await taxonomy();
  return categoriesCache ?? [];
}

export async function listBrands(): Promise<{ slug: string; name: string }[]> {
  await taxonomy();
  return (brandsCache ?? []).map(({ slug, name }) => ({ slug, name }));
}

export async function getCollection(slug: string): Promise<CatalogCollection | null> {
  const supabase = getSupabase();
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
