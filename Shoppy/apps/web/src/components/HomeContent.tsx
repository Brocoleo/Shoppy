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
import { loadEditorial, editorialQueryKey } from "../lib/editorial";
import { ArchiveGrid } from "./ArchiveCard";
import { EditorialHero } from "./EditorialHero";
import { Reveal } from "./Reveal";
import { ProductGrid, ProductGridSkeleton } from "./ProductCard";
import { ErrorState, SectionTitle, backendErrorMessage } from "./States";
import { isSupabaseConfigured } from "../lib/supabase";

export default function HomeContent({
  initialProducts,
  initialEditorial,
}: {
  initialProducts?: import("../lib/catalog").CatalogProduct[];
  initialEditorial?: Awaited<ReturnType<typeof loadEditorial>>;
}) {
  const editorial = useQuery({
    queryKey: editorialQueryKey,
    queryFn: loadEditorial,
    initialData: initialEditorial,
  });
  const newcomers = useQuery({
    queryKey: ["web", "products", "novedades"],
    queryFn: () => listProducts("novedades"),
    initialData: initialProducts,
    enabled: isSupabaseConfigured,
  });
  const trending = useQuery({
    queryKey: ["web", "products", "tendencia"],
    queryFn: () => listProducts("tendencia"),
    enabled: isSupabaseConfigured,
  });
  const categories = useQuery({
    queryKey: ["web", "categories"],
    queryFn: listCategories,
    enabled: isSupabaseConfigured,
  });
  const brands = useQuery({
    queryKey: ["web", "brands"],
    queryFn: listBrands,
    enabled: isSupabaseConfigured,
  });
  const offers = useQuery({
    queryKey: ["web", "collection", "ofertas"],
    queryFn: () => getCollection("ofertas"),
    enabled: isSupabaseConfigured,
  });

  const offerIds = [...new Set(offers.data?.productIds ?? [])].slice(0, 8);
  const offerKey = offerIds.join(",");
  const offerProducts = useQuery({
    queryKey: ["web", "products-by-ids", offerKey],
    queryFn: () => getProductsByIds(offerIds),
    enabled: isSupabaseConfigured && offerIds.length > 0,
  });

  if (!isSupabaseConfigured) {
    return (
      <ErrorState message="La tienda no está disponible en este momento. Vuelve a intentarlo más tarde." />
    );
  }
  const parents = (categories.data ?? []).filter((c) => c.parentSlug === null);
  const topBrands = (brands.data ?? []).slice(0, 8);

  return (
    <div className="flex flex-col gap-12 sm:gap-16 md:gap-20">
      <EditorialHero config={editorial.data?.hero} />
      <section aria-labelledby="archivo-titulo">
        <SectionTitle
          id="archivo-titulo"
          title="Del archivo"
          action={
            <Link
              href="/catalogo?tipo=archivo"
              className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
            >
              Ver archivo
            </Link>
          }
        />
        <p className="mb-5 text-sm text-muted">
          Fotografías de Instagram. Estas prendas no están disponibles para
          compra.
        </p>
        {editorial.isPending ? (
          <ProductGridSkeleton />
        ) : editorial.isError ? (
          <ErrorState
            message="No pudimos cargar las fotografías."
            onRetry={() => editorial.refetch()}
          />
        ) : (
          <ArchiveGrid items={editorial.data.archive.slice(0, 8)} />
        )}
      </section>

      {newcomers.isPending ||
      newcomers.isError ||
      (newcomers.data?.length ?? 0) > 0 ? (
        <Reveal>
          <section aria-labelledby="novedades-titulo">
            <SectionTitle
              title="Novedades"
              id="novedades-titulo"
              action={
                <Link
                  href="/catalogo?orden=novedades"
                  className="text-sm text-muted underline underline-offset-4 hover:text-carbon"
                >
                  Ver todo
                </Link>
              }
            />
            {newcomers.isPending ? (
              <ProductGridSkeleton />
            ) : newcomers.isError ? (
              <ErrorState
                message={backendErrorMessage()}
                onRetry={() => newcomers.refetch()}
              />
            ) : (
              <ProductGrid products={(newcomers.data ?? []).slice(0, 8)} />
            )}
          </section>
        </Reveal>
      ) : null}

      {(newcomers.data?.length ?? 0) > 0 ? (
        <nav
          aria-label="Categorías"
          className="flex flex-wrap items-center gap-x-7 gap-y-2 border-y border-line py-5"
        >
          {categories.isPending
            ? Array.from({ length: 5 }, (_, index) => (
                <span
                  key={index}
                  aria-hidden="true"
                  className="shimmer h-11 w-20 animate-shimmer"
                />
              ))
            : parents.map((category) => (
                <Link
                  key={category.slug}
                  href={`/catalogo?categoria=${encodeURIComponent(category.slug)}`}
                  className="inline-flex min-h-11 items-center font-display text-2xl text-carbon underline-offset-8 hover:underline"
                >
                  {category.name}
                </Link>
              ))}
        </nav>
      ) : null}

      {offerProducts.data && offerProducts.data.length > 0 ? (
        <Reveal>
          <section
            aria-labelledby="ofertas-titulo"
            className="border-t border-line pt-8"
          >
            <SectionTitle
              title={offers.data?.name ?? "Ofertas"}
              id="ofertas-titulo"
              action={
                <Link
                  href="/coleccion/ofertas"
                  className="text-sm text-muted underline underline-offset-4 hover:text-carbon"
                >
                  Ver colección
                </Link>
              }
            />
            <ProductGrid products={offerProducts.data} />
          </section>
        </Reveal>
      ) : null}

      {trending.isPending ||
      trending.isError ||
      (trending.data?.length ?? 0) > 0 ? (
        <Reveal>
          <section aria-labelledby="tendencia-titulo">
            <SectionTitle title="Tendencia" id="tendencia-titulo" />
            {trending.isPending ? (
              <ProductGridSkeleton />
            ) : trending.isError ? (
              <ErrorState
                message={backendErrorMessage()}
                onRetry={() => trending.refetch()}
              />
            ) : (
              <ProductGrid products={(trending.data ?? []).slice(0, 8)} />
            )}
          </section>
        </Reveal>
      ) : null}

      {topBrands.length > 0 && (newcomers.data?.length ?? 0) > 0 ? (
        <Reveal>
          <section aria-labelledby="marcas-titulo">
            <SectionTitle title="Marcas" id="marcas-titulo" />
            <ul className="flex flex-wrap gap-2">
              {topBrands.map((b) => (
                <li key={b.slug}>
                  <Link
                    href={`/catalogo?marca=${encodeURIComponent(b.slug)}`}
                    className="inline-flex min-h-11 items-center px-3 py-1.5 text-sm text-carbon underline-offset-4 hover:underline"
                  >
                    {b.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </Reveal>
      ) : null}
    </div>
  );
}
