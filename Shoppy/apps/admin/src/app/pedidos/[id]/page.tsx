"use client";

import { use, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatCLP, supabase } from "../../../lib/supabase";

const NEXT: Record<string, string[]> = {
  PENDING_PAYMENT: ["CANCELLED"],
  PAID: ["PREPARING", "CANCELLED", "REFUNDED"],
  PREPARING: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: ["REFUNDED"],
  CANCELLED: [],
  REFUNDED: [],
};

const NOTIFY_EVENT: Record<string, string> = {
  PREPARING: "order_preparing",
  SHIPPED: "order_shipped",
  DELIVERED: "order_delivered",
  CANCELLED: "order_cancelled",
  REFUNDED: "order_refunded",
};

interface Item {
  product_slug: string;
  product_name: string;
  unit_price_clp: number;
  qty: number;
}

interface History {
  from_status: string | null;
  to_status: string;
  created_at: string;
}

interface Shipment {
  carrier: string;
  tracking_number: string;
  tracking_url: string;
}

async function fetchDetail(id: string) {
  const [{ data: o, error: oErr }, { data: it }, { data: h }, { data: s }] = await Promise.all([
    supabase.from("orders").select("*").eq("id", id).maybeSingle(),
    supabase.from("order_items").select("product_slug,product_name,unit_price_clp,qty").eq("order_id", id),
    supabase.from("order_status_history").select("from_status,to_status,created_at").eq("order_id", id).order("created_at"),
    supabase.from("shipments").select("carrier,tracking_number,tracking_url").eq("order_id", id).maybeSingle(),
  ]);
  if (oErr) throw oErr;
  const ship = (s ?? null) as unknown as Shipment | null;
  return {
    order: (o ?? null) as Record<string, unknown> | null,
    items: (it ?? []) as Item[],
    history: (h ?? []) as History[],
    shipment: { carrier: ship?.carrier ?? "", tracking_number: ship?.tracking_number ?? "", tracking_url: ship?.tracking_url ?? "" },
  };
}

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["admin-order", id], queryFn: () => fetchDetail(id) });

  const [notifyNote, setNotifyNote] = useState<string | null>(null);

  const advance = useMutation({
    mutationFn: async ({ to, ship }: { to: string; ship: Shipment }) => {
      if (to === "SHIPPED") {
        if (!ship.carrier) throw new Error("Indica el transportista antes de despachar.");
        const { error } = await supabase.from("shipments").upsert(
          {
            order_id: id,
            carrier: ship.carrier,
            tracking_number: ship.tracking_number || null,
            tracking_url: ship.tracking_url || null,
            shipped_at: new Date().toISOString(),
          },
          { onConflict: "order_id" },
        );
        if (error) throw error;
      }
      if (to === "DELIVERED") {
        await supabase.from("shipments").update({ delivered_at: new Date().toISOString() }).eq("order_id", id);
      }
      const { error } = await supabase.from("orders").update({ status: to }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["admin-order", id] });
      const event = NOTIFY_EVENT[vars.to];
      if (event) {
        // Email transaccional best-effort (nunca bloquea el cambio de estado).
        supabase.functions
          .invoke("notify", { body: { order_id: id, event } })
          .then(({ error }) => setNotifyNote(error ? `Email no enviado: ${error.message}` : "Email al cliente enviado."))
          .catch(() => setNotifyNote("Email no enviado (función no disponible)."));
      }
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Error"),
  });

  if (isLoading || !data) {
    if (isError) {
      return (
        <div className="rounded border border-red-200 bg-red-50 p-4 text-sm">
          <p className="font-medium text-red-800">No se pudo cargar el pedido</p>
          <p className="text-red-600">Revisa tu conexión y tu rol admin.</p>
          <button type="button" onClick={() => refetch()} className="mt-2 rounded bg-red-700 px-3 h-9 text-white text-sm">
            Reintentar
          </button>
        </div>
      );
    }
    return <p className="text-sm text-zinc-500">Cargando…</p>;
  }
  const { order, items, history, shipment } = data;
  if (!order) return <p className="text-sm text-red-700">Pedido no encontrado.</p>;
  const status = String(order["status"] ?? "");
  const addr = (order["shipping_address"] ?? {}) as Record<string, string>;

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight">{String(order["order_number"] ?? "")}</h1>
      <p className="text-sm">
        Estado actual: <strong>{status}</strong> · Total {formatCLP(Number(order["total_clp"] ?? 0))}
      </p>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {notifyNote ? <p className="text-sm text-zinc-500">{notifyNote}</p> : null}

      <section className="rounded border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold mb-2">Cambiar estado</h2>
        <StatusButtons
          status={status}
          pending={advance.isPending}
          onAdvance={(to, ship) => advance.mutate({ to, ship })}
          initialShipment={shipment}
        />
      </section>

      <section className="rounded border border-zinc-200 bg-white p-4 text-sm">
        <h2 className="text-sm font-semibold mb-1">Prendas</h2>
        {items.map((i, idx) => (
          <p key={idx} className="py-1 border-b border-zinc-100 last:border-0">
            {i.qty} × {i.product_name} — {formatCLP(i.unit_price_clp * i.qty)}
          </p>
        ))}
        <p className="pt-2 text-zinc-500">
          Subtotal {formatCLP(Number(order["subtotal_clp"] ?? 0))} · Dcto {formatCLP(Number(order["discount_clp"] ?? 0))} · Envío {formatCLP(Number(order["shipping_clp"] ?? 0))}
        </p>
      </section>

      <section className="rounded border border-zinc-200 bg-white p-4 text-sm">
        <h2 className="text-sm font-semibold mb-1">Entrega</h2>
        <p>{addr["fullName"] ?? ""} · {addr["email"] ?? ""} · {addr["phone"] ?? ""}</p>
        <p>{addr["street"] ?? ""}, {addr["comuna"] ?? ""}, {addr["region"] ?? ""}</p>
      </section>

      <section className="rounded border border-zinc-200 bg-white p-4 text-sm">
        <h2 className="text-sm font-semibold mb-1">Historial</h2>
        {history.map((h, idx) => (
          <p key={idx} className="py-1 border-b border-zinc-100 last:border-0">
            {h.from_status ?? "—"} → <strong>{h.to_status}</strong> · {new Date(h.created_at).toLocaleString("es-CL")}
          </p>
        ))}
      </section>
    </div>
  );
}

