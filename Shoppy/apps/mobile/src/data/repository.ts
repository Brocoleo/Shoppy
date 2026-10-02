/**
 * Repositorio de catálogo (Fase 3): interfaz + implementación mock.
 * En Fase 4 se agrega SupabaseCatalogRepository con la misma interfaz;
 * los hooks de TanStack Query no cambian.
 */
import type { ProductCondition } from "@shopy/types";
import {
  BRAND_LIST,
  CATEGORIES,
  COLLECTIONS,
  PRODUCTS,
  PRODUCT_MAP,
  type CatalogCategory,
  type CatalogCollection,
  type CatalogProduct,
} from "./catalog";

export type ProductSort = "tendencia" | "novedades" | "precio-asc" | "precio-desc";

export interface ProductFilters {
  query?: string;
  categorySlug?: string;
  brandSlug?: string;
  condition?: ProductCondition;
  size?: string;
  maxPriceClp?: number;
}

export interface CatalogRepository {
  listProducts(sort?: ProductSort): Promise<CatalogProduct[]>;
  getProduct(id: string): Promise<CatalogProduct | null>;
  searchProducts(filters: ProductFilters, sort?: ProductSort): Promise<CatalogProduct[]>;
  listCategories(): Promise<CatalogCategory[]>;
  listBrands(): Promise<{ slug: string; name: string }[]>;
  getCollection(slug: string): Promise<CatalogCollection | null>;
  listSizes(): Promise<string[]>;
}

const LATENCY_MS = 350;

function delay<T>(value: T, ms = LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function applySort(items: CatalogProduct[], sort: ProductSort = "tendencia"): CatalogProduct[] {
  const arr = [...items];
  switch (sort) {
    case "novedades":
      return arr.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    case "precio-asc":
      return arr.sort((a, b) => a.priceClp - b.priceClp);
    case "precio-desc":
      return arr.sort((a, b) => b.priceClp - a.priceClp);
    case "tendencia":
    default:
      return arr.sort((a, b) => b.trendingScore - a.trendingScore);
  }
}

function matchesQuery(p: CatalogProduct, q: string): boolean {
  const hay = `${p.name} ${p.brand} ${p.description} ${p.color} ${p.tags.join(" ")}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => hay.includes(token));
}

export class MockCatalogRepository implements CatalogRepository {
  async listProducts(sort: ProductSort = "tendencia"): Promise<CatalogProduct[]> {
    return delay(applySort(PRODUCTS, sort));
  }

  async getProduct(id: string): Promise<CatalogProduct | null> {
    return delay(PRODUCT_MAP[id] ?? null, 250);
  }

  async searchProducts(filters: ProductFilters, sort: ProductSort = "tendencia"): Promise<CatalogProduct[]> {
    const result = PRODUCTS.filter((p) => {
      if (filters.query && !matchesQuery(p, filters.query)) return false;
      if (filters.categorySlug) {
        const wanted = filters.categorySlug;
        const isParent = CATEGORIES.some((c) => c.parentSlug === wanted);
        const inCategory = p.categorySlug === wanted || p.subcategorySlug === wanted;
        const inChild = isParent && p.categorySlug === wanted;
        if (!inCategory && !inChild) return false;
      }
      if (filters.brandSlug && p.brandSlug !== filters.brandSlug) return false;
      if (filters.condition && p.condition !== filters.condition) return false;
      if (filters.size && p.size.toLowerCase() !== filters.size.toLowerCase()) return false;
      if (filters.maxPriceClp !== undefined && p.priceClp > filters.maxPriceClp) return false;
      return true;
    });
    return delay(applySort(result, sort), 300);
  }

  async listCategories(): Promise<CatalogCategory[]> {
    return delay(CATEGORIES, 200);
  }

  async listBrands(): Promise<{ slug: string; name: string }[]> {
    return delay(BRAND_LIST, 200);
  }

  async getCollection(slug: string): Promise<CatalogCollection | null> {
    return delay(COLLECTIONS.find((c) => c.slug === slug) ?? null, 250);
  }

  async listSizes(): Promise<string[]> {
    const sizes = [...new Set(PRODUCTS.map((p) => p.size))];
    return delay(sizes, 150);
  }
}

/** Instancia global mock; Fase 4 la reemplaza por inyección según env. */
import { isSupabaseConfigured } from "../lib/supabase";
import { SupabaseCatalogRepository } from "./SupabaseCatalogRepository";

function selectRepository(): CatalogRepository {
  if (isSupabaseConfigured) return new SupabaseCatalogRepository();
  return new MockCatalogRepository();
}

export const catalogRepository: CatalogRepository = selectRepository();
