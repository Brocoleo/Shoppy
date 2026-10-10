import { useQuery } from "@tanstack/react-query";
import { isSupabaseConfigured } from "../lib/supabase";
import { validateCart } from "../data/cartSync";
import type { CartLine } from "../stores/useShopStore";
import { queryKeys } from "./client";
import {
  catalogRepository,
  type ProductFilters,
  type ProductSort,
} from "../data/repository";

export function useProducts(sort: ProductSort = "tendencia") {
  return useQuery({
    queryKey: queryKeys.products(sort),
    queryFn: () => catalogRepository.listProducts(sort),
  });
}

export function useProduct(id: string) {
  return useQuery({
    queryKey: queryKeys.product(id),
    queryFn: () => catalogRepository.getProduct(id),
    enabled: id.length > 0,
  });
}

/** Colecciones/home: 1 sola query para N ids (evita N+1 y mejora fluidez). */
export function useProductsByIds(ids: string[]) {
  const key = [...ids].sort().join(",");
  return useQuery({
    queryKey: ["products-by-ids", key],
    queryFn: () => catalogRepository.getProductsByIds(ids),
    enabled: ids.length > 0,
    staleTime: 60_000,
  });
}

export function useSearchProducts(filters: ProductFilters, sort: ProductSort = "tendencia") {
  return useQuery({
    queryKey: queryKeys.search(filters, sort),
    queryFn: () => catalogRepository.searchProducts(filters, sort),
  });
}

export function useCategories() {
  return useQuery({
    queryKey: queryKeys.categories,
    queryFn: () => catalogRepository.listCategories(),
  });
}

export function useBrands() {
  return useQuery({
    queryKey: queryKeys.brands,
    queryFn: () => catalogRepository.listBrands(),
  });
}

export function useCollection(slug: string) {
  return useQuery({
    queryKey: queryKeys.collection(slug),
    queryFn: () => catalogRepository.getCollection(slug),
    enabled: slug.length > 0,
  });
}

export function useSizes() {
  return useQuery({
    queryKey: queryKeys.sizes,
    queryFn: () => catalogRepository.listSizes(),
  });
}

/**
 * Revalidación del carrito contra backend (Fase 5).
 * Sin backend: deshabilitado (la UI usa precios del catálogo local).
 */
export function useValidatedCart(lines: CartLine[]) {
  const signature = lines
    .map((l) => `${l.productId}:${l.qty}`)
    .sort()
    .join(",");
  return useQuery({
    queryKey: ["cart-validation", signature],
    queryFn: () => validateCart(lines),
    enabled: isSupabaseConfigured && lines.length > 0,
    staleTime: 30_000,
  });
}
