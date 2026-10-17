"use client";

import Link from "next/link";
import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCollection, getProductsByIds } from "../../../lib/catalog";
import { EditorialListingHeader } from "../../../components/EditorialListingHeader";
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

  if (!isSupabaseConfigured) return <ErrorState message="La tienda no está disponible en este momento. Vuelve a intentarlo más tarde." />;
  if (collection.isPending) return <LoadingState message="Cargando colección…" />;
  if (collection.isError) return <ErrorState message={backendErrorMessage()} onRetry={() => collection.refetch()} />;
  if (!collection.data) return <ErrorState message="Colección no encontrada." />;
  if (ids.length > 0 && products.isPending) return <LoadingState message="Cargando prendas…" />;
  if (products.isError) return <ErrorState message={backendErrorMessage()} onRetry={() => products.refetch()} />;

  return (
    <div className="flex flex-col gap-8 sm:gap-10">
      <EditorialListingHeader title={collection.data.name} image="principal">
        <p className="text-sm text-muted">{products.data?.length ?? 0} prendas en esta colección</p>
      </EditorialListingHeader>
      {(products.data?.length ?? 0) > 0 ? <ProductGrid products={products.data ?? []} eager /> : <section className="border-y border-line py-10 text-center">
        <h2 className="font-display text-2xl">{slug === "ofertas" ? "Todavía no hay ofertas disponibles" : "Esta colección todavía no tiene prendas disponibles"}</h2>
        <p className="mt-3 text-sm text-muted">Puedes explorar las fotografías reales del archivo de Instagram. No están disponibles para compra.</p>
        <Link href="/catalogo?tipo=archivo" className="mt-5 inline-flex min-h-11 items-center underline">Explorar archivo</Link>
      </section>}
    </div>
  );
}
