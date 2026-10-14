"use client";

import { Suspense, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { listBrands, listCategories, searchProducts, type ProductSort } from "../../lib/catalog";
import { ProductGrid, ProductGridSkeleton } from "../../components/ProductCard";
import { EmptyState, ErrorState, LoadingState, backendErrorMessage } from "../../components/States";
import { isSupabaseConfigured } from "../../lib/supabase";

const SORTS: { value: ProductSort; label: string }[] = [
  { value: "tendencia", label: "Tendencia" },
  { value: "novedades", label: "Novedades" },
  { value: "precio-asc", label: "Menor precio" },
  { value: "precio-desc", label: "Mayor precio" },
];

export default function CatalogoPage() {
  return (
    <Suspense fallback={<LoadingState message="Cargando catálogo…" />}>
      <CatalogoInner />
    </Suspense>
  );
}

function CatalogoInner() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [categoria, setCategoria] = useState(params.get("categoria") ?? "");
  const [marca, setMarca] = useState(params.get("marca") ?? "");
  const [orden, setOrden] = useState<ProductSort>((params.get("orden") as ProductSort) || "tendencia");
  const [panelOpen, setPanelOpen] = useState(false);

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
    enabled: isSupabaseConfigured,
  });
  const categories = useQuery({ queryKey: ["web", "categories"], queryFn: listCategories, enabled: isSupabaseConfigured });
  const brands = useQuery({ queryKey: ["web", "brands"], queryFn: listBrands, enabled: isSupabaseConfigured });

  if (!isSupabaseConfigured) return <ErrorState message="Falta la configuración del backend (apps/web/.env.local)." />;

  /** Refleja el estado de filtros en la URL (reemplazo, sin recargar). */
  const syncUrl = (next: { query: string; categoria: string; marca: string; orden: ProductSort }) => {
    const sp = new URLSearchParams();
    if (next.query) sp.set("q", next.query);
    if (next.categoria) sp.set("categoria", next.categoria);
    if (next.marca) sp.set("marca", next.marca);
    if (next.orden !== "tendencia") sp.set("orden", next.orden);
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const applySearch = (value: string) => {
    const next = value.trim();
    setQuery(next);
    syncUrl({ query: next, categoria, marca, orden });
  };
  const applyCategoria = (value: string) => {
    setCategoria(value);
    syncUrl({ query, categoria: value, marca, orden });
  };
  const applyMarca = (value: string) => {
    setMarca(value);
    syncUrl({ query, categoria, marca: value, orden });
  };
  const applyOrden = (value: ProductSort) => {
    setOrden(value);
    syncUrl({ query, categoria, marca, orden: value });
  };

  const activeCount = (categoria ? 1 : 0) + (marca ? 1 : 0);
  const hasFilters = query !== "" || categoria !== "" || marca !== "";
  const clearFilters = () => {
    setQ("");
    setQuery("");
    setCategoria("");
    setMarca("");
    syncUrl({ query: "", categoria: "", marca: "", orden });
  };

  const selects = (prefix: string) => (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-none">
        <label htmlFor={`${prefix}-categoria`} className="text-[11px] uppercase tracking-[0.18em] text-muted">
          Categoría
        </label>
        <select
          id={`${prefix}-categoria`}
          value={categoria}
          onChange={(e) => applyCategoria(e.target.value)}
          className="h-10 w-full border border-carbon/30 bg-ivory px-2 text-sm text-carbon sm:w-auto"
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
        <label htmlFor={`${prefix}-marca`} className="text-[11px] uppercase tracking-[0.18em] text-muted">
          Marca
        </label>
        <select
          id={`${prefix}-marca`}
          value={marca}
          onChange={(e) => applyMarca(e.target.value)}
          className="h-10 w-full border border-carbon/30 bg-ivory px-2 text-sm text-carbon sm:w-auto"
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

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <div className="border-b border-carbon/20 pb-3 sm:pb-4">
        <p className="text-[11px] uppercase tracking-[0.28em] text-taupe-deep">La tienda</p>
        <h1 className="mt-1 font-display text-3xl tracking-tight text-carbon sm:text-4xl">Catálogo</h1>
      </div>

      <form
        role="search"
        aria-label="Buscar prendas"
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          applySearch(q);
        }}
      >
        <label htmlFor="buscar-prenda" className="sr-only">
          Buscar prendas
        </label>
        <input
          id="buscar-prenda"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar: chaqueta, Levi's, vestido…"
          autoComplete="off"
          className="h-11 min-w-0 flex-1 border border-carbon/30 bg-ivory px-3 text-sm text-carbon placeholder:text-muted focus:border-carbon"
        />
        <button
          type="submit"
          className="h-11 shrink-0 bg-carbon px-4 text-xs uppercase tracking-[0.12em] text-ivory transition-colors hover:bg-carbon-soft sm:px-5 sm:text-sm"
        >
          Buscar
        </button>
      </form>

      {/* Barra compacta móvil: Filtros + Ordenar */}
      <div className="flex gap-2 sm:hidden">
        <button
          type="button"
          aria-expanded={panelOpen}
          aria-controls="panel-filtros"
          onClick={() => setPanelOpen((v) => !v)}
          className={`h-10 flex-1 border px-3 text-xs uppercase tracking-[0.12em] transition-colors ${panelOpen || activeCount > 0 ? "border-carbon bg-carbon text-ivory" : "border-carbon/30 text-carbon"}`}
        >
          Filtros{activeCount > 0 ? ` (${activeCount})` : ""}
        </button>
        <span className="flex h-10 flex-1 items-center gap-1 border border-carbon/30 px-2">
          <label htmlFor="orden-compacto" className="shrink-0 text-[11px] uppercase tracking-[0.14em] text-muted">
            Orden
          </label>
          <select
            id="orden-compacto"
            value={orden}
            onChange={(e) => applyOrden(e.target.value as ProductSort)}
            className="h-full min-w-0 flex-1 bg-transparent text-xs text-carbon"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </span>
      </div>

      {/* Panel de filtros móvil (colapsable y accesible) */}
      {panelOpen ? (
        <fieldset
          id="panel-filtros"
          onKeyDown={(e) => {
            if (e.key === "Escape") setPanelOpen(false);
          }}
          className="flex gap-3 border border-line bg-parchment p-3 sm:hidden"
        >
          <legend className="sr-only">Filtrar por categoría y marca</legend>
          {selects("panel-m")}
        </fieldset>
      ) : null}

      {/* Filtros desktop */}
      <fieldset className="hidden flex-wrap items-end gap-x-4 gap-y-3 sm:flex">
        <legend className="sr-only">Filtrar y ordenar</legend>
        {selects("filtro")}
        <span className="flex flex-col gap-1">
          <label htmlFor="filtro-orden" className="text-[11px] uppercase tracking-[0.18em] text-muted">
            Orden
          </label>
          <select
            id="filtro-orden"
            value={orden}
            onChange={(e) => applyOrden(e.target.value as ProductSort)}
            className="h-10 border border-carbon/30 bg-ivory px-2 text-sm text-carbon"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </span>
        {hasFilters ? (
          <button
            type="button"
            onClick={clearFilters}
            className="pb-2.5 text-sm text-muted underline underline-offset-4 hover:text-carbon"
          >
            Limpiar filtros
          </button>
        ) : null}
      </fieldset>
      {hasFilters && panelOpen ? (
        <button
          type="button"
          onClick={clearFilters}
          className="self-start text-sm text-muted underline underline-offset-4 hover:text-carbon sm:hidden"
        >
          Limpiar filtros
        </button>
      ) : null}

      {results.isPending ? (
        <ProductGridSkeleton />
      ) : results.isError ? (
        <ErrorState message={backendErrorMessage()} onRetry={() => results.refetch()} />
      ) : results.data.length === 0 ? (
        <EmptyState
          message={
            hasFilters
              ? "Sin resultados con esos filtros. Prueba con otra búsqueda o limpia los filtros."
              : "No hay prendas aquí por ahora."
          }
          action={
            hasFilters ? (
              <button
                type="button"
                onClick={clearFilters}
                className="border border-carbon/30 px-4 py-2 text-sm uppercase tracking-[0.12em] text-carbon hover:border-carbon"
              >
                Limpiar filtros
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
          <p role="status" className="text-sm text-muted">
            {results.data.length} prenda(s)
          </p>
          <ProductGrid products={results.data} />
        </>
      )}
    </div>
  );
}
