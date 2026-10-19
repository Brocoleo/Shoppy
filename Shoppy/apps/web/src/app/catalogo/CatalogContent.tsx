"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  listBrands,
  listCategories,
  searchProducts,
  type ProductSort,
} from "../../lib/catalog";
import { EditorialListingHeader } from "../../components/EditorialListingHeader";
import { ProductCard, ProductGridSkeleton, PRODUCT_GRID_CLASS } from "../../components/ProductCard";
import {
  EmptyState,
  ErrorState,
  backendErrorMessage,
} from "../../components/States";

import { isSupabaseConfigured } from "../../lib/supabase-config";
import { SORTS, useCatalogFilters, type Tipo } from "./useCatalogFilters";

export default function CatalogContent({
  initialProducts,
}: {
  initialProducts?: import("../../lib/catalog").CatalogProduct[];
}) {
  const {
    query,
    tipo,
    categoria,
    marca,
    orden,
    filters,
    activeCount,
    hasFilters,
    setSearch,
    setCategoria,
    setMarca,
    setOrden,
    setTipo,
    clear,
    restoreSearchFocusRef,
  } = useCatalogFilters();

  const filterButton = useRef<HTMLButtonElement>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const key = JSON.stringify({ filters, orden });
  const results = useQuery({
    queryKey: ["web", "search", key],
    queryFn: () => searchProducts(filters, orden),
    initialData:
      !query && !categoria && !marca && orden === "novedades"
        ? initialProducts
        : undefined,
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

  if (!isSupabaseConfigured)
    return (
      <ErrorState message="La tienda no está disponible en este momento. Vuelve a intentarlo más tarde." />
    );

  const commercial =
    (results.data ?? []).filter(
      (p) => tipo !== "disponibles" || (p.stock > 0 && (p.availability ?? "AVAILABLE") === "AVAILABLE"),
    );
  const entries = commercial.map((product) => ({
    kind: "product" as const,
    product,
    date: product.publishedAt,
  }));
  if (orden === "novedades")
    entries.sort((a, b) => b.date.localeCompare(a.date));
  const pending = results.isPending;
  const failed = results.isError;

  const selects = (prefix: string) => (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-none">
        <label htmlFor={`${prefix}-categoria`} className="text-xs text-muted">
          Categoría
        </label>
        <select
          id={`${prefix}-categoria`}
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
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
          onChange={(e) => setMarca(e.target.value)}
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
            remove: () => setSearch(""),
          },
        ]
      : []),
    ...(categoria
      ? [
          {
            key: "categoria",
            label: `Categoría: ${categories.data?.find((item) => item.slug === categoria)?.name ?? categoria}`,
            remove: () => setCategoria(""),
          },
        ]
      : []),
    ...(marca
      ? [
          {
            key: "marca",
            label: `Marca: ${brands.data?.find((item) => item.slug === marca)?.name ?? marca}`,
            remove: () => setMarca(""),
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
            restoreSearchFocusRef.current = true;
            setSearch(
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
                setOrden(event.target.value as ProductSort)
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
                setOrden(event.target.value as ProductSort)
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
                  restoreSearchFocusRef.current = true;
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
              onClick={clear}
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
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={tipo === value}
            className={`min-h-11 px-4 text-sm ${tipo === value ? "bg-carbon text-ivory" : "border border-line"}`}
            onClick={() => setTipo(value as Tipo)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div
        className="min-h-[60vh]"
        aria-busy={results.isFetching}
      >
        {failed ? <ErrorState message={backendErrorMessage()} onRetry={() => void results.refetch()} /> : null}
        {pending && entries.length === 0 ? <ProductGridSkeleton/> : entries.length === 0 && !failed ? (
          <EmptyState
            message={
              hasFilters
                ? "Sin resultados con esos filtros."
                : "Todavía no hay prendas disponibles para compra."
            }
            action={
              hasFilters ? (
                <button onClick={clear} className="min-h-11 underline">
                  Limpiar filtros
                </button>
              ) : undefined
            }
          />
        ) : entries.length > 0 ? (
          <ul
            aria-label="Prendas"
            className={PRODUCT_GRID_CLASS}
          >
            {entries.map((item, index) => (
              <ProductCard
                key={item.product.id}
                product={item.product}
                loading={index < 4 ? "eager" : "lazy"}
              />
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
