"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";

interface Row {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

interface Member {
  product_id: string;
  slug: string;
}

async function fetchCollections(): Promise<{ cols: Row[]; members: Record<string, Member[]> }> {
  const { data: cols, error } = await supabase.from("collections").select("*").order("sort_order");
  if (error) throw error;
  const list = (cols ?? []) as Row[];
  const map: Record<string, Member[]> = {};
  for (const c of list) {
    const { data: items } = await supabase
      .from("collection_products")
      .select("product_id,products!inner(slug)")
      .eq("collection_id", c.id)
      .order("sort_order");
    map[c.id] = ((items ?? []) as unknown as { product_id: string; products: { slug: string } }[]).map((i) => ({
      product_id: i.product_id,
      slug: i.products.slug,
    }));
  }
  return { cols: list, members: map };
}

export default function CollectionsPage() {
  const [name, setName] = useState("");
  const [addSlug, setAddSlug] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin-collections"], queryFn: fetchCollections });
  const rows = data?.cols ?? [];
  const members = data?.members ?? {};
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-collections"] });

  const mutate = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => fn(),
    onSuccess: refresh,
    onError: (e) => setError(e instanceof Error ? e.message : "Error"),
  });

  const create = () => {
    if (!name.trim()) return;
    const slug = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    mutate.mutate(async () => {
      const { error } = await supabase.from("collections").insert({ slug, name: name.trim(), sort_order: rows.length * 10 });
      if (error) throw error;
      setName("");
    });
  };

  const addMember = (c: Row) => {
    const slug = (addSlug[c.id] ?? "").trim();
    if (!slug) return;
    mutate.mutate(async () => {
      const { data: product } = await supabase.from("products").select("id").eq("slug", slug).maybeSingle();
      if (!product) throw new Error(`Producto "${slug}" no existe.`);
      const { error } = await supabase.from("collection_products").insert({
        collection_id: c.id,
        product_id: (product as { id: string }).id,
        sort_order: (members[c.id] ?? []).length * 10,
      });
      if (error) throw error;
      setAddSlug({ ...addSlug, [c.id]: "" });
    });
  };

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight">Colecciones · {rows.length}</h1>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <div className="flex gap-2">
        <input aria-label="Nombre colección" placeholder="Nombre…" className="rounded border border-zinc-300 px-3 h-11 text-sm flex-1" value={name} onChange={(e) => setName(e.target.value)} />
        <button onClick={create} className="rounded-full bg-zinc-900 text-white px-5 h-11 text-sm font-semibold">Agregar</button>
      </div>
      {rows.map((c) => (
        <section key={c.id} className="rounded border border-zinc-200 bg-white p-4 text-sm">
          <p className="font-semibold">{c.name} <span className="text-zinc-400 font-normal">/{c.slug}</span></p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(members[c.id] ?? []).map((m) => (
              <span key={m.product_id} className="rounded-full border border-zinc-300 px-3 py-1 text-xs">
                {m.slug}{" "}
                <button
                  className="underline"
                  onClick={() =>
                    mutate.mutate(async () => {
                      const { error } = await supabase.from("collection_products").delete().eq("collection_id", c.id).eq("product_id", m.product_id);
                      if (error) throw error;
                    })
                  }
                >
                  quitar
                </button>
              </span>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              aria-label={`Agregar slug a ${c.name}`}
              placeholder="slug-del-producto…"
              className="rounded border border-zinc-300 px-3 h-10 text-sm flex-1"
              value={addSlug[c.id] ?? ""}
              onChange={(e) => setAddSlug({ ...addSlug, [c.id]: e.target.value })}
            />
            <button onClick={() => addMember(c)} className="rounded-full border border-zinc-300 px-4 h-10 text-sm">Agregar</button>
          </div>
        </section>
      ))}
    </div>
  );
}
