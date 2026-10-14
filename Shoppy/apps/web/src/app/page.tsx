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
import { EditorialHero } from "../components/EditorialHero";
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

  const withImage = (newcomers.data ?? []).find((p) => (p.remoteImages ?? []).some((i) => !i.isDefect));
  const hero = withImage ?? newcomers.data?.[0] ?? trending.data?.[0];
  const parents = (categories.data ?? []).filter((c) => c.parentSlug === null);
  const topBrands = (brands.data ?? []).slice(0, 8);

  return (
    <div className="flex flex-col gap-8 sm:gap-12 md:gap-16">
      <EditorialHero product={hero} />

      {parents.length > 0 ? (
        <section aria-labelledby="categorias-titulo">
          <SectionTitle title="Categorías" id="categorias-titulo" />
          <ol className="divide-y divide-line border-y border-line">
            {parents.map((c, i) => (
              <li key={c.slug}>
                <Link
                  href={`/catalogo?categoria=${encodeURIComponent(c.slug)}`}
                  className="group flex items-baseline gap-4 py-3 transition-colors hover:bg-parchment"
                  aria-label={`Explorar categoría ${c.name}`}
                >
                  <span aria-hidden="true" className="w-8 shrink-0 font-display text-sm italic text-taupe-deep">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="flex-1 font-display text-2xl tracking-tight text-carbon sm:text-3xl">
                    {c.name}
                  </span>
                  <span aria-hidden="true" className="pr-1 text-muted transition-transform group-hover:translate-x-1">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section aria-labelledby="novedades-titulo">
        <SectionTitle
          title="Novedades"
          id="novedades-titulo"
          action={
            <Link href="/catalogo?orden=novedades" className="text-sm text-muted underline underline-offset-4 hover:text-carbon">
              Ver todas
            </Link>
          }
        />
        <ProductGrid products={(newcomers.data ?? []).slice(0, 8)} />
      </section>

      {offerProducts.data && offerProducts.data.length > 0 ? (
        <section aria-labelledby="ofertas-titulo" className="bg-parchment p-4 sm:p-8">
          <SectionTitle
            title={offers.data?.name ?? "Ofertas"}
            id="ofertas-titulo"
            action={
              <Link href="/coleccion/ofertas" className="text-sm text-muted underline underline-offset-4 hover:text-carbon">
                Ver colección
              </Link>
            }
          />
          <ProductGrid products={offerProducts.data} />
        </section>
      ) : null}

      <section aria-labelledby="tendencia-titulo">
        <SectionTitle title="Tendencia" id="tendencia-titulo" />
        <ProductGrid products={(trending.data ?? []).slice(0, 8)} />
      </section>

      {topBrands.length > 0 ? (
        <section aria-labelledby="marcas-titulo">
          <SectionTitle title="Marcas" id="marcas-titulo" />
          <ul className="flex flex-wrap gap-2">
            {topBrands.map((b) => (
              <li key={b.slug}>
                <Link
                  href={`/catalogo?marca=${encodeURIComponent(b.slug)}`}
                  className="block border border-carbon/30 px-4 py-1.5 font-display text-base italic text-carbon transition-colors hover:bg-carbon hover:text-ivory"
                >
                  {b.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
