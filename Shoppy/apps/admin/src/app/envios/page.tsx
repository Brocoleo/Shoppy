"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatCLP, supabase } from "../../lib/supabase";
import { QueryState } from "../../components/QueryState";

interface Row {
  id: string;
  region: string;
  comuna: string | null;
  carrier: string;
  price_clp: number;
  eta_days_min: number | null;
  eta_days_max: number | null;
  is_active: boolean;
}

async function fetchRates(): Promise<Row[]> {
  const { data, error } = await supabase.from("shipping_rates").select("*").order("region").order("price_clp");
  if (error) throw error;
  return (data ?? []) as Row[];
}

export default function ShippingPage() {
  const [form, setForm] = useState({ region: "", comuna: "", carrier: "Chilexpress", price_clp: 3990, eta_min: "", eta_max: "" });
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { data: rows = [], isLoading, isError, refetch } = useQuery({ queryKey: ["admin-rates"], queryFn: fetchRates });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-rates"] });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.region.trim() || !form.carrier.trim()) throw new Error("Región y transportista son obligatorios.");
      const { error } = await supabase.from("shipping_rates").insert({
        region: form.region.trim(),
        comuna: form.comuna.trim() || null,
        carrier: form.carrier.trim(),
        price_clp: Math.max(0, Math.round(form.price_clp)),
        eta_days_min: form.eta_min === "" ? null : Number(form.eta_min),
        eta_days_max: form.eta_max === "" ? null : Number(form.eta_max),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setForm({ region: "", comuna: "", carrier: "Chilexpress", price_clp: 3990, eta_min: "", eta_max: "" });
      refresh();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Error"),
  });

  const toggle = useMutation({
    mutationFn: async (r: Row) => {
      const { error } = await supabase.from("shipping_rates").update({ is_active: !r.is_active }).eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e) => setError(e instanceof Error ? e.message : "Error"),
  });

  const remove = useMutation({
    mutationFn: async (r: Row) => {
      const { error } = await supabase.from("shipping_rates").delete().eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e) => setError(e instanceof Error ? e.message : "Error"),
  });

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight">Tarifas de despacho · {rows.length}</h1>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <QueryState isLoading={isLoading} isError={isError} isEmpty={!isLoading && !isError && rows.length === 0} emptyText="Sin tarifas todavía." onRetry={() => refetch()} />
      <div className="rounded border border-zinc-200 bg-white p-4 grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
        <input aria-label="Región" placeholder="Región (u OTRAS)" className="rounded border border-zinc-300 px-3 h-11" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} />
        <input aria-label="Comuna" placeholder="Comuna (vacío = toda)" className="rounded border border-zinc-300 px-3 h-11" value={form.comuna} onChange={(e) => setForm({ ...form, comuna: e.target.value })} />
        <input aria-label="Transportista" placeholder="Transportista" className="rounded border border-zinc-300 px-3 h-11" value={form.carrier} onChange={(e) => setForm({ ...form, carrier: e.target.value })} />
        <input aria-label="Precio" type="number" min={0} className="rounded border border-zinc-300 px-3 h-11" value={form.price_clp} onChange={(e) => setForm({ ...form, price_clp: Number(e.target.value) })} />
        <input aria-label="ETA mín" placeholder="ETA mín" className="rounded border border-zinc-300 px-3 h-11" value={form.eta_min} onChange={(e) => setForm({ ...form, eta_min: e.target.value })} />
        <input aria-label="ETA máx" placeholder="ETA máx" className="rounded border border-zinc-300 px-3 h-11" value={form.eta_max} onChange={(e) => setForm({ ...form, eta_max: e.target.value })} />
        <button onClick={() => create.mutate()} className="rounded-full bg-zinc-900 text-white px-5 h-11 text-sm font-semibold">Crear</button>
      </div>
      <div className="rounded border border-zinc-200 bg-white divide-y divide-zinc-100 text-sm">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-3 p-3">
            <span className="flex-1">
              <strong>{r.region}</strong>{r.comuna ? ` / ${r.comuna}` : ""} · {r.carrier} · {formatCLP(r.price_clp)}
              <span className="text-zinc-500"> · {r.eta_days_min ?? "?"}–{r.eta_days_max ?? "?"} días</span>
              {!r.is_active ? <span className="text-zinc-400"> · inactiva</span> : null}
            </span>
            <button className="text-xs underline" onClick={() => toggle.mutate(r)}>{r.is_active ? "Desactivar" : "Activar"}</button>
            <button className="text-xs underline text-red-700" onClick={() => confirm("Eliminar tarifa?") && remove.mutate(r)}>Eliminar</button>
          </div>
        ))}
      </div>
    </div>
  );
}
