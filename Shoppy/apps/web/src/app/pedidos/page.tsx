"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { formatCLP } from "../../lib/format";
import { listMyOrders } from "../../lib/checkout";
import { useSession } from "../../lib/session";
import { ErrorState, LoadingState, backendErrorMessage } from "../../components/States";
import { isSupabaseConfigured } from "../../lib/supabase";

export default function PedidosPage() {
  const { user, loading } = useSession();
  const orders = useQuery({
    queryKey: ["my-orders"],
    queryFn: listMyOrders,
    enabled: isSupabaseConfigured && Boolean(user),
  });

  if (loading) return <LoadingState message="Cargando sesión…" />;
  if (!isSupabaseConfigured) return <ErrorState message="Falta la configuración del backend." />;
  if (!user) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
        <p className="text-lg font-bold">Mis pedidos</p>
        <p className="text-sm text-zinc-500">Entra a tu cuenta para ver tus pedidos, o rastrea un pedido guest con tu código.</p>
        <div className="flex gap-3">
          <Link href="/login" className="rounded bg-zinc-900 px-4 py-2 text-sm text-white">
            Entrar
          </Link>
          <Link href="/pedido/guest" className="rounded border border-zinc-300 px-4 py-2 text-sm">
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
        <p className="text-lg font-bold">Aún no tienes pedidos</p>
        <Link href="/catalogo" className="rounded bg-zinc-900 px-4 py-2 text-sm text-white">
          Explorar catálogo
        </Link>
      </div>
    );
  }
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3">
      <h1 className="text-2xl font-bold tracking-tight">Mis pedidos</h1>
      {orders.data.map((o) => (
        <Link key={o.id} href={`/pedido/${o.id}`} className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-4">
          <span>
            <span className="block font-semibold">{o.order_number}</span>
            <span className="block text-xs text-zinc-500">
              {o.status} · {new Date(o.created_at).toLocaleDateString("es-CL")}
            </span>
          </span>
          <span className="font-bold">{formatCLP(o.total_clp)}</span>
        </Link>
      ))}
    </div>
  );
}
