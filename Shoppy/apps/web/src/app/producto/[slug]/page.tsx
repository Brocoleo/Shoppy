"use client";

import Image from "next/image";
import { use, useState } from "react";
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

export default function ProductoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { add } = useCart();
  const [added, setAdded] = useState(false);
  const product = useQuery({
    queryKey: ["web", "product", slug],
    queryFn: () => getProductBySlug(slug),
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
  const onSale = (p.compareAtPriceClp ?? 0) > p.priceClp;

  return (
    <div className="grid gap-6 md:grid-cols-2 md:gap-10">
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-parchment">
        {cover ? <Image src={cover} alt={p.name} fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" priority /> : null}
        {onSale && !soldOut ? (
          <span className="absolute bottom-0 left-0 bg-carbon px-2 py-0.5 text-[11px] uppercase tracking-[0.14em] text-ivory">
            Oferta
          </span>
        ) : null}
        {soldOut ? (
          <span className="absolute inset-x-0 bottom-0 bg-carbon/80 py-1.5 text-center text-xs uppercase tracking-[0.14em] text-ivory">
            Agotada
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted">{p.brand}</p>
          <h1 className="mt-1 font-display text-3xl tracking-tight text-carbon sm:text-4xl">{p.name}</h1>
          <p className="mt-1.5 text-sm text-muted">
            Talla {p.size} · {CONDITION_LABEL[p.condition] ?? p.condition}
            {p.color ? ` · ${p.color}` : ""}
          </p>
        </div>
        <div className="flex items-baseline gap-3 border-y border-line py-3">
          <span className="text-3xl font-bold text-carbon">{formatCLP(p.priceClp)}</span>
          {onSale ? (
            <span className="text-base text-muted line-through">{formatCLP(p.compareAtPriceClp!)}</span>
          ) : null}
        </div>
        <p className={`text-sm font-medium ${soldOut ? "text-red-700" : "text-taupe-deep"}`}>
          {soldOut ? "Agotada" : p.stock === 1 ? "¡Última unidad!" : `Stock: ${p.stock}`}
        </p>
        {p.description ? <p className="text-sm leading-relaxed text-carbon/80">{p.description}</p> : null}
        {p.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {p.tags.map((t) => (
              <span key={t} className="bg-parchment px-2.5 py-1 text-xs text-muted">
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
          className="btn-press mt-2 h-12 bg-carbon text-sm uppercase tracking-[0.12em] text-ivory transition-colors hover:bg-carbon-soft disabled:opacity-40"
        >
          {soldOut ? "Agotada" : added ? "¡Agregada al carrito!" : "Agregar al carrito"}
        </button>
      </div>
    </div>
  );
}
