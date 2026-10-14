"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCollection, getProductsByIds } from "../../../lib/catalog";
import { ProductGrid } from "../../../components/ProductCard";
import { ErrorState, LoadingState, backendErrorMessage } from "../../../components/States";
import { isSupabaseConfigured } from "../../../lib/supabase";

export default function ColeccionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const collection = useQuery({
    queryKey: ["web", "collection", slug],
    queryFn: () => getCollection(slug),
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
      <div className="border-b border-carbon/20 pb-3 sm:pb-4">
        <p className="text-[11px] uppercase tracking-[0.28em] text-taupe-deep">Colección</p>
        <h1 className="mt-1 font-display text-3xl tracking-tight text-carbon sm:text-4xl">{collection.data.name}</h1>
      </div>
      <ProductGrid products={products.data ?? []} />
    </div>
  );
}
