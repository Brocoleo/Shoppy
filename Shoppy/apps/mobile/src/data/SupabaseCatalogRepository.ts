/**
 * Implementación Supabase de CatalogRepository (Fase 4).
 * Lee con la anon key bajo RLS: solo catálogo publicado, sin ARCHIVED.
 */
import type { ProductCondition } from "@shopy/types";
import { getSupabase, publicImageUrl } from "../lib/supabase";
import {
  type CatalogCategory,
  type CatalogCollection,
  type CatalogProduct,
  type RemoteImage,
} from "./catalog";
import type { CatalogRepository, ProductFilters, ProductSort } from "./repository";

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
}

interface DbImageRow {
  storage_path: string;
  sort_order: number;
  is_cover: boolean;
  is_defect_detail: boolean;
}

const PRODUCT_COLUMNS = [
  "id", "slug", "name", "description", "brand_id", "category_id",
  "subcategory_id", "segment", "price_clp", "compare_at_price_clp",
  "condition", "size", "color", "stock", "published_at", "tags",
  "view_count", "favorite_count", "trending_score", "is_featured",
  "brand:brands(slug,name)",
].join(",");

export class SupabaseCatalogRepository implements CatalogRepository {
  private categoriesCache: CatalogCategory[] | null = null;
  private brandsCache: { slug: string; name: string; id?: string }[] | null = null;
  private categoriesById = new Map<string, string>();
  private brandIdBySlug = new Map<string, string>();

  private async taxonomy() {
    const supabase = getSupabase();
    if (!this.categoriesCache) {
      const { data, error } = await supabase
        .from("categories")
        .select("id,slug,name,parent_id")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      const idToSlug = new Map<string, string>();
      for (const c of data ?? []) idToSlug.set(c.id, c.slug);
      this.categoriesById = idToSlug;
      this.categoriesCache = (data ?? []).map((c) => ({
        slug: c.slug,
        name: c.name,
        parentSlug: c.parent_id ? (idToSlug.get(c.parent_id) ?? null) : null,
      }));
    }
    if (this.brandsCache === null) {
      const { data, error } = await supabase
        .from("brands")
        .select("id,slug,name")
        .order("name");
      if (error) throw error;
      this.brandsCache = data ?? [];
      this.brandIdBySlug = new Map((data ?? []).map((b) => [b.slug, b.id]));
    }
  }

  private toProduct(row: DbProductRow, images?: RemoteImage[]): CatalogProduct {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description ?? "",
      brand: row.brand?.name ?? "Sin marca",
      brandSlug: row.brand?.slug ?? "",
      categorySlug: (row.category_id && this.categoriesById.get(row.category_id)) ?? "",
      subcategorySlug:
        (row.subcategory_id && this.categoriesById.get(row.subcategory_id)) ?? null,
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
      remoteImages: images,
    };
  }

  private sortSpec(sort: ProductSort): { column: string; ascending: boolean } {
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

  async listProducts(sort: ProductSort = "tendencia"): Promise<CatalogProduct[]> {
    await this.taxonomy();
    const spec = this.sortSpec(sort);
    const { data, error } = await getSupabase()
      .from("products")
      .select(PRODUCT_COLUMNS)
      .not("published_at", "is", null)
      .neq("availability", "ARCHIVED")
      .order(spec.column, { ascending: spec.ascending });
    if (error) throw error;
    return (data as unknown as DbProductRow[]).map((r) => this.toProduct(r));
  }

  async getProduct(id: string): Promise<CatalogProduct | null> {
    await this.taxonomy();
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("products")
      .select(PRODUCT_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const row = data as unknown as DbProductRow;

    const { data: imgs, error: imgError } = await supabase
      .from("product_images")
      .select("storage_path,sort_order,is_cover,is_defect_detail")
      .eq("product_id", id)
      .order("sort_order");
    if (imgError) throw imgError;
    const images: RemoteImage[] = ((imgs ?? []) as DbImageRow[])
      .sort((a, b) => Number(b.is_cover) - Number(a.is_cover) || a.sort_order - b.sort_order)
      .map((i) => ({ url: publicImageUrl(i.storage_path), isDefect: i.is_defect_detail }));
    return this.toProduct(row, images);
  }

  async searchProducts(
    filters: ProductFilters,
    sort: ProductSort = "tendencia",
  ): Promise<CatalogProduct[]> {
    await this.taxonomy();
    const supabase = getSupabase();
    let query = supabase
      .from("products")
      .select(PRODUCT_COLUMNS)
      .not("published_at", "is", null)
      .neq("availability", "ARCHIVED");

    if (filters.query) {
      query = query.textSearch("search_vector", filters.query, {
        type: "plain",
        config: "spanish",
      });
    }
    if (filters.categorySlug && this.categoriesCache) {
      const wanted = filters.categorySlug;
      const children = this.categoriesCache
        .filter((c) => c.parentSlug === wanted)
        .map((c) => c.slug);
      const slugs = [wanted, ...children];
      const ids = [...this.categoriesById.entries()]
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
      const brandId = this.brandIdBySlug.get(filters.brandSlug);
      if (!brandId) return [];
      query = query.eq("brand_id", brandId);
    }
    if (filters.condition) query = query.eq("condition", filters.condition);
    if (filters.size) query = query.eq("size", filters.size);
    if (filters.maxPriceClp !== undefined) query = query.lte("price_clp", filters.maxPriceClp);

    const spec = this.sortSpec(sort);
    const { data, error } = await query.order(spec.column, { ascending: spec.ascending });
    if (error) throw error;
    return (data as unknown as DbProductRow[]).map((r) => this.toProduct(r));
  }

  async listCategories(): Promise<CatalogCategory[]> {
    await this.taxonomy();
    return this.categoriesCache ?? [];
  }

  async listBrands(): Promise<{ slug: string; name: string }[]> {
    await this.taxonomy();
    return (this.brandsCache ?? []).map(({ slug, name }) => ({ slug, name }));
  }

  async getCollection(slug: string): Promise<CatalogCollection | null> {
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

  async listSizes(): Promise<string[]> {
    const { data, error } = await getSupabase().from("products").select("size");
    if (error) throw error;
    return [...new Set((data ?? []).map((r: { size: string | null }) => r.size).filter(Boolean))] as string[];
  }
}
