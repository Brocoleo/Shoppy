"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { QueryState, slugify } from "../../components/QueryState";

interface Row {
  id: string;
  slug: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  is_active: boolean;
}

async function fetchCategories(): Promise<Row[]> {
  const { data, error } = await supabase.from("categories").select("*").order("sort_order");
  if (error) throw error;
  return (data ?? []) as Row[];
}

export default function CategoriesPage() {
  const [name, setName] = useState("");
  const [parent, setParent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { data: rows = [], isLoading, isError, refetch } = useQuery({ queryKey: ["admin-categories"], queryFn: fetchCategories });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-categories"] });

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Nombre obligatorio.");
      const { error } = await supabase.from("categories").insert({
        slug: slugify(name),
        name: name.trim(),
        parent_id: parent || null,
        sort_order: rows.length * 10,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setName("");
      setParent("");
      refresh();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Error"),
  });

  const toggle = useMutation({
    mutationFn: async (r: Row) => {
      const { error } = await supabase.from("categories").update({ is_active: !r.is_active }).eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e) => setError(e instanceof Error ? e.message : "Error"),
  });

  const remove = useMutation({
    mutationFn: async (r: Row) => {
      const { error } = await supabase.from("categories").delete().eq("id", r.id);
      if (error) throw new Error(`No se pudo eliminar (¿tiene productos o hijos?): ${error.message}`);
    },
    onSuccess: refresh,
    onError: (e) => setError(e instanceof Error ? e.message : "Error"),
  });

  const parents = rows.filter((r) => !r.parent_id);

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight">Categorías · {rows.length}</h1>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <QueryState isLoading={isLoading} isError={isError} isEmpty={!isLoading && !isError && rows.length === 0} emptyText="Sin categorías todavía." onRetry={() => refetch()} />
      <div className="flex gap-2">
        <input aria-label="Nombre categoría" placeholder="Nombre…" className="rounded border border-zinc-300 px-3 h-11 text-sm flex-1" value={name} onChange={(e) => setName(e.target.value)} />
        <select aria-label="Padre" className="rounded border border-zinc-300 px-3 h-11 text-sm" value={parent} onChange={(e) => setParent(e.target.value)}>
          <option value="">Sin padre</option>
          {parents.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button onClick={() => create.mutate()} className="rounded-full bg-zinc-900 text-white px-5 h-11 text-sm font-semibold">Agregar</button>
      </div>
      <div className="rounded border border-zinc-200 bg-white divide-y divide-zinc-100 text-sm">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-3 p-3">
            <span className="flex-1">
              {r.parent_id ? <span className="text-zinc-400">↳ </span> : null}
              {r.name} <span className="text-zinc-400">/{r.slug}</span>
              {!r.is_active ? <span className="text-zinc-400"> · inactiva</span> : null}
            </span>
            <button className="text-xs underline" onClick={() => toggle.mutate(r)}>{r.is_active ? "Desactivar" : "Activar"}</button>
            <button className="text-xs underline text-red-700" onClick={() => confirm(`Eliminar "${r.name}"?`) && remove.mutate(r)}>Eliminar</button>
          </div>
        ))}
      </div>
    </div>
  );
}
