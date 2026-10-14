"use client";

import { Suspense, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { listBrands, listCategories, searchProducts, type ProductSort } from "../../lib/catalog";
import { ProductGrid } from "../../components/ProductCard";
import { ErrorState, LoadingState, backendErrorMessage } from "../../components/States";
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
  const [q, setQ] = useState(params.get("q") ?? "");
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [categoria, setCategoria] = useState(params.get("categoria") ?? "");
  const [marca, setMarca] = useState(params.get("marca") ?? "");
  const [orden, setOrden] = useState<ProductSort>((params.get("orden") as ProductSort) || "tendencia");

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

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold tracking-tight">Catálogo</h1>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(q.trim());
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar: chaqueta, Levi's, vestido…"
          className="h-10 flex-1 rounded border border-zinc-300 bg-white px-3 text-sm"
        />
        <button type="submit" className="h-10 rounded bg-zinc-900 px-4 text-sm text-white">
          Buscar
        </button>
      </form>
      <div className="flex flex-wrap gap-2">
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="h-9 rounded border border-zinc-300 bg-white px-2 text-sm">
          <option value="">Todas las categorías</option>
          {(categories.data ?? []).map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={marca} onChange={(e) => setMarca(e.target.value)} className="h-9 rounded border border-zinc-300 bg-white px-2 text-sm">
          <option value="">Todas las marcas</option>
          {(brands.data ?? []).map((b) => (
            <option key={b.slug} value={b.slug}>
              {b.name}
            </option>
          ))}
        </select>
        <select value={orden} onChange={(e) => setOrden(e.target.value as ProductSort)} className="h-9 rounded border border-zinc-300 bg-white px-2 text-sm">
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      {results.isPending ? (
        <LoadingState message="Buscando prendas…" />
      ) : results.isError ? (
        <ErrorState message={backendErrorMessage()} onRetry={() => results.refetch()} />
      ) : (
        <>
          <p className="text-sm text-zinc-500">{results.data.length} prenda(s)</p>
          <ProductGrid products={results.data} />
        </>
      )}
    </div>
  );
}
