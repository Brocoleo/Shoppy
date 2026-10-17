/**
 * Envío de emails de pedido, idempotente (Fase 9).
 * Compartido por checkout (order_created/payment_confirmed) y la función
 * notify (cambios de estado desde admin). Nunca hace fallar el flujo que
 * lo llama: los errores se propagan para log, no para revertir.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.117.2";
import { getEmailProvider, renderOrderEmail, type OrderEmailData, type OrderEmailEvent } from "./email.ts";

const EVENTS: OrderEmailEvent[] = [
  "order_created",
  "payment_confirmed",
  "order_preparing",
  "order_shipped",
  "order_delivered",
  "order_cancelled",
  "order_refunded",
];

export function isOrderEmailEvent(v: unknown): v is OrderEmailEvent {
  return typeof v === "string" && (EVENTS as string[]).includes(v);
}

export async function sendOrderEmail(
  db: SupabaseClient,
  orderId: string,
  event: OrderEmailEvent,
): Promise<{ sent: boolean; reason?: string }> {
  const { data: order } = await db
    .from("orders")
    .select("id,order_number,status,total_clp,guest_token,shipping_address")
    .eq("id", orderId)
    .maybeSingle();
  const o = order as unknown as {
    id: string;
    order_number: string;
    total_clp: number;
    guest_token: string | null;
    shipping_address: Record<string, string>;
  } | null;
  if (!o) return { sent: false, reason: "ORDER_NOT_FOUND" };
  const addr = o.shipping_address ?? {};
  const to = addr["email"] ?? "";
  if (!to) return { sent: false, reason: "NO_RECIPIENT" };

  const { data: claimed, error: claimError } = await db.rpc("claim_order_notification", { p_order: orderId, p_event: event, p_recipient: to });
  if (claimError) throw claimError;
  if (!claimed) {
    const { data: existing, error } = await db.from("order_notifications").select("status").eq("order_id", orderId).eq("event", event).maybeSingle();
    if (error) throw error;
    return { sent: false, reason: existing?.status === "sent" ? "ALREADY_NOTIFIED" : "REVIEW_REQUIRED" };
  }
  try {
  const { data: items, error: itemsError } = await db
    .from("order_items")
    .select("product_name,qty,unit_price_clp")
    .eq("order_id", orderId);
  const { data: shipment, error: shipmentError } = await db
    .from("shipments")
    .select("carrier,tracking_number,tracking_url")
    .eq("order_id", orderId)
    .maybeSingle();
  if (itemsError || shipmentError) throw itemsError ?? shipmentError;
  const ship = shipment as unknown as { carrier: string; tracking_number: string; tracking_url: string } | null;

  const emailData: OrderEmailData = {
    order_number: o.order_number,
    customer_name: addr["fullName"] ?? to,
    total_clp: o.total_clp,
    items: ((items ?? []) as { product_name: string; qty: number; unit_price_clp: number }[]).map((i) => ({
      name: i.product_name,
      qty: i.qty,
      unit_price_clp: i.unit_price_clp,
    })),
    address_line: [addr["street"], addr["comuna"], addr["region"]].filter(Boolean).join(", "),
    carrier: ship?.carrier ?? null,
    tracking_number: ship?.tracking_number ?? null,
    tracking_url: ship?.tracking_url ?? null,
    guest_token: o.guest_token,
  };

  const rendered = renderOrderEmail(event, emailData);
  const provider = getEmailProvider();
  const { id: messageId } = await provider.send({ to, subject: rendered.subject, html: rendered.html, idempotencyKey: `order-${orderId}-${event}` });
  const { error: savedError } = await db
    .from("order_notifications")
    .update({ provider_message_id: messageId, status: "sent", last_error: null })
    .eq("order_id", orderId)
    .eq("event", event);
  if (savedError) throw savedError;
  return { sent: true };
  } catch (error) {
    await db.from("order_notifications").update({ status: "failed", last_error: "Envío no confirmado. Revisa proveedor antes de reintentar tras 24 horas." }).eq("id", claimed);
    throw error;
  }
}
