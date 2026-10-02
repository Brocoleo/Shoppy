import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: 1,
    },
  },
});

export const queryKeys = {
  products: (sort: string) => ["products", sort] as const,
  product: (id: string) => ["product", id] as const,
  search: (filters: object, sort: string) => ["search", filters, sort] as const,
  categories: ["categories"] as const,
  brands: ["brands"] as const,
  collection: (slug: string) => ["collection", slug] as const,
  sizes: ["sizes"] as const,
};
