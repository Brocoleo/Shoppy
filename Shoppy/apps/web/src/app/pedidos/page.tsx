"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatCLP } from "../../lib/format";
import { listMyOrders } from "../../lib/checkout";
import { useSession } from "../../lib/session";
import { ErrorState, LoadingState, backendErrorMessage } from "../../components/States";
import { isSupabaseConfigured } from "../../lib/supabase-config";
import { loadGuestOrders, type GuestOrder } from "../../lib/guestOrders";

export default function PedidosPage() {
  const { user, loading } = useSession();
  // Pedidos de invitado guardados en este dispositivo: el invitado no tiene
  // cuenta y, sin esta lista, no podría volver a su pedido.
  const [guestOrders, setGuestOrders] = useState<GuestOrder[]>([]);
  useEffect(() => {
    setGuestOrders(loadGuestOrders());
  }, []);
  const orders = useQuery({
    // La clave incluye al usuario: la caché de una cuenta nunca se sirve a otra.
    queryKey: ["my-orders", user?.id ?? "guest"],
    queryFn: listMyOrders,
    enabled: isSupabaseConfigured && Boolean(user),
  });

  if (loading) return <LoadingState message="Cargando sesión…" />;
  if (!isSupabaseConfigured) return <ErrorState message="La tienda no está disponible en este momento. Vuelve a intentarlo más tarde." />;
  if (!user) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
        <h1 className="font-display text-3xl text-carbon">Mis pedidos</h1>
        <p className="text-sm text-muted">Entra a tu cuenta para ver tus pedidos, o rastrea un pedido como visita con tu código.</p>
        {guestOrders.length > 0 ? (
          <div className="w-full pt-4 text-left">
            <h2 className="font-display text-xl text-carbon">Tus pedidos como visita</h2>
            <ul className="mt-3 flex flex-col gap-2">
              {guestOrders.map((o) => (
                <li key={o.order_id}>
                  <Link
                    href={`/pedido/${encodeURIComponent(o.order_id)}?token=${encodeURIComponent(o.guest_token)}`}
                    className="flex items-center justify-between border border-line bg-ivory p-4 transition-colors hover:bg-parchment"
                  >
                    <span>
                      <span className="block font-display text-lg text-carbon">{o.order_number}</span>
                      <span className="block text-xs uppercase tracking-[0.14em] text-muted">
                        {new Date(o.created_at).toLocaleDateString("es-CL")}
                      </span>
                    </span>
                    <span className="text-sm uppercase tracking-[0.12em] text-carbon">Ver pedido</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="flex flex-wrap justify-center gap-3 pt-1">
          <Link href="/login" className="bg-carbon px-5 py-2.5 text-sm uppercase tracking-[0.12em] text-ivory transition-colors hover:bg-carbon-soft">
            Entrar
          </Link>
          <Link href="/pedido/guest" className="border border-carbon/30 px-5 py-2.5 text-sm uppercase tracking-[0.12em] text-carbon transition-colors hover:border-carbon">
            Rastrear pedido
          </Link>
        </div>
      </div>
    );
  }
  if (orders.isPending) return <LoadingState message="Cargando tus pedidos…" />;
  if (orders.isError) return <ErrorState message={backendErrorMessage()} onRetry={() => orders.refetch()} />;
  if (orders.data.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
        <h1 className="font-display text-3xl text-carbon">Aún no tienes pedidos</h1>
        <Link href="/catalogo" className="mt-1 bg-carbon px-5 py-2.5 text-sm uppercase tracking-[0.12em] text-ivory transition-colors hover:bg-carbon-soft">
          Explorar catálogo
        </Link>
      </div>
    );
  }
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="border-b border-carbon/20 pb-3 font-display text-3xl tracking-tight text-carbon">Mis pedidos</h1>
      <ul className="flex flex-col gap-3">
        {orders.data.map((o) => (
          <li key={o.id}>
            <Link href={`/pedido/${o.id}`} aria-label={`Pedido ${o.order_number}, ${o.status}, ${formatCLP(o.total_clp)}`} className="flex items-center justify-between border border-line bg-ivory p-4 transition-colors hover:bg-parchment">
              <span>
                <span className="block font-display text-lg text-carbon">{o.order_number}</span>
                <span className="block text-xs uppercase tracking-[0.14em] text-muted">
                  {o.status} · {new Date(o.created_at).toLocaleDateString("es-CL")}
                </span>
              </span>
              <span className="font-bold text-carbon">{formatCLP(o.total_clp)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
