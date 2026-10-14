"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  getCollection,
  getProductsByIds,
  listBrands,
  listCategories,
  listProducts,
} from "../lib/catalog";
import { ProductGrid } from "../components/ProductCard";
import { ErrorState, LoadingState, SectionTitle, backendErrorMessage } from "../components/States";
import { isSupabaseConfigured } from "../lib/supabase";

export default function HomePage() {
  const newcomers = useQuery({ queryKey: ["web", "products", "novedades"], queryFn: () => listProducts("novedades"), enabled: isSupabaseConfigured });
  const trending = useQuery({ queryKey: ["web", "products", "tendencia"], queryFn: () => listProducts("tendencia"), enabled: isSupabaseConfigured });
  const categories = useQuery({ queryKey: ["web", "categories"], queryFn: listCategories, enabled: isSupabaseConfigured });
  const brands = useQuery({ queryKey: ["web", "brands"], queryFn: listBrands, enabled: isSupabaseConfigured });
  const offers = useQuery({ queryKey: ["web", "collection", "ofertas"], queryFn: () => getCollection("ofertas"), enabled: isSupabaseConfigured });

  const offerIds = [...new Set(offers.data?.productIds ?? [])].slice(0, 8);
  const offerKey = offerIds.join(",");
  const offerProducts = useQuery({
    queryKey: ["web", "products-by-ids", offerKey],
    queryFn: () => getProductsByIds(offerIds),
    enabled: isSupabaseConfigured && offerIds.length > 0,
  });

  if (!isSupabaseConfigured) {
    return <ErrorState message="Falta la configuración del backend (apps/web/.env.local)." />;
  }
  if (newcomers.isPending || trending.isPending) return <LoadingState message="Cargando la tienda…" />;
  if (newcomers.isError || trending.isError) {
    return (
      <ErrorState
        message={backendErrorMessage()}
        onRetry={() => {
          newcomers.refetch();
          trending.refetch();
        }}
      />
    );
  }

  const hero = newcomers.data?.[0] ?? trending.data?.[0];
  const parents = (categories.data ?? []).filter((c) => c.parentSlug === null);
  const topBrands = (brands.data ?? []).slice(0, 8);

  return (
    <div className="flex flex-col gap-10">
      <section className="overflow-hidden rounded-xl bg-zinc-900 p-8 text-white sm:p-12">
        <p className="text-sm uppercase tracking-widest text-zinc-300">Segunda mano verificada</p>
        <h1 className="mt-2 max-w-xl text-3xl font-bold tracking-tight sm:text-4xl">
          Prendas únicas, precios justos
        </h1>
        <p className="mt-2 max-w-xl text-sm text-zinc-300">
          {hero ? `Destacado: ${hero.name}.` : ""} Cada prenda es única: si te gusta, no la dejes pasar.
        </p>
        <div className="mt-5 flex gap-3">
          <Link href="/catalogo" className="rounded bg-white px-4 py-2 text-sm font-semibold text-zinc-900">
            Ver catálogo
          </Link>
          <Link href="/coleccion/ofertas" className="rounded border border-zinc-600 px-4 py-2 text-sm text-white">
            Ver ofertas
          </Link>
        </div>
      </section>

      {parents.length > 0 ? (
        <section>
          <SectionTitle title="Categorías" />
          <div className="flex flex-wrap gap-2">
            {parents.map((c) => (
              <Link
                key={c.slug}
                href={`/catalogo?categoria=${encodeURIComponent(c.slug)}`}
                className="rounded-full border border-zinc-300 bg-white px-4 py-1.5 text-sm hover:border-zinc-900"
              >
                {c.name}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <SectionTitle
          title="Novedades"
          action={
            <Link href="/catalogo?orden=novedades" className="text-sm text-zinc-500 underline">
              Ver todas
            </Link>
          }
        />
        <ProductGrid products={(newcomers.data ?? []).slice(0, 8)} />
      </section>

      {offerProducts.data && offerProducts.data.length > 0 ? (
        <section>
          <SectionTitle
            title={offers.data?.name ?? "Ofertas"}
            action={
              <Link href="/coleccion/ofertas" className="text-sm text-zinc-500 underline">
                Ver colección
              </Link>
            }
          />
          <ProductGrid products={offerProducts.data} />
        </section>
      ) : null}

      <section>
        <SectionTitle title="Tendencia" />
        <ProductGrid products={(trending.data ?? []).slice(0, 8)} />
      </section>

      {topBrands.length > 0 ? (
        <section>
          <SectionTitle title="Marcas" />
          <div className="flex flex-wrap gap-2">
            {topBrands.map((b) => (
              <Link
                key={b.slug}
                href={`/catalogo?marca=${encodeURIComponent(b.slug)}`}
                className="rounded-full bg-zinc-900 px-4 py-1.5 text-sm text-white"
              >
                {b.name}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
