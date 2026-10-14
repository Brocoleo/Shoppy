"use client";

import { useQuery } from "@tanstack/react-query";
import { getCollection, getProductsByIds } from "../../../lib/catalog";
import { ProductGrid } from "../../../components/ProductCard";
import { ErrorState, LoadingState, backendErrorMessage } from "../../../components/States";
import { isSupabaseConfigured } from "../../../lib/supabase";

export default function ColeccionPage({ params }: { params: { slug: string } }) {
  const collection = useQuery({
    queryKey: ["web", "collection", params.slug],
    queryFn: () => getCollection(params.slug),
    enabled: isSupabaseConfigured,
  });
  const ids = [...new Set(collection.data?.productIds ?? [])];
  const key = ids.join(",");
  const products = useQuery({
    queryKey: ["web", "products-by-ids", key],
    queryFn: () => getProductsByIds(ids),
    enabled: isSupabaseConfigured && ids.length > 0,
  });

  if (!isSupabaseConfigured) return <ErrorState message="Falta la configuración del backend (apps/web/.env.local)." />;
  if (collection.isPending) return <LoadingState message="Cargando colección…" />;
  if (collection.isError) return <ErrorState message={backendErrorMessage()} onRetry={() => collection.refetch()} />;
  if (!collection.data) return <ErrorState message="Colección no encontrada." />;
  if (products.isPending) return <LoadingState message="Cargando prendas…" />;
  if (products.isError) return <ErrorState message={backendErrorMessage()} onRetry={() => products.refetch()} />;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold tracking-tight">{collection.data.name}</h1>
      <ProductGrid products={products.data ?? []} />
    </div>
  );
}
