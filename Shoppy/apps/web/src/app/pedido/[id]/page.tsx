"use client";

import { Suspense, use, useState } from "react";
import Image from "next/image";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { formatCLP } from "../../../lib/format";
import { getMyOrderDetail, requestReturn, trackGuestOrder } from "../../../lib/checkout";
import { useSession } from "../../../lib/session";
import { ErrorState, LoadingState, backendErrorMessage } from "../../../components/States";
import { isSupabaseConfigured } from "../../../lib/supabase";

export default function PedidoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<LoadingState message="Cargando pedido…" />}>
      <PedidoInner id={id} />
    </Suspense>
  );
}

function PedidoInner({ id }: { id: string }) {
  const search = useSearchParams();
  const router = useRouter();
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
  if (!isSupabaseConfigured) return <ErrorState message="La tienda no está disponible en este momento. Vuelve a intentarlo más tarde." />;

  if (id === "guest" || (guest && !submittedToken)) {
    return (
      <form
        className="mx-auto flex max-w-md flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          const orderId = String(data.get("orderId") ?? "").trim();
          const code = String(data.get("token") ?? "").trim();
          router.push(`/pedido/${encodeURIComponent(orderId)}?token=${encodeURIComponent(code)}`);
        }}
      >
        <h1 className="font-display text-3xl tracking-tight text-carbon">Rastrear pedido</h1>
        <p className="text-sm text-muted">Ingresa el ID del pedido y el código que recibiste al comprar.</p>
        <GuestIdField defaultId={id === "guest" ? "" : id} />
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">Código de rastreo</span>
          <input name="token" required autoComplete="off" spellCheck={false} defaultValue={token} onChange={(e) => setToken(e.target.value)} placeholder="Código de rastreo" className="h-11 border border-carbon/30 bg-ivory px-3 text-sm text-carbon placeholder:text-muted focus:border-carbon" />
        </label>
        <button type="submit" className="h-11 bg-carbon text-sm uppercase tracking-[0.12em] text-ivory transition-colors hover:bg-carbon-soft">
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
          <button type="button" onClick={() => setSubmittedToken(null)} className="text-sm text-muted underline underline-offset-4 hover:text-carbon">
            Probar con otro código
          </button>
        </div>
      );
    }
    const g = guestOrder.data;
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <h1 className="font-display text-3xl tracking-tight text-carbon">Pedido {g.order_number}</h1>
        <p className="text-sm text-carbon">Estado: <strong>{g.status}</strong> · Total: <strong>{formatCLP(g.total_clp)}</strong></p>
        {g.carrier || g.tracking_number ? (
          <dl className="border border-line bg-ivory p-4 text-sm">
            {g.carrier ? <div className="flex justify-between"><dt className="text-muted">Carrier</dt><dd>{g.carrier}</dd></div> : null}
            {g.tracking_number ? <div className="flex justify-between"><dt className="text-muted">Seguimiento</dt><dd>{g.tracking_number}</dd></div> : null}
          </dl>
        ) : null}
        {g.tracking_url ? (
          <a href={g.tracking_url} target="_blank" rel="noreferrer" className="text-sm text-carbon underline underline-offset-4">
            Rastrear despacho
          </a>
        ) : null}
        {g.dte_folio ? (
          <div className="border border-line bg-ivory p-4 text-sm">
            <p className="mb-1 font-semibold">Documento tributario</p>
            <p className="text-muted">
              {g.dte_kind === "factura" ? "Factura" : g.dte_kind === "exenta" ? "Boleta exenta" : "Boleta"} N° {g.dte_folio}
            </p>
            {g.dte_pdf_url ? (
              <a href={g.dte_pdf_url} target="_blank" rel="noreferrer" className="text-carbon underline underline-offset-4">
                Descargar PDF
              </a>
            ) : null}
          </div>
        ) : null}
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
      <h1 className="font-display text-3xl tracking-tight text-carbon">Pedido {o.order_number}</h1>
      <dl className="border border-line bg-ivory p-4 text-sm">
        <div className="flex justify-between"><dt className="text-muted">Estado</dt><dd className="font-semibold">{o.status}</dd></div>
        <div className="flex justify-between"><dt className="text-muted">Fecha</dt><dd>{new Date(o.created_at).toLocaleString("es-CL")}</dd></div>
        <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd>{formatCLP(o.subtotal_clp)}</dd></div>
        {o.discount_clp > 0 ? <div className="flex justify-between"><dt className="text-muted">Descuento</dt><dd>−{formatCLP(o.discount_clp)}</dd></div> : null}
        <div className="flex justify-between"><dt className="text-muted">Despacho</dt><dd>{formatCLP(o.shipping_clp)}</dd></div>
        <div className="flex justify-between text-base font-bold"><dt>Total</dt><dd>{formatCLP(o.total_clp)}</dd></div>
        {o.carrier ? <div className="flex justify-between"><dt className="text-muted">Carrier</dt><dd>{o.carrier}</dd></div> : null}
        {o.tracking_number ? <div className="flex justify-between"><dt className="text-muted">Seguimiento</dt><dd>{o.tracking_number}</dd></div> : null}
      </dl>
      {o.tracking_url ? (
        <a href={o.tracking_url} target="_blank" rel="noreferrer" className="text-sm text-carbon underline underline-offset-4">
          Rastrear despacho
        </a>
      ) : null}
      {o.dte_folio ? (
        <div className="border border-line bg-ivory p-4 text-sm">
          <p className="mb-1 font-semibold">Documento tributario</p>
          <p className="text-muted">
            {o.dte_kind === "factura" ? "Factura" : o.dte_kind === "exenta" ? "Boleta exenta" : "Boleta"} N° {o.dte_folio}
          </p>
          {o.dte_pdf_url ? (
            <a href={o.dte_pdf_url} target="_blank" rel="noreferrer" className="text-carbon underline underline-offset-4">
              Descargar PDF
            </a>
          ) : null}
        </div>
      ) : null}
      <ReturnSection orderId={id} status={o.status} request={o.return_request} />
      <Items items={o.items} />
      {o.history.length > 0 ? (
        <div className="border border-line bg-ivory p-4 text-sm">
          <p className="mb-2 font-semibold">Historial</p>
          {o.history.map((h, i) => (
            <p key={i} className="text-muted">
              {h.from_status ?? "—"} → {h.to_status} · {new Date(h.created_at).toLocaleString("es-CL")}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function GuestIdField({ defaultId }: { defaultId: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-[11px] uppercase tracking-[0.18em] text-muted">ID del pedido</span>
      <input name="orderId" required autoComplete="off" spellCheck={false} defaultValue={defaultId} placeholder="UUID del pedido" className="h-11 border border-carbon/30 bg-ivory px-3 text-sm text-carbon placeholder:text-muted focus:border-carbon" />
    </label>
  );
}

function Items({ items }: { items: { product_slug: string; product_name: string; image_url: string | null; unit_price_clp: number; qty: number }[] }) {
  return (
    <div className="flex flex-col gap-2">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-3 border border-line bg-ivory p-3">
          {it.image_url ? (
            <Image src={it.image_url} alt={it.product_name} width={48} height={64} className="object-cover" />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-base text-carbon">{it.product_name}</p>
            <p className="text-xs uppercase tracking-[0.14em] text-muted">Cantidad: {it.qty}</p>
          </div>
          <p className="shrink-0 text-sm font-bold text-carbon">{formatCLP(it.unit_price_clp * it.qty)}</p>
        </div>
      ))}
    </div>
  );
}

const RETURN_REASONS = [
  "No me quedó / no era lo que esperaba",
  "Llegó con un defecto",
  "No era la talla o el color",
  "Otro",
];

const RETURN_STATUS: Record<string, string> = {
  requested: "Solicitud enviada. Revisaremos tu caso y te escribiremos por correo.",
  approved: "Devolución aprobada. Coordinamos el envío de vuelta.",
  completed: "Devolución completada y reembolso realizado.",
  rejected: "La solicitud fue rechazada. Te contactamos con el detalle.",
  cancelled: "Solicitud cancelada.",
};

function ReturnSection({
  orderId,
  status,
  request,
}: {
  orderId: string;
  status: string;
  request: { status: string; reason: string; created_at: string } | null;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState(RETURN_REASONS[0]);
  const [detail, setDetail] = useState("");
  const [sent, setSent] = useState(false);
  const submit = useMutation({
    mutationFn: () => requestReturn(orderId, reason, detail),
    onSuccess: () => {
      setSent(true);
      void queryClient.invalidateQueries({ queryKey: ["order-detail", orderId] });
    },
  });

  const current = request?.status ?? (sent ? "requested" : null);
  if (current) {
    return (
      <div className="border border-line bg-ivory p-4 text-sm">
        <p className="mb-1 font-semibold">Devolución</p>
        <p className="text-muted">{RETURN_STATUS[current] ?? "Solicitud registrada."}</p>
      </div>
    );
  }
  if (status !== "DELIVERED") return null;

  return (
    <form
      className="flex flex-col gap-3 border border-line bg-ivory p-4 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        submit.mutate();
      }}
    >
      <div>
        <p className="font-semibold">¿Quieres devolver?</p>
        <p className="text-muted">Tienes 10 días desde la entrega (derecho a retracto, Ley 19.496).</p>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-[0.18em] text-muted">Motivo</span>
        <select value={reason} onChange={(e) => setReason(e.target.value)} className="h-11 border border-carbon/30 bg-ivory px-3 text-sm text-carbon focus:border-carbon">
          {RETURN_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-[0.18em] text-muted">Detalle (opcional)</span>
        <textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={3} className="border border-carbon/30 bg-ivory px-3 py-2 text-sm text-carbon focus:border-carbon" />
      </label>
      {submit.isError ? <p className="text-red-700">No se pudo enviar la solicitud. Inténtalo de nuevo.</p> : null}
      <button type="submit" disabled={submit.isPending} className="h-11 self-start bg-carbon px-6 text-sm uppercase tracking-[0.12em] text-ivory transition-colors hover:bg-carbon-soft disabled:opacity-50">
        Solicitar devolución
      </button>
    </form>
  );
}
