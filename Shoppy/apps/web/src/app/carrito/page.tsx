"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { formatCLP } from "../../lib/format";
import { useCart } from "../../lib/cart";
import { getProductsByIds } from "../../lib/catalog";
import { ErrorState, LoadingState, backendErrorMessage } from "../../components/States";
import { isSupabaseConfigured } from "../../lib/supabase";

export default function CarritoPage() {
  const { lines, setQty, remove, clear } = useCart();
  const ids = lines.map((l) => l.productId);
  const key = [...ids].sort().join(",");
  const products = useQuery({
    queryKey: ["web", "products-by-ids", key],
    queryFn: () => getProductsByIds(ids),
    enabled: isSupabaseConfigured && ids.length > 0,
  });

  if (!isSupabaseConfigured) return <ErrorState message="Falta la configuración del backend (apps/web/.env.local)." />;

  if (lines.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
        <p className="text-lg font-bold">Tu carrito está vacío</p>
        <p className="text-sm text-zinc-500">Explora el catálogo: cada prenda es única.</p>
        <Link href="/catalogo" className="rounded bg-zinc-900 px-4 py-2 text-sm text-white">
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
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Carrito</h1>
        <button type="button" onClick={clear} className="text-sm text-zinc-500 underline">
          Vaciar
        </button>
      </div>
      {lines.map((l) => {
        const p = byId.get(l.productId);
        return (
          <div key={l.productId} className="flex gap-4 rounded-lg border border-zinc-200 bg-white p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{p?.name ?? "Prenda no disponible"}</p>
              <p className="text-xs text-zinc-500">
                {p ? `${p.brand} · Talla ${p.size}` : "Ya no se puede comprar"}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <button type="button" aria-label="Quitar uno" onClick={() => setQty(l.productId, l.qty - 1)} className="h-8 w-8 rounded border border-zinc-300">
                  −
                </button>
                <span className="w-6 text-center text-sm">{l.qty}</span>
                <button type="button" aria-label="Agregar uno" onClick={() => setQty(l.productId, l.qty + 1)} className="h-8 w-8 rounded border border-zinc-300">
                  +
                </button>
                <button type="button" onClick={() => remove(l.productId)} className="ml-2 text-sm text-zinc-500 underline">
                  Quitar
                </button>
              </div>
            </div>
            <p className="text-sm font-bold">{formatCLP((p?.priceClp ?? 0) * l.qty)}</p>
          </div>
        );
      })}
      <div className="flex items-center justify-between rounded-lg bg-zinc-900 p-4 text-white">
        <span className="text-sm">Subtotal</span>
        <span className="text-xl font-bold">{formatCLP(total)}</span>
      </div>
      <p className="text-xs text-zinc-500">El despacho y los descuentos se calculan en el checkout.</p>
      <Link href="/checkout" className="rounded bg-zinc-900 py-3 text-center text-sm font-semibold text-white">
        Ir al checkout
      </Link>
    </div>
  );
}
