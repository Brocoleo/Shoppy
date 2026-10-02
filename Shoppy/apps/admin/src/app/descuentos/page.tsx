"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatCLP, supabase } from "../../lib/supabase";

interface Row {
  id: string;
  code: string;
  kind: "percent" | "fixed";
  value: number;
  min_subtotal_clp: number;
  usage_limit: number | null;
  usage_count: number;
  is_active: boolean;
}

async function fetchDiscounts(): Promise<Row[]> {
  const { data, error } = await supabase.from("discounts").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Row[];
}

export default function DiscountsPage() {
  const [form, setForm] = useState({ code: "", kind: "percent" as "percent" | "fixed", value: 10, min_subtotal_clp: 0, usage_limit: "", is_active: true });
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { data: rows = [] } = useQuery({ queryKey: ["admin-discounts"], queryFn: fetchDiscounts });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-discounts"] });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.code.trim() || form.value <= 0) throw new Error("Código y valor mayor a 0 son obligatorios.");
      if (form.kind === "percent" && form.value > 100) throw new Error("El porcentaje no puede superar 100.");
      const { error } = await supabase.from("discounts").insert({
        code: form.code.trim().toUpperCase(),
        kind: form.kind,
        value: Math.round(form.value),
        min_subtotal_clp: Math.max(0, Math.round(form.min_subtotal_clp)),
        usage_limit: form.usage_limit === "" ? null : Math.max(1, Math.round(Number(form.usage_limit))),
        is_active: form.is_active,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setForm({ code: "", kind: "percent", value: 10, min_subtotal_clp: 0, usage_limit: "", is_active: true });
      refresh();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Error"),
  });

  const toggle = useMutation({
    mutationFn: async (r: Row) => {
      const { error } = await supabase.from("discounts").update({ is_active: !r.is_active }).eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e) => setError(e instanceof Error ? e.message : "Error"),
  });

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight">Descuentos · {rows.length}</h1>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <div className="rounded border border-zinc-200 bg-white p-4 grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
        <input aria-label="Código" placeholder="CÓDIGO" className="rounded border border-zinc-300 px-3 h-11 uppercase" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
        <select aria-label="Tipo" className="rounded border border-zinc-300 px-3 h-11" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as "percent" | "fixed" })}>
          <option value="percent">% Porcentaje</option>
          <option value="fixed">$ Monto fijo</option>
        </select>
        <input aria-label="Valor" type="number" min={1} className="rounded border border-zinc-300 px-3 h-11" value={form.value} onChange={(e) => setForm({ ...form, value: Number(e.target.value) })} />
        <input aria-label="Mínimo compra" type="number" min={0} placeholder="Mínimo CLP" className="rounded border border-zinc-300 px-3 h-11" value={form.min_subtotal_clp} onChange={(e) => setForm({ ...form, min_subtotal_clp: Number(e.target.value) })} />
        <input aria-label="Límite usos" placeholder="Límite (vacío = ∞)" className="rounded border border-zinc-300 px-3 h-11" value={form.usage_limit} onChange={(e) => setForm({ ...form, usage_limit: e.target.value })} />
        <button onClick={() => create.mutate()} className="rounded-full bg-zinc-900 text-white px-5 h-11 text-sm font-semibold">Crear</button>
      </div>
      <div className="rounded border border-zinc-200 bg-white divide-y divide-zinc-100 text-sm">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-3 p-3">
            <span className="flex-1">
              <strong>{r.code}</strong> · {r.kind === "percent" ? `${r.value}%` : formatCLP(r.value)}
              <span className="text-zinc-500"> · mín {formatCLP(r.min_subtotal_clp)} · usos {r.usage_count}{r.usage_limit ? `/${r.usage_limit}` : ""}</span>
              {!r.is_active ? <span className="text-zinc-400"> · inactivo</span> : null}
            </span>
            <button className="text-xs underline" onClick={() => toggle.mutate(r)}>{r.is_active ? "Desactivar" : "Activar"}</button>
          </div>
        ))}
      </div>
    </div>
  );
}
