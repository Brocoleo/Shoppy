"use client";

import Link from "next/link";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  listBrands,
  listCategories,
  searchProducts,
  type ProductSort,
} from "../../lib/catalog";
import { EditorialListingHeader } from "../../components/EditorialListingHeader";
import { ProductCard, ProductGridSkeleton } from "../../components/ProductCard";
import {
  EmptyState,
  ErrorState,
  backendErrorMessage,
} from "../../components/States";
import { ArchiveCard } from "../../components/ArchiveCard";
import {
  loadEditorial,
  editorialQueryKey,
  filterArchive,
} from "../../lib/editorial";
import { isSupabaseConfigured } from "../../lib/supabase";

const SORTS: { value: ProductSort; label: string }[] = [
  { value: "tendencia", label: "Tendencia" },
  { value: "novedades", label: "Novedades" },
  { value: "precio-asc", label: "Menor precio" },
  { value: "precio-desc", label: "Mayor precio" },
];

export default function CatalogContent({
  initialEditorial,
  initialProducts,
}: {
  initialEditorial?: Awaited<ReturnType<typeof loadEditorial>>;
  initialProducts?: import("../../lib/catalog").CatalogProduct[];
}) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const query = params.get("q") ?? "";
  const tipo = ["disponibles", "archivo"].includes(params.get("tipo") ?? "")
    ? params.get("tipo")!
    : "todo";
  const editorial = useQuery({
    queryKey: editorialQueryKey,
    queryFn: loadEditorial,
    initialData: initialEditorial,
  });
  const categoria = params.get("categoria") ?? "";
  const marca = params.get("marca") ?? "";
  const orden =
    SORTS.find((sort) => sort.value === params.get("orden"))?.value ??
    "novedades";
  const filterButton = useRef<HTMLButtonElement>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const restoreSearchFocus = useRef(false);
  useEffect(() => {
    if (restoreSearchFocus.current) {
      document.getElementById("buscar-prenda")?.focus();
      restoreSearchFocus.current = false;
    }
  }, [query, categoria, marca]);

  const filters = useMemo(
    () => ({
      ...(query ? { query } : {}),
      ...(categoria ? { categorySlug: categoria } : {}),
      ...(marca ? { brandSlug: marca } : {}),
    }),
    [query, categoria, marca],
  );
  const key = JSON.stringify({ filters, orden });
  const results = useQuery({
    queryKey: ["web", "search", key],
    queryFn: () => searchProducts(filters, orden),
    initialData:
      !query && !categoria && !marca && orden === "novedades"
        ? initialProducts
        : undefined,
    enabled: isSupabaseConfigured && tipo !== "archivo",
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

  if (!isSupabaseConfigured)
    return (
      <ErrorState message="La tienda no está disponible en este momento. Vuelve a intentarlo más tarde." />
    );

  /** Refleja el estado de filtros en la URL (reemplazo, sin recargar). */
  const syncUrl = (next: {
    query: string;
    categoria: string;
    marca: string;
    orden: ProductSort;
  }) => {
    const sp = new URLSearchParams();
    if (tipo !== "todo") sp.set("tipo", tipo);
    if (next.query) sp.set("q", next.query);
    if (next.categoria) sp.set("categoria", next.categoria);
    if (next.marca) sp.set("marca", next.marca);
    if (next.orden !== "novedades") sp.set("orden", next.orden);
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const applySearch = (value: string) => {
    const next = value.trim();
    syncUrl({ query: next, categoria, marca, orden });
  };
  const applyCategoria = (value: string) => {
    syncUrl({ query, categoria: value, marca, orden });
  };
  const applyMarca = (value: string) => {
    syncUrl({ query, categoria, marca: value, orden });
  };
  const applyOrden = (value: ProductSort) => {
    syncUrl({ query, categoria, marca, orden: value });
  };

  const commercialFilter = Boolean(
    categoria || marca || orden.startsWith("precio"),
  );
  const archived =
    tipo === "disponibles" || commercialFilter
      ? []
      : filterArchive(editorial.data?.archive ?? [], query);
  const commercial =
    tipo === "archivo"
      ? []
      : (results.data ?? []).filter(
          (p) => tipo !== "disponibles" || (p.stock > 0 && (p.availability ?? "AVAILABLE") === "AVAILABLE"),
        );
  const entries = [
    ...commercial.map((product) => ({
      kind: "product" as const,
      product,
      date: product.publishedAt,
    })),
    ...archived.map((entry) => ({
      kind: "archive" as const,
      entry,
      date: entry.publishedAt ?? "",
    })),
  ];
  if (orden === "novedades")
    entries.sort((a, b) => b.date.localeCompare(a.date));
  const needsProducts = tipo !== "archivo";
  const needsArchive = tipo !== "disponibles" && !commercialFilter;
  const pending = (needsProducts && results.isPending) || (needsArchive && editorial.isPending);
  const failed = (needsProducts && results.isError) || (needsArchive && editorial.isError);
  const activeCount = (categoria ? 1 : 0) + (marca ? 1 : 0);
  const hasFilters = query !== "" || categoria !== "" || marca !== "";
  const clearFilters = () => {
    restoreSearchFocus.current = true;
    syncUrl({ query: "", categoria: "", marca: "", orden });
  };

  const selects = (prefix: string) => (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-none">
        <label htmlFor={`${prefix}-categoria`} className="text-xs text-muted">
          Categoría
        </label>
        <select
          id={`${prefix}-categoria`}
          value={categoria}
          onChange={(e) => applyCategoria(e.target.value)}
          className="h-11 w-full border-b border-carbon/40 bg-ivory px-2 text-sm text-carbon sm:w-auto"
        >
          <option value="">Todas</option>
          {(categories.data ?? []).map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-none">
        <label htmlFor={`${prefix}-marca`} className="text-xs text-muted">
          Marca
        </label>
        <select
          id={`${prefix}-marca`}
          value={marca}
          onChange={(e) => applyMarca(e.target.value)}
          className="h-11 w-full border-b border-carbon/40 bg-ivory px-2 text-sm text-carbon sm:w-auto"
        >
          <option value="">Todas</option>
          {(brands.data ?? []).map((b) => (
            <option key={b.slug} value={b.slug}>
              {b.name}
            </option>
          ))}
        </select>
      </span>
    </>
  );

  const activeFilters = [
    ...(query
      ? [
          {
            key: "query",
            label: `Búsqueda: ${query}`,
            remove: () => applySearch(""),
          },
        ]
      : []),
    ...(categoria
      ? [
          {
            key: "categoria",
            label: `Categoría: ${categories.data?.find((item) => item.slug === categoria)?.name ?? categoria}`,
            remove: () => applyCategoria(""),
          },
        ]
      : []),
    ...(marca
      ? [
          {
            key: "marca",
            label: `Marca: ${brands.data?.find((item) => item.slug === marca)?.name ?? marca}`,
            remove: () => applyMarca(""),
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-7 sm:gap-9">
      <EditorialListingHeader title="Catálogo" image="secundario">
        <p role="status" className="text-sm text-muted">
          {pending && !entries.length
            ? "Buscando prendas…"
            : failed && !entries.length
              ? ""
              : `${entries.length} ${entries.length === 1 ? "entrada" : "entradas"}`}
        </p>
      </EditorialListingHeader>

      <section
        aria-label="Buscar y filtrar prendas"
        className="flex flex-col gap-3 border-y border-line py-5"
      >
        <form
          role="search"
          aria-label="Buscar prendas"
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            restoreSearchFocus.current = true;
            applySearch(
              String(new FormData(event.currentTarget).get("q") ?? ""),
            );
          }}
        >
          <label htmlFor="buscar-prenda" className="sr-only">
            Buscar prendas
          </label>
          <input
            id="buscar-prenda"
            type="search"
            key={query}
            name="q"
            defaultValue={query}
            placeholder="Buscar prendas o marcas…"
            autoComplete="off"
            className="h-12 min-w-0 flex-1 border-b border-carbon/40 bg-ivory px-1 text-base text-carbon placeholder:text-muted focus:border-carbon"
          />
          <button
            type="submit"
            className="btn-press h-12 shrink-0 border-b border-carbon px-4 text-sm font-medium text-carbon hover:bg-parchment"
          >
            Buscar
          </button>
        </form>

        <div className="flex gap-2 sm:hidden">
          <button
            type="button"
            ref={filterButton}
            aria-expanded={panelOpen}
            aria-controls="panel-filtros"
            onClick={() => setPanelOpen((value) => !value)}
            className={`h-11 flex-1 border px-3 text-sm transition-colors ${panelOpen || activeCount > 0 ? "border-carbon bg-carbon text-ivory" : "border-carbon/40 text-carbon"}`}
          >
            Filtros{activeCount > 0 ? ` (${activeCount})` : ""}
          </button>
          <span className="flex h-11 min-w-0 flex-1 items-center gap-2 border border-carbon/40 px-2">
            <label htmlFor="orden-compacto" className="text-xs text-muted">
              Orden
            </label>
            <select
              id="orden-compacto"
              value={orden}
              onChange={(event) =>
                applyOrden(event.target.value as ProductSort)
              }
              className="h-full min-w-0 flex-1 bg-ivory text-sm text-carbon"
            >
              {SORTS.map((sort) => (
                <option key={sort.value} value={sort.value}>
                  {sort.label}
                </option>
              ))}
            </select>
          </span>
        </div>

        <div
          className={`disclosure sm:hidden ${panelOpen ? "disclosure-open" : ""}`}
        >
          <div>
            <fieldset
              id="panel-filtros"
              inert={!panelOpen}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setPanelOpen(false);
                  filterButton.current?.focus();
                }
              }}
              className="border border-line bg-parchment"
            >
              <legend className="sr-only">Filtrar por categoría y marca</legend>
              <div className="flex gap-3 p-3">{selects("panel-m")}</div>
            </fieldset>
          </div>
        </div>

        <fieldset className="hidden flex-wrap items-end gap-3 sm:flex">
          <legend className="sr-only">Filtrar y ordenar</legend>
          {selects("filtro")}
          <span className="flex flex-col gap-1">
            <label htmlFor="filtro-orden" className="text-xs text-muted">
              Orden
            </label>
            <select
              id="filtro-orden"
              value={orden}
              onChange={(event) =>
                applyOrden(event.target.value as ProductSort)
              }
              className="h-11 border-b border-carbon/40 bg-ivory px-3 text-sm text-carbon"
            >
              {SORTS.map((sort) => (
                <option key={sort.value} value={sort.value}>
                  {sort.label}
                </option>
              ))}
            </select>
          </span>
        </fieldset>

        {hasFilters ? (
          <div
            className="flex flex-wrap items-center gap-2"
            role="group"
            aria-label="Filtros activos"
          >
            {activeFilters.map((filter) => (
              <button
                key={filter.key}
                type="button"
                aria-label={`Quitar ${filter.label}`}
                onClick={() => {
                  restoreSearchFocus.current = true;
                  filter.remove();
                }}
                className="inline-flex min-h-11 max-w-full items-center gap-3 border border-line bg-parchment px-3 py-2 text-left text-sm text-carbon hover:border-carbon"
              >
                <span className="min-w-0 break-words">{filter.label}</span>
                <span
                  aria-hidden="true"
                  className="shrink-0 text-lg leading-none"
                >
                  ×
                </span>
              </button>
            ))}
            <button
              type="button"
              onClick={clearFilters}
              className="min-h-11 px-2 text-sm text-muted underline underline-offset-4 hover:text-carbon"
            >
              Limpiar filtros
            </button>
          </div>
        ) : null}
      </section>

      <nav
        aria-label="Tipo de prendas"
        className="flex gap-2 border-b border-line pb-3"
      >
        {[
          ["todo", "Todo"],
          ["disponibles", "Disponibles"],
          ["archivo", "Archivo"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={tipo === value}
            className={`min-h-11 px-4 text-sm ${tipo === value ? "bg-carbon text-ivory" : "border border-line"}`}
            onClick={() => {
              const sp = new URLSearchParams(params);
              if (value === "todo") sp.delete("tipo");
              else sp.set("tipo", value);
              router.push(`${pathname}?${sp}`, { scroll: false });
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      {commercialFilter && tipo !== "disponibles" ? (
        <p className="text-sm text-muted">
          El archivo no se incluye en filtros comerciales ni en la ordenación
          por precio: no tiene datos de venta confirmados.
        </p>
      ) : null}
      <div
        className="min-h-[60vh]"
        aria-busy={(needsProducts && results.isFetching) || (needsArchive && editorial.isFetching)}
      >
        {failed ? <ErrorState message={backendErrorMessage()} onRetry={()=>{
          if(needsProducts && results.isError)void results.refetch();
          if(needsArchive && editorial.isError)void editorial.refetch();
        }}/> : null}
        {pending && entries.length === 0 ? <ProductGridSkeleton/> : entries.length === 0 && !failed ? (
          <EmptyState
            message={
              hasFilters
                ? "Sin resultados con esos filtros."
                : tipo === "disponibles"
                  ? "Todavía no hay prendas disponibles para compra. Puedes explorar el archivo."
                  : "No hay prendas aquí por ahora."
            }
            action={
              hasFilters ? (
                <button onClick={clearFilters} className="min-h-11 underline">
                  Limpiar filtros
                </button>
              ) : tipo === "disponibles" ? <Link href="/catalogo?tipo=archivo" className="inline-flex min-h-11 items-center underline">Explorar archivo</Link> : undefined
            }
          />
        ) : entries.length > 0 ? (
          <ul
            aria-label="Prendas y archivo"
            className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-4"
          >
            {entries.map((item, index) =>
              item.kind === "archive" ? (
                <ArchiveCard
                  key={item.entry.id}
                  entry={item.entry}
                  eager={index < 4}
                />
              ) : (
                <ProductCard
                  key={item.product.id}
                  product={item.product}
                  eager={index < 4}
                />
              ),
            )}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
