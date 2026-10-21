"use client";

import { use, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatCLP, supabase } from "../../../lib/supabase";

const NEXT: Record<string, string[]> = {
  PENDING_PAYMENT: ["CANCELLED"],
  PAID: ["PREPARING"],
  PREPARING: ["SHIPPED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: [],
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

interface ReturnRequest {
  id: string;
  status: string;
  reason: string;
  detail: string | null;
  resolution_note: string | null;
  created_at: string;
}

async function fetchDetail(id: string) {
  const results = await Promise.all([
    supabase.from("orders").select("*").eq("id", id).maybeSingle(),
    supabase.from("order_items").select("product_slug,product_name,unit_price_clp,qty").eq("order_id", id),
    supabase.from("order_status_history").select("from_status,to_status,created_at").eq("order_id", id).order("created_at"),
    supabase.from("shipments").select("carrier,tracking_number,tracking_url").eq("order_id", id).maybeSingle(),
    supabase.from("payments").select("id,provider,status,incident,refund_state").eq("order_id", id),
    supabase.from("order_notifications").select("id,event,status,last_error,attempted_at").eq("order_id", id),
    supabase.from("checkout_attempts").select("id,state,error_code").eq("order_id", id),
    supabase.from("return_requests").select("id,status,reason,detail,resolution_note,created_at").eq("order_id", id).order("created_at", { ascending: false }),
  ]);
  for (const result of results) if (result.error) throw result.error;
  const [orderResult, itemResult, historyResult, shipmentResult, paymentResult, notificationResult, attemptResult, returnResult] = results;
  const o = orderResult.data;
  const it = itemResult.data;
  const h = historyResult.data;
  const s = shipmentResult.data;
  const ship = (s ?? null) as unknown as Shipment | null;
  return {
    payments: (paymentResult.data ?? []) as { id: string; provider: string; status: string; incident: string | null; refund_state: string | null }[],
    returns: (returnResult.data ?? []) as ReturnRequest[],
    notifications: (notificationResult.data ?? []) as { id: string; event: string; status: string; last_error: string | null; attempted_at: string | null }[],
    attempts: (attemptResult.data ?? []) as { id: string; state: string; error_code: string | null }[],
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
        if (ship.tracking_url && !/^https:\/\//i.test(ship.tracking_url)) throw new Error("El seguimiento debe ser una URL HTTPS.");
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
        const { error } = await supabase.from("shipments").update({ delivered_at: new Date().toISOString() }).eq("order_id", id);
        if (error) throw error;
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
          .then(({ data, error }) => { setNotifyNote(error ? `Email no enviado: ${error.message}` : data?.sent ? "Email al cliente enviado." : "Correo ya enviado o pendiente de revisión."); void queryClient.invalidateQueries({ queryKey: ["admin-order", id] }); })
          .catch(() => setNotifyNote("Email no enviado (función no disponible)."));
      }
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Error"),
  });

  const operation = useMutation({
    mutationFn: async ({ functionName, body }: { functionName: string; body: Record<string, string> }) => {
      const { data, error } = await supabase.functions.invoke(functionName, { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error.message);
      return data;
    },
    onSuccess: (result) => { setNotifyNote(result?.sent === false ? (result.reason === "ALREADY_NOTIFIED" ? "El correo ya fue enviado." : "No se reenvió: requiere revisión en el proveedor.") : "Operación completada. Revisa el estado actualizado."); },
    onError: (e) => setError(e instanceof Error ? e.message : "Operación fallida"),
    onSettled: () => { void queryClient.invalidateQueries({ queryKey: ["admin-order", id] }); },
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
      <h1 className="flex items-center gap-2 font-serif text-3xl tracking-tight">{String(order["order_number"] ?? "")}{String(order["mode"] ?? "") === "test" ? (
        <span className="inline-flex shrink-0 items-center rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">Prueba</span>
      ) : null}</h1>
      <p className="text-sm">
        Estado actual: <strong>{status}</strong> · Total {formatCLP(Number(order["total_clp"] ?? 0))}
      </p>
      {String(order["mode"] ?? "") === "test" ? (
        <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">Compra de prueba (sandbox de pagos). No involucra dinero ni afecta las estadísticas de negocio.</p>
      ) : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {notifyNote ? <p className="text-sm text-zinc-500">{notifyNote}</p> : null}

      <section className="rounded border border-zinc-200 bg-white p-4 text-sm">
        <h2 className="font-semibold">Pagos de prueba</h2>
        {data.payments.map((payment) => <div key={payment.id} className="py-2">
          <p>{payment.provider} · {payment.status} {payment.refund_state ? `· Reembolso: ${payment.refund_state}` : ""}</p>
          {payment.incident ? <p role="alert" className="text-red-700">{payment.incident}</p> : null}
          {payment.status === "approved" && (!payment.refund_state || payment.refund_state === "review") ? <button disabled={operation.isPending} className="underline" onClick={() => { if (confirm("¿Reembolsar este pago de prueba mediante su proveedor?")) operation.mutate({ functionName: "checkout", body: { action: "refund", payment_id: payment.id } }); }}>{payment.refund_state === "review" ? "Reintentar reembolso (revisa antes en el proveedor)" : "Reembolsar con proveedor"}</button> : null}
          {payment.refund_state === "processing" ? <p role="alert" className="text-amber-800">Reembolso en curso: verifica en el proveedor antes de reintentar.</p> : null}
        </div>)}
        {data.attempts.filter((a) => a.state === "review" || a.state === "processing").map((a) => <p key={a.id} className="text-amber-800">Intento {a.id}: {a.state} · {a.error_code ?? "pendiente"}. Verificar en el proveedor antes de liberar otro intento.</p>)}
      </section>
      <section className="rounded border border-zinc-200 bg-white p-4 text-sm">
        <h2 className="font-semibold">Correos</h2>
        {data.notifications.map((notification) => <div key={notification.id} className="py-2">
          <p>{notification.event} · {notification.status}</p>
          {notification.last_error ? <p className="text-red-700">{notification.last_error}</p> : null}
          {notification.status === "failed" ? <button disabled={operation.isPending} className="underline" onClick={() => operation.mutate({ functionName: "notify", body: { order_id: id, event: notification.event } })}>Reintentar correo</button> : null}
        </div>)}
      </section>

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

      <DteCard
        orderId={id}
        initial={{
          kind: String(order["dte_kind"] ?? ""),
          folio: String(order["dte_folio"] ?? ""),
          pdfUrl: String(order["dte_pdf_url"] ?? ""),
          status: String(order["dte_status"] ?? "pending"),
        }}
      />

      <ReturnsCard orderId={id} requests={data.returns} payments={data.payments} />

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

function DteCard({
  orderId,
  initial,
}: {
  orderId: string;
  initial: { kind: string; folio: string; pdfUrl: string; status: string };
}) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState(initial.kind || "boleta");
  const [folio, setFolio] = useState(initial.folio);
  const [pdfUrl, setPdfUrl] = useState(initial.pdfUrl);
  const [note, setNote] = useState<string | null>(null);

  const issued = initial.status === "issued" || initial.status === "accepted";
  const save = useMutation({
    mutationFn: async () => {
      if (pdfUrl && !/^https:\/\//i.test(pdfUrl)) throw new Error("El enlace del PDF debe ser una URL HTTPS.");
      const { error } = await supabase
        .from("orders")
        .update({
          dte_kind: kind,
          dte_folio: folio.trim() || null,
          dte_pdf_url: pdfUrl.trim() || null,
          dte_status: "issued",
          dte_provider: "manual",
          dte_issued_at: new Date().toISOString(),
        })
        .eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      setNote("DTE registrado en el pedido.");
      void queryClient.invalidateQueries({ queryKey: ["admin-order", orderId] });
    },
    onError: (e) => setNote(e instanceof Error ? e.message : "No se pudo guardar."),
  });

  return (
    <section className="rounded border border-zinc-200 bg-white p-4 text-sm">
      <h2 className="text-sm font-semibold mb-1">Boleta / DTE</h2>
      <p className="mb-2 text-xs text-zinc-500">
        Emite el documento en el <strong>Portal MiPyme del SII</strong> (gratuito y oficial) y registra aquí su folio y PDF
        para dejar trazabilidad y poder reenviarlo al cliente.
      </p>
      <p className="mb-3">
        Estado: <strong>{issued ? (initial.folio ? `emitida · folio ${initial.folio}` : "emitida") : "sin emitir"}</strong>
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Tipo</span>
          <select aria-label="Tipo de documento" className="rounded border border-zinc-300 px-3 h-10" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="boleta">Boleta</option>
            <option value="factura">Factura</option>
            <option value="exenta">Boleta exenta</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Folio</span>
          <input aria-label="Folio" placeholder="N° de documento" className="rounded border border-zinc-300 px-3 h-10" value={folio} onChange={(e) => setFolio(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">PDF (URL HTTPS)</span>
          <input aria-label="URL del PDF" placeholder="https://…" className="rounded border border-zinc-300 px-3 h-10" value={pdfUrl} onChange={(e) => setPdfUrl(e.target.value)} />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" disabled={save.isPending} onClick={() => { setNote(null); save.mutate(); }} className="rounded-full bg-zinc-900 text-white px-4 h-10 text-sm font-semibold disabled:opacity-50">
          Registrar DTE
        </button>
        {initial.pdfUrl ? <a className="underline" href={initial.pdfUrl} target="_blank" rel="noreferrer">Ver PDF</a> : null}
        {note ? <span className="text-xs text-zinc-500">{note}</span> : null}
      </div>
    </section>
  );
}

function ReturnsCard({
  orderId,
  requests,
  payments,
}: {
  orderId: string;
  requests: ReturnRequest[];
  payments: { id: string; status: string; refund_state: string | null }[];
}) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState<string | null>(null);
  const refundable = payments.find((p) => p.status === "approved" && !p.refund_state);

  const resolve = useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      if (approve) {
        if (!refundable) throw new Error("No hay un pago aprobado para reembolsar. Reembolsa por fuera y luego resuélvelo manualmente.");
        const { data, error } = await supabase.functions.invoke("checkout", { body: { action: "refund", payment_id: refundable.id } });
        if (error) throw error;
        if (data?.error) throw new Error(data.error.message);
      }
      const resolution_note = approve ? null : (window.prompt("Motivo del rechazo (opcional)") ?? null);
      const { error: updErr } = await supabase
        .from("return_requests")
        .update({ status: approve ? "completed" : "rejected", resolution_note, resolved_at: new Date().toISOString() })
        .eq("id", id);
      if (updErr) throw updErr;
    },
    onSuccess: (_d, vars) => {
      setNote(vars.approve ? "Devolución aprobada y reembolsada. La prenda volvió al catálogo." : "Solicitud rechazada.");
      void queryClient.invalidateQueries({ queryKey: ["admin-order", orderId] });
    },
    onError: (e) => setNote(e instanceof Error ? e.message : "No se pudo resolver."),
  });

  return (
    <section className="rounded border border-zinc-200 bg-white p-4 text-sm">
      <h2 className="text-sm font-semibold mb-1">Devoluciones</h2>
      {requests.length === 0 ? <p className="text-zinc-500">Sin solicitudes de devolución.</p> : null}
      {requests.map((r) => (
        <div key={r.id} className="py-2 border-b border-zinc-100 last:border-0">
          <p>
            <strong>{r.status}</strong> · {r.reason}
            {r.detail ? ` · ${r.detail}` : ""}
          </p>
          <p className="text-xs text-zinc-500">
            {new Date(r.created_at).toLocaleString("es-CL")}
            {r.resolution_note ? ` · ${r.resolution_note}` : ""}
          </p>
          {r.status === "requested" || r.status === "approved" ? (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={resolve.isPending}
                className="rounded-full bg-zinc-900 text-white px-4 h-9 text-sm font-semibold disabled:opacity-50"
                onClick={() => { if (confirm("¿Aprobar la devolución y reembolsar al cliente vía su proveedor de pago?")) resolve.mutate({ id: r.id, approve: true }); }}
              >
                Aprobar y reembolsar
              </button>
              <button
                type="button"
                disabled={resolve.isPending}
                className="underline"
                onClick={() => { if (confirm("¿Rechazar esta solicitud de devolución?")) resolve.mutate({ id: r.id, approve: false }); }}
              >
                Rechazar
              </button>
              {!refundable ? <span className="text-xs text-amber-800">Sin pago aprobado: reembolsa por fuera antes de aprobar.</span> : null}
            </div>
          ) : null}
        </div>
      ))}
      {note ? <p className="mt-2 text-xs text-zinc-500">{note}</p> : null}
    </section>
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
