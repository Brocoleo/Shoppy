"use client";

import Link from "next/link";
import { isExampleProduct } from "@shopy/shared/editorial";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatCLP, supabase } from "../../lib/supabase";
import { useModo } from "../../lib/modo";

interface Row {
  metadata?: Record<string, unknown> | null;
  id: string;
  slug: string;
  name: string;
  price_clp: number;
  stock: number;
  availability: string;
  is_featured: boolean;
  published_at: string | null;
}

async function fetchProducts(): Promise<Row[]> {
  const { data, error } = await supabase
    .from("products")
    .select("id,slug,name,price_clp,stock,availability,is_featured,published_at,metadata")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as Row[];
}

export default function ProductsPage() {
  const [tab, setTab] = useState("products");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const { includeTest } = useModo();
  const queryClient = useQueryClient();
  const { data: rows = [], isLoading, isError, refetch } = useQuery({ queryKey: ["admin-products"], queryFn: fetchProducts });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-products"] });

  const toggleArchive = useMutation({
    mutationFn: async (r: Row) => {
      const next = r.availability === "ARCHIVED" ? "AVAILABLE" : "ARCHIVED";
      const { error } = await supabase.from("products").update({ availability: next }).eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e) => setError(e instanceof Error ? e.message : "Error"),
  });

  const remove = useMutation({
    mutationFn: async (r: Row) => {
      const { error } = await supabase.from("products").delete().eq("id", r.id);
      if (error) throw new Error(`No se pudo eliminar: ${error.message}`);
    },
    onSuccess: refresh,
    onError: (e) => setError(e instanceof Error ? e.message : "Error"),
  });

  const activeTab = includeTest ? tab : "products";
  const filtered = rows.filter((r) => {
    if (isExampleProduct(r) !== (activeTab === "examples")) return false;
    if (filter !== "all" && r.availability !== filter) return false;
    if (q && !`${r.name} ${r.slug}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  const examplesCount = rows.filter((r) => isExampleProduct(r)).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Productos · {filtered.length}</h1>
        <Link href="/productos/nuevo" className="rounded-full bg-zinc-900 text-white px-5 min-h-11 text-sm font-semibold flex items-center">
          Nuevo producto
        </Link>
      </div>
      <p className="text-sm text-zinc-600">
        {includeTest ? (
          <>
            <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">Desarrollo</span>{" "}
            · reales + ejemplos de prueba
          </>
        ) : (
          <>
            <span className="inline-flex items-center rounded-full border border-green-300 bg-green-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-800">Producción</span>{" "}
            · solo prendas reales
            {examplesCount > 0
              ? ` · ${examplesCount} ejemplo${examplesCount === 1 ? "" : "s"} oculto${examplesCount === 1 ? "" : "s"} (cambia a Desarrollo arriba)`
              : ""}
          </>
        )}
      </p>
      <nav aria-label="Tipo de registro" className="flex gap-2">
        {[["products", "Productos"], ["examples", `Ejemplos${includeTest ? "" : ` (${examplesCount})`}`]].map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={activeTab === value}
            disabled={value === "examples" && !includeTest}
            onClick={() => setTab(value)}
            className={`min-h-11 px-4 ${activeTab === value ? "bg-zinc-900 text-white" : "border border-zinc-300"} disabled:cursor-not-allowed disabled:opacity-40`}
            title={value === "examples" && !includeTest ? "Cambia a modo Desarrollo para ver los ejemplos" : undefined}
          >
            {label}
          </button>
        ))}
      </nav>
      {activeTab === "examples" ? <p className="text-sm text-zinc-600">Registros de prueba. No están a la venta. Usa un ejemplo como base para preparar una prenda nueva.</p> : null}
      <div className="flex gap-2">
        <input
          aria-label="Buscar productos"
          placeholder="Buscar por nombre o slug…"
          className="rounded border border-zinc-300 px-3 h-11 text-sm min-w-0 flex-1"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select aria-label="Filtro estado" className="rounded border border-zinc-300 px-3 h-11 text-sm" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">Todos</option>
          <option value="AVAILABLE">Disponibles</option>
          <option value="RESERVED">Reservados</option>
          <option value="SOLD">Vendidos</option>
          <option value="ARCHIVED">Archivados</option>
        </select>
      </div>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {isLoading ? <p className="text-sm text-zinc-500">Cargando…</p> : null}
      {isError ? (
        <div className="rounded border border-red-200 bg-red-50 p-4 text-sm">
          <p className="font-medium text-red-800">No se pudieron cargar los productos</p>
          <p className="text-red-600">Revisa tu conexión y tu rol (RLS oculta el catálogo a no-admin si las policies lo exigen).</p>
          <button type="button" onClick={() => refetch()} className="mt-2 rounded bg-red-700 px-3 h-9 text-white text-sm">
            Reintentar
          </button>
        </div>
      ) : null}
      {!isLoading && !isError && filtered.length === 0 ? <p className="text-sm text-zinc-600">No hay registros en esta vista.</p> : null}
      <div className="rounded border border-zinc-200 bg-white divide-y divide-zinc-100">
        {filtered.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
            <div className="min-w-0 basis-full sm:flex-1 sm:basis-auto">
              <p className="font-medium truncate">{r.name}</p>
              <p className="break-words text-xs text-zinc-500">
                {r.slug} · {formatCLP(r.price_clp)} · stock {r.stock} · {r.availability}
                {isExampleProduct(r) ? " · Ejemplo, no publicable" : ""}
                {r.is_featured ? " · ★" : ""}
                {r.published_at ? "" : " · borrador"}
              </p>
            </div>
            <Link href={`/productos/${r.id}`} className="inline-flex min-h-11 items-center text-xs underline text-zinc-600">Editar</Link>
            {isExampleProduct(r) ? <Link href={`/productos/nuevo?base=${r.id}`} className="inline-flex min-h-11 items-center text-xs underline">Usar como base</Link> : <button onClick={() => toggleArchive.mutate(r)} className="inline-flex min-h-11 items-center text-xs underline text-zinc-600">
              {r.availability === "ARCHIVED" ? "Desarchivar" : "Archivar"}
            </button>}
            {!isExampleProduct(r) ? <button
              onClick={() => confirm(`Eliminar "${r.name}"? Solo si no tiene ventas asociadas.`) && remove.mutate(r)}
              className="min-h-11 text-xs underline text-red-700"
            >
              Eliminar
            </button> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
