"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { QueryState } from "../../components/QueryState";

interface Row {
  id: string;
  key: string;
  title: string;
  config: unknown;
  is_active: boolean;
  sort_order: number;
}

async function fetchSections(): Promise<Row[]> {
  const { data, error } = await supabase.from("home_sections").select("*").order("sort_order");
  if (error) throw error;
  return (data ?? []) as Row[];
}

export default function HomeSectionsPage() {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const { data: rows = [], isLoading, isError, refetch } = useQuery({ queryKey: ["admin-home"], queryFn: fetchSections });

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight">Contenido del home</h1>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {saved ? <p className="text-sm text-green-700">Guardado.</p> : null}
      <QueryState isLoading={isLoading} isError={isError} isEmpty={!isLoading && !isError && rows.length === 0} emptyText="Sin secciones todavía." onRetry={() => refetch()} />
      {rows.map((r) => (
        <SectionEditor
          key={r.id}
          row={r}
          onError={setError}
          onSaved={() => setSaved(true)}
        />
      ))}
    </div>
  );
}

function SectionEditor({
  row,
  onError,
  onSaved,
}: {
  row: Row;
  onError: (msg: string | null) => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(row.title);
  const [active, setActive] = useState(row.is_active);
  const [order, setOrder] = useState(row.sort_order);
  const [configText, setConfigText] = useState(JSON.stringify(row.config, null, 2));

  const save = useMutation({
    mutationFn: async () => {
      let config: unknown;
      try {
        config = JSON.parse(configText);
      } catch {
        throw new Error(`JSON inválido en "${title}".`);
      }
      const { error } = await supabase
        .from("home_sections")
        .update({ title, is_active: active, sort_order: order, config })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      onError(null);
      onSaved();
      queryClient.invalidateQueries({ queryKey: ["admin-home"] });
    },
    onError: (e) => onError(e instanceof Error ? e.message : "Error"),
  });

  return (
    <section className="rounded border border-zinc-200 bg-white p-4 flex flex-col gap-2 text-sm">
      <p className="font-mono text-xs text-zinc-500">{row.key}</p>
      <div className="flex gap-2">
        <input aria-label={`Título ${row.key}`} className="rounded border border-zinc-300 px-3 h-10 flex-1" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input aria-label={`Orden ${row.key}`} type="number" className="rounded border border-zinc-300 px-3 h-10 w-20" value={order} onChange={(e) => setOrder(Number(e.target.value))} />
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Activa
        </label>
      </div>
      <textarea
        aria-label={`Config ${row.key}`}
        rows={4}
        className="rounded border border-zinc-300 px-3 py-2 font-mono text-xs"
        value={configText}
        onChange={(e) => setConfigText(e.target.value)}
      />
      <button
        onClick={() => save.mutate()}
        disabled={save.isPending}
        className="rounded-full bg-zinc-900 text-white px-5 h-10 text-sm font-semibold self-start disabled:opacity-50"
      >
        Guardar sección
      </button>
    </section>
  );
}
