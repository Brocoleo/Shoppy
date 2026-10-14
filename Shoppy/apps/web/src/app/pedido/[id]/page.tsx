"use client";

import { Suspense, useState } from "react";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { formatCLP } from "../../../lib/format";
import { getMyOrderDetail, trackGuestOrder } from "../../../lib/checkout";
import { useSession } from "../../../lib/session";
import { ErrorState, LoadingState, backendErrorMessage } from "../../../components/States";
import { isSupabaseConfigured } from "../../../lib/supabase";

export default function PedidoPage({ params }: { params: { id: string } }) {
  return (
    <Suspense fallback={<LoadingState message="Cargando pedido…" />}>
      <PedidoInner id={params.id} />
    </Suspense>
  );
}

function PedidoInner({ id }: { id: string }) {
  const search = useSearchParams();
  const { user, loading } = useSession();
  const [token, setToken] = useState(search.get("token") ?? "");
  const [submittedToken, setSubmittedToken] = useState<string | null>(search.get("token"));
  const guest = id === "guest" || !user;

  const authed = useQuery({
    queryKey: ["order-detail", id],
    queryFn: () => getMyOrderDetail(id),
    enabled: isSupabaseConfigured && Boolean(user) && id !== "guest",
  });
  const guestOrder = useQuery({
    queryKey: ["guest-order", id, submittedToken],
    queryFn: () => trackGuestOrder(id, submittedToken ?? ""),
    enabled: isSupabaseConfigured && guest && id !== "guest" && Boolean(submittedToken),
  });

  if (loading) return <LoadingState message="Cargando sesión…" />;
  if (!isSupabaseConfigured) return <ErrorState message="Falta la configuración del backend." />;

  if (id === "guest" || (guest && !submittedToken)) {
    return (
      <form
        className="mx-auto flex max-w-md flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          setSubmittedTokenFromForm(data, setSubmittedToken);
        }}
      >
        <h1 className="text-2xl font-bold tracking-tight">Rastrear pedido</h1>
        <p className="text-sm text-zinc-500">Ingresa el ID del pedido y el código que recibiste al comprar.</p>
        <GuestIdField defaultId={id === "guest" ? "" : id} />
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-500">Código guest</span>
          <input name="token" defaultValue={token} onChange={(e) => setToken(e.target.value)} placeholder="Código de rastreo" className="h-11 rounded border border-zinc-300 bg-white px-3" />
        </label>
        <button type="submit" className="h-11 rounded bg-zinc-900 text-sm font-semibold text-white">
          Rastrear
        </button>
      </form>
    );
  }

  if (!user) {
    if (guestOrder.isPending) return <LoadingState message="Buscando tu pedido…" />;
    if (guestOrder.isError) {
      return (
        <div className="mx-auto flex max-w-md flex-col gap-3">
          <ErrorState message="Pedido no encontrado. Verifica los datos." onRetry={() => guestOrder.refetch()} />
          <button type="button" onClick={() => setSubmittedToken(null)} className="text-sm text-zinc-500 underline">
            Probar con otro código
          </button>
        </div>
      );
    }
    const g = guestOrder.data;
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Pedido {g.order_number}</h1>
        <p className="text-sm">Estado: <strong>{g.status}</strong> · Total: <strong>{formatCLP(g.total_clp)}</strong></p>
        <Items items={g.items} />
      </div>
    );
  }

  if (authed.isPending) return <LoadingState message="Cargando pedido…" />;
  if (authed.isError) return <ErrorState message={backendErrorMessage()} onRetry={() => authed.refetch()} />;
  if (!authed.data) return <ErrorState message="Pedido no encontrado." />;
  const o = authed.data;
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight">Pedido {o.order_number}</h1>
      <dl className="rounded-lg bg-white p-4 text-sm">
        <div className="flex justify-between"><dt className="text-zinc-500">Estado</dt><dd className="font-semibold">{o.status}</dd></div>
        <div className="flex justify-between"><dt className="text-zinc-500">Fecha</dt><dd>{new Date(o.created_at).toLocaleString("es-CL")}</dd></div>
        <div className="flex justify-between"><dt className="text-zinc-500">Subtotal</dt><dd>{formatCLP(o.subtotal_clp)}</dd></div>
        {o.discount_clp > 0 ? <div className="flex justify-between"><dt className="text-zinc-500">Descuento</dt><dd>−{formatCLP(o.discount_clp)}</dd></div> : null}
        <div className="flex justify-between"><dt className="text-zinc-500">Despacho</dt><dd>{formatCLP(o.shipping_clp)}</dd></div>
        <div className="flex justify-between text-base font-bold"><dt>Total</dt><dd>{formatCLP(o.total_clp)}</dd></div>
        {o.carrier ? <div className="flex justify-between"><dt className="text-zinc-500">Carrier</dt><dd>{o.carrier}</dd></div> : null}
        {o.tracking_number ? <div className="flex justify-between"><dt className="text-zinc-500">Seguimiento</dt><dd>{o.tracking_number}</dd></div> : null}
      </dl>
      {o.tracking_url ? (
        <a href={o.tracking_url} target="_blank" rel="noreferrer" className="text-sm text-zinc-900 underline">
          Rastrear despacho
        </a>
      ) : null}
      <Items items={o.items} />
      {o.history.length > 0 ? (
        <div className="rounded-lg bg-white p-4 text-sm">
          <p className="mb-2 font-semibold">Historial</p>
          {o.history.map((h, i) => (
            <p key={i} className="text-zinc-600">
              {h.from_status ?? "—"} → {h.to_status} · {new Date(h.created_at).toLocaleString("es-CL")}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function setSubmittedTokenFromForm(data: FormData, set: (v: string | null) => void) {
  const id = String(data.get("orderId") ?? "");
  const token = String(data.get("token") ?? "");
  if (id) window.location.href = `/pedido/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`;
  else set(token || null);
}

function GuestIdField({ defaultId }: { defaultId: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-zinc-500">ID del pedido</span>
      <input name="orderId" defaultValue={defaultId} placeholder="UUID del pedido" className="h-11 rounded border border-zinc-300 bg-white px-3" />
    </label>
  );
}

function Items({ items }: { items: { product_slug: string; product_name: string; image_url: string | null; unit_price_clp: number; qty: number }[] }) {
  return (
    <div className="flex flex-col gap-2">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-3">
          {it.image_url ? (
            <Image src={it.image_url} alt={it.product_name} width={48} height={64} className="rounded object-cover" />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{it.product_name}</p>
            <p className="text-xs text-zinc-500">Cantidad: {it.qty}</p>
          </div>
          <p className="text-sm font-bold">{formatCLP(it.unit_price_clp * it.qty)}</p>
        </div>
      ))}
    </div>
  );
}