function StatusButtons({
  status,
  pending,
  onAdvance,
  initialShipment,
}: {
  status: string;
  pending: boolean;
  onAdvance: (to: string, ship: Shipment) => void;
  initialShipment: Shipment;
}) {
  const [ship, setShip] = useState(initialShipment);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2 text-sm">
        <input aria-label="Transportista" placeholder="Chilexpress / Starken" className="rounded border border-zinc-300 px-3 h-10" value={ship.carrier} onChange={(e) => setShip({ ...ship, carrier: e.target.value })} />
        <input aria-label="Tracking" placeholder="Nº seguimiento" className="rounded border border-zinc-300 px-3 h-10" value={ship.tracking_number} onChange={(e) => setShip({ ...ship, tracking_number: e.target.value })} />
        <input aria-label="URL tracking" placeholder="URL (opcional)" className="rounded border border-zinc-300 px-3 h-10" value={ship.tracking_url} onChange={(e) => setShip({ ...ship, tracking_url: e.target.value })} />
      </div>
      <div className="flex flex-wrap gap-2">
        {(NEXT[status] ?? []).length === 0 ? <p className="text-sm text-zinc-500">Estado final.</p> : null}
        {(NEXT[status] ?? []).map((to) => (
          <button
            key={to}
            disabled={pending}
            onClick={() => onAdvance(to, ship)}
            className="rounded-full bg-zinc-900 text-white px-4 h-10 text-sm font-semibold disabled:opacity-50"
          >
            → {to}
          </button>
        ))}
      </div>
    </div>
  );
}
