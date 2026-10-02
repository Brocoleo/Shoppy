"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatCLP, supabase } from "../../lib/supabase";

interface Row {
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
    .select("id,slug,name,price_clp,stock,availability,is_featured,published_at")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as Row[];
}

export default function ProductsPage() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { data: rows = [], isLoading } = useQuery({ queryKey: ["admin-products"], queryFn: fetchProducts });

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

  const filtered = rows.filter((r) => {
    if (filter !== "all" && r.availability !== filter) return false;
    if (q && !`${r.name} ${r.slug}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-baseline">
        <h1 className="text-2xl font-bold tracking-tight">Productos · {filtered.length}</h1>
        <Link href="/productos/nuevo" className="rounded-full bg-zinc-900 text-white px-5 h-10 text-sm font-semibold flex items-center">
          Nuevo producto
        </Link>
      </div>
      <div className="flex gap-2">
        <input
          aria-label="Buscar productos"
          placeholder="Buscar por nombre o slug…"
          className="rounded border border-zinc-300 px-3 h-11 text-sm flex-1"
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
      <div className="rounded border border-zinc-200 bg-white divide-y divide-zinc-100">
        {filtered.map((r) => (
          <div key={r.id} className="flex items-center gap-3 p-3 text-sm">
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{r.name}</p>
              <p className="text-xs text-zinc-500">
                {r.slug} · {formatCLP(r.price_clp)} · stock {r.stock} · {r.availability}
                {r.is_featured ? " · ★" : ""}
                {r.published_at ? "" : " · borrador"}
              </p>
            </div>
            <Link href={`/productos/${r.id}`} className="text-xs underline text-zinc-600">Editar</Link>
            <button onClick={() => toggleArchive.mutate(r)} className="text-xs underline text-zinc-600">
              {r.availability === "ARCHIVED" ? "Desarchivar" : "Archivar"}
            </button>
            <button
              onClick={() => confirm(`Eliminar "${r.name}"? Solo si no tiene ventas asociadas.`) && remove.mutate(r)}
              className="text-xs underline text-red-700"
            >
              Eliminar
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
