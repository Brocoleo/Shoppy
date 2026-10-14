"use client";

import Image from "next/image";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatCLP } from "../../../lib/format";
import { getProductBySlug } from "../../../lib/catalog";
import { useCart } from "../../../lib/cart";
import { ErrorState, LoadingState, backendErrorMessage } from "../../../components/States";
import { isSupabaseConfigured } from "../../../lib/supabase";

const CONDITION_LABEL: Record<string, string> = {
  como_nuevo: "Como nuevo",
  excelente: "Excelente",
  bueno: "Bueno",
  con_detalles: "Con detalles",
};

export default function ProductoPage({ params }: { params: { slug: string } }) {
  const { add } = useCart();
  const [added, setAdded] = useState(false);
  const product = useQuery({
    queryKey: ["web", "product", params.slug],
    queryFn: () => getProductBySlug(params.slug),
    enabled: isSupabaseConfigured,
  });

  if (!isSupabaseConfigured) return <ErrorState message="Falta la configuración del backend (apps/web/.env.local)." />;
  if (product.isPending) return <LoadingState message="Cargando prenda…" />;
  if (product.isError) return <ErrorState message={backendErrorMessage()} onRetry={() => product.refetch()} />;
  if (!product.data) return <ErrorState message="Esta prenda ya no está disponible." />;

  const p = product.data;
  const images = p.remoteImages?.filter((i) => !i.isDefect) ?? [];
  const cover = images[0]?.url ?? null;
  const soldOut = p.stock <= 0;

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-zinc-100">
        {cover ? <Image src={cover} alt={p.name} fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" priority /> : null}
      </div>
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-sm uppercase tracking-wide text-zinc-500">{p.brand}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{p.name}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {CONDITION_LABEL[p.condition] ?? p.condition} · Talla {p.size}
            {p.color ? ` · ${p.color}` : ""}
          </p>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-bold">{formatCLP(p.priceClp)}</span>
          {p.compareAtPriceClp && p.compareAtPriceClp > p.priceClp ? (
            <span className="text-base text-zinc-400 line-through">{formatCLP(p.compareAtPriceClp)}</span>
          ) : null}
        </div>
        <p className={`text-sm font-medium ${soldOut ? "text-red-700" : "text-green-700"}`}>
          {soldOut ? "Agotada" : p.stock === 1 ? "¡Última unidad!" : `Stock: ${p.stock}`}
        </p>
        {p.description ? <p className="text-sm leading-relaxed text-zinc-700">{p.description}</p> : null}
        {p.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {p.tags.map((t) => (
              <span key={t} className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-600">
                #{t}
              </span>
            ))}
          </div>
        ) : null}
        <button
          type="button"
          disabled={soldOut}
          onClick={() => {
            add(p.id, 1);
            setAdded(true);
            setTimeout(() => setAdded(false), 2500);
          }}
          className="mt-2 h-11 rounded bg-zinc-900 text-sm font-semibold text-white disabled:opacity-40"
        >
          {soldOut ? "Agotada" : added ? "¡Agregada al carrito!" : "Agregar al carrito"}
        </button>
      </div>
    </div>
  );
}
