"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { formatCLP } from "../../lib/format";
import { useCart } from "../../lib/cart";
import { getProductsByIds } from "../../lib/catalog";
import { ErrorState, LoadingState, backendErrorMessage } from "../../components/States";
import { isSupabaseConfigured } from "../../lib/supabase";

export default function CarritoPage() {
  const { lines, ready, setQty, remove, clear } = useCart();
  const ids = lines.map((l) => l.productId);
  const key = [...ids].sort().join(",");
  const products = useQuery({
    queryKey: ["web", "products-by-ids", key],
    queryFn: () => getProductsByIds(ids),
    enabled: isSupabaseConfigured && ids.length > 0,
  });

  if (!isSupabaseConfigured) return <ErrorState message="La tienda no está disponible en este momento. Vuelve a intentarlo más tarde." />;

  if (!ready) return <LoadingState message="Cargando tu carrito…" />;

  if (lines.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
        <h1 className="font-display text-3xl text-carbon">Tu carrito está vacío</h1>
        <p className="text-sm text-muted">Explora el catálogo: cada prenda es única.</p>
        <Link href="/catalogo" className="mt-1 bg-carbon px-5 py-2.5 text-sm uppercase tracking-[0.12em] text-ivory transition-colors hover:bg-carbon-soft">
          Explorar catálogo
        </Link>
      </div>
    );
  }

  if (products.isPending) return <LoadingState message="Cargando tu carrito…" />;
  if (products.isError) return <ErrorState message={backendErrorMessage()} onRetry={() => products.refetch()} />;

  const byId = new Map((products.data ?? []).map((p) => [p.id, p]));
  const total = lines.reduce((n, l) => n + (byId.get(l.productId)?.priceClp ?? 0) * l.qty, 0);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 sm:gap-5">
      <div className="flex items-baseline justify-between border-b border-carbon/20 pb-3">
        <h1 className="font-display text-3xl tracking-tight text-carbon">Carrito</h1>
        <button type="button" onClick={clear} className="text-sm text-muted underline underline-offset-4 hover:text-carbon">
          Vaciar
        </button>
      </div>
      {lines.map((l) => {
        const p = byId.get(l.productId);
        return (
          <div key={l.productId} className="flex gap-4 border border-line bg-ivory p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-base text-carbon">{p?.name ?? "Prenda no disponible"}</p>
              <p className="text-xs uppercase tracking-[0.14em] text-muted">
                {p ? `${p.brand} · Talla ${p.size}` : "Ya no se puede comprar"}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <button type="button" aria-label={`Quitar una unidad de ${p?.name ?? "la prenda"}`} onClick={() => setQty(l.productId, l.qty - 1)} className="h-11 w-11 shrink-0 border border-carbon/30 text-carbon transition-colors hover:border-carbon">
                  −
                </button>
                <span className="w-6 text-center text-sm text-carbon" role="status" aria-label="Cantidad">{l.qty}</span>
                <button type="button" aria-label={`Agregar una unidad de ${p?.name ?? "la prenda"}`} onClick={() => setQty(l.productId, l.qty + 1)} className="h-11 w-11 shrink-0 border border-carbon/30 text-carbon transition-colors hover:border-carbon">
                  +
                </button>
                <button type="button" onClick={() => remove(l.productId)} className="ml-2 text-sm text-muted underline underline-offset-4 hover:text-carbon">
                  Quitar
                </button>
              </div>
            </div>
            <p className="shrink-0 text-sm font-bold text-carbon">{formatCLP((p?.priceClp ?? 0) * l.qty)}</p>
          </div>
        );
      })}
      <div className="flex items-center justify-between bg-carbon p-4 text-ivory">
        <span className="text-xs uppercase tracking-[0.18em] text-ivory/70">Subtotal</span>
        <span className="font-display text-2xl">{formatCLP(total)}</span>
      </div>
      <p className="text-xs text-muted">El despacho y los descuentos se calculan en el checkout.</p>
      <Link href="/checkout" className="btn-press bg-carbon py-3.5 text-center text-sm uppercase tracking-[0.12em] text-ivory transition-colors hover:bg-carbon-soft">
        Ir al checkout
      </Link>
    </div>
  );
}
