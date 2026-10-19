import type { ProductCondition } from "@shopy/types";
import {
  parseMaterial,
  parseMeasurements,
  type MeasurementsCm,
} from "@shopy/shared/measurements";

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
  material: string | null;
  measurementsCm: MeasurementsCm;
  stock: number;
  availability?: string;
  publishedAt: string;
  tags: string[];
  viewCount: number;
  favoriteCount: number;
  trendingScore: number;
  isFeatured: boolean;
  isDemo?: boolean;
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

export interface DbProductRow {
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
  availability?: string;
  published_at: string | null;
  tags: string[] | null;
  view_count: number;
  favorite_count: number;
  trending_score: number | string;
  is_featured: boolean;
  metadata?: Record<string, unknown> | null;
  brand: { slug: string; name: string } | null;
  product_images: { storage_path: string; sort_order: number; is_cover: boolean; is_defect_detail: boolean }[] | null;
}

export const PRODUCT_COLUMNS = [
  "id", "slug", "name", "description", "brand_id", "category_id",
  "subcategory_id", "segment", "price_clp", "compare_at_price_clp",
  "condition", "size", "color", "stock", "availability", "published_at", "tags",
  "view_count", "favorite_count", "trending_score", "is_featured", "metadata",
  "brand:brands(slug,name)",
  "product_images(storage_path,sort_order,is_cover,is_defect_detail)",
].join(",");

function toImages(row: DbProductRow, imageUrl: (path: string) => string): RemoteImage[] | undefined {
  const imgs = row.product_images;
  if (!imgs || imgs.length === 0) return undefined;
  return [...imgs]
    .sort((a, b) => Number(b.is_cover) - Number(a.is_cover) || a.sort_order - b.sort_order)
    .map((i) => ({ url: imageUrl(i.storage_path), isDefect: i.is_defect_detail }));
}

export function mapProduct(row: DbProductRow, categoriesById: ReadonlyMap<string, string>, imageUrl: (path: string) => string): CatalogProduct {
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
    material: parseMaterial(row.metadata?.material),
    measurementsCm: parseMeasurements(row.metadata?.measurements_cm),
    stock: row.stock,
    availability: row.availability,
    publishedAt: row.published_at ?? new Date(0).toISOString(),
    tags: row.tags ?? [],
    viewCount: row.view_count,
    favoriteCount: row.favorite_count,
    trendingScore: Number(row.trending_score),
    isFeatured: row.is_featured,
    isDemo: row.metadata?.demo === true,
    remoteImages: toImages(row, imageUrl),
  };
}
