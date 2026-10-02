"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";

interface Row {
  id: string;
  slug: string;
  name: string;
}

async function fetchBrands(): Promise<Row[]> {
  const { data, error } = await supabase.from("brands").select("*").order("name");
  if (error) throw error;
  return (data ?? []) as Row[];
}

export default function BrandsPage() {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { data: rows = [] } = useQuery({ queryKey: ["admin-brands"], queryFn: fetchBrands });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-brands"] });

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Nombre obligatorio.");
      const slug = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      const { error } = await supabase.from("brands").insert({ slug, name: name.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      setName("");
      refresh();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Error"),
  });

  const remove = useMutation({
    mutationFn: async (r: Row) => {
      const { error } = await supabase.from("brands").delete().eq("id", r.id);
      if (error) throw new Error(`No se pudo eliminar (¿tiene productos?): ${error.message}`);
    },
    onSuccess: refresh,
    onError: (e) => setError(e instanceof Error ? e.message : "Error"),
  });

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight">Marcas · {rows.length}</h1>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <div className="flex gap-2">
        <input aria-label="Nombre marca" placeholder="Nombre…" className="rounded border border-zinc-300 px-3 h-11 text-sm flex-1" value={name} onChange={(e) => setName(e.target.value)} />
        <button onClick={() => create.mutate()} className="rounded-full bg-zinc-900 text-white px-5 h-11 text-sm font-semibold">Agregar</button>
      </div>
      <div className="rounded border border-zinc-200 bg-white divide-y divide-zinc-100 text-sm">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-3 p-3">
            <span className="flex-1">{r.name} <span className="text-zinc-400">/{r.slug}</span></span>
            <button className="text-xs underline text-red-700" onClick={() => confirm(`Eliminar "${r.name}"?`) && remove.mutate(r)}>Eliminar</button>
          </div>
        ))}
      </div>
    </div>
  );
}
