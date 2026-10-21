/**
 * Cliente de la Edge Function checkout (Fase 6).
 * Toda la lógica de totales/reserva/pago vive en el backend;
 * aquí solo transporte + tipos.
 */
import { getSupabase, isSupabaseConfigured } from "./supabase";
import type { AddressInput } from "@shopy/validation";

export interface CheckoutItem {
  product_id: string;
  qty: number;
}

export interface QuoteLine {
  product_id: string;
  qty: number;
  unit_price_clp: number;
  product_slug: string;
  product_name: string;
  brand_name: string | null;
  size: string | null;
  color: string | null;
  condition: string;
  image_url: string | null;
}

export interface QuoteResult {
  lines: QuoteLine[];
  subtotal_clp: number;
  discount_clp: number;
  shipping_clp: number;
  total_clp: number;
}

export interface CreateResult {
  order_id: string;
  order_number: string;
  guest_token: string | null;
  total_clp: number;
  payment: { provider: string; provider_payment_id: string; status: string; checkout_url: string | null };
}

export interface ConfirmResult {
  order_id: string;
  order_number: string;
  status: string;
  guest_token: string | null;
  already?: boolean;
}

export class CheckoutApiError extends Error {
  code: string;
  status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Timeout por defecto del checkout (redes móviles inestables). */
const CHECKOUT_TIMEOUT_MS = 20_000;

async function callCheckout<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  if (!isSupabaseConfigured) throw new CheckoutApiError(0, "NO_BACKEND", "Falta configuración del backend.");
  const supabase = getSupabase();
  let session: { access_token: string } | null = null;
  try {
    const { data } = await supabase.auth.getSession();
    session = data.session;
  } catch {
    throw new CheckoutApiError(0, "OFFLINE", "Sin conexión. Revisa tu internet e inténtalo de nuevo.");
  }
  const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/checkout`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CHECKOUT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
        ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ action, ...payload }),
      signal: ctrl.signal,
    });
    // Mantener el timeout hasta terminar de leer el cuerpo de la respuesta.
    const body = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      throw new CheckoutApiError(res.status, "INVALID_RESPONSE", "El servidor devolvió una respuesta inválida. Inténtalo de nuevo.");
    }
    if (!res.ok) {
      const err = (json as { error?: { code?: string; message?: string } } | null)?.error;
      throw new CheckoutApiError(res.status, err?.code ?? "ERROR", err?.message ?? "Error en el pago.");
    }
    return json as T;
  } catch (e) {
    if (e instanceof CheckoutApiError) throw e;
    // AbortError = timeout propio; resto (TypeError por red/DNS caído) = offline.
    // Se compara por nombre: DOMException no existe en todos los runtimes (Hermes).
    if ((e as { name?: string } | null)?.name === "AbortError") {
      throw new CheckoutApiError(0, "TIMEOUT", "La solicitud tardó demasiado. Revisa tu conexión e inténtalo de nuevo.");
    }
    throw new CheckoutApiError(0, "OFFLINE", "Sin conexión. Revisa tu internet e inténtalo de nuevo.");
  } finally {
    clearTimeout(timer);
  }
}

export function quoteCheckout(input: {
  items: CheckoutItem[];
  shipping_rate_id: string;
  discount_code?: string;
  region: string;
}): Promise<QuoteResult> {
  return callCheckout<QuoteResult>("quote", input);
}

export function createOrder(input: {
  items: CheckoutItem[];
  address: AddressInput;
  shipping_rate_id: string;
  discount_code?: string;
  save_address?: boolean;
  return_url?: string;
  expected_user_id?: string | null;
  /** Total cotizado: si el precio cambia, el backend responde PRICE_CHANGED. */
  expected_total_clp?: number;
  provider?: "mock" | "mercadopago" | "transbank";
  idempotency_key?: string;
  attempt_secret?: string;
}): Promise<CreateResult> {
  return callCheckout<CreateResult>("create", input);
}

export function listPaymentProviders(): Promise<{ providers: ("mock" | "mercadopago" | "transbank")[]; sandbox: boolean }> {
  return callCheckout("providers", {});
}
export function recoverCheckout(key: string, secret: string, owner?: string): Promise<CreateResult> {
  return callCheckout("recover", { idempotency_key: key, attempt_secret: secret, ...(owner ? { expected_user_id: owner === "guest" ? null : owner } : {}) });
}

export function closeCheckoutAttempt(key: string, secret: string, owner: string): Promise<{ closed: boolean }> {
  return callCheckout("close_attempt", { idempotency_key: key, attempt_secret: secret, expected_user_id: owner === "guest" ? null : owner });
}

export function confirmOrder(order_id: string, guest_token?: string | null, owner?: string): Promise<ConfirmResult> {
  return callCheckout<ConfirmResult>("confirm", {
    order_id,
    ...(owner ? { expected_user_id: owner === "guest" ? null : owner } : {}),
    ...(guest_token ? { guest_token } : {}),
  });
}

export interface ShippingRate {
  id: string;
  region: string;
  comuna: string | null;
  carrier: string;
  price_clp: number;
  eta_days_min: number | null;
  eta_days_max: number | null;
}

export async function listShippingRates(region: string): Promise<ShippingRate[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("shipping_rates")
    .select("id,region,comuna,carrier,price_clp,eta_days_min,eta_days_max")
    .eq("is_active", true)
    .order("price_clp");
  if (error) throw error;
  const normalize = (value: string) => value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return ((data ?? []) as ShippingRate[]).filter((rate) => [normalize(region), "otras"].includes(normalize(rate.region)));
}

export interface OrderSummary {
  id: string;
  order_number: string;
  status: string;
  total_clp: number;
  created_at: string;
}

export async function listMyOrders(): Promise<OrderSummary[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("orders")
    .select("id,order_number,status,total_clp,created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as OrderSummary[];
}

export interface OrderDetail {
  id: string;
  order_number: string;
  status: string;
  subtotal_clp: number;
  discount_clp: number;
  shipping_clp: number;
  total_clp: number;
  created_at: string;
  carrier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  items: {
    product_id: string | null;
    product_slug: string;
    product_name: string;
    image_url: string | null;
    unit_price_clp: number;
    qty: number;
  }[];
  history: { from_status: string | null; to_status: string; created_at: string }[];
}

export async function getMyOrderDetail(orderId: string): Promise<OrderDetail | null> {
  const supabase = getSupabase();
  const { data: order, error } = await supabase
    .from("orders")
    .select("id,order_number,status,subtotal_clp,discount_clp,shipping_clp,total_clp,created_at")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw error;
  if (!order) return null;
  const o = order as unknown as OrderDetail;
  const [itemsResult, historyResult, shipmentResult] = await Promise.all([
    supabase.from("order_items").select("product_id,product_slug,product_name,image_url,unit_price_clp,qty").eq("order_id", orderId),
    supabase.from("order_status_history").select("from_status,to_status,created_at").eq("order_id", orderId).order("created_at"),
    supabase.from("shipments").select("carrier,tracking_number,tracking_url").eq("order_id", orderId).maybeSingle(),
  ]);
  for (const result of [itemsResult, historyResult, shipmentResult]) {
    if (result.error) throw result.error;
  }
  const { data: items } = itemsResult;
  const { data: history } = historyResult;
  const { data: shipment } = shipmentResult;
  const ship = shipment as unknown as { carrier: string; tracking_number: string; tracking_url: string } | null;
  return {
    ...o,
    carrier: ship?.carrier ?? null,
    tracking_number: ship?.tracking_number ?? null,
    tracking_url: ship?.tracking_url ?? null,
    items: (items ?? []) as OrderDetail["items"],
    history: (history ?? []) as OrderDetail["history"],
  };
}

export interface GuestOrderResult {
  id: string;
  order_number: string;
  status: string;
  total_clp: number;
  carrier?: string | null;
  items: {
    product_id: string | null;
    product_slug: string;
    product_name: string;
    image_url: string | null;
    unit_price_clp: number;
    qty: number;
  }[];
}

/**
 * Rastreo por número visible de pedido (SHO-XXXX) en vez del UUID interno.
 */
export async function trackGuestOrderByNumber(orderNumber: string, token: string): Promise<GuestOrderResult> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("get_guest_order_by_number", {
    p_order_number: orderNumber,
    p_token: token,
  });
  if (error) throw new CheckoutApiError(404, "ORDER_NOT_FOUND", "Pedido no encontrado. Verifica los datos.");
  return data as GuestOrderResult;
}

export async function trackGuestOrder(orderId: string, token: string): Promise<GuestOrderResult> {
  let rpc: { data: unknown; error: { message?: string } | null };
  try {
    const supabase = getSupabase();
    rpc = await supabase.rpc("get_guest_order", {
      p_order_id: orderId,
      p_token: token,
    });
  } catch {
    throw new CheckoutApiError(0, "OFFLINE", "Sin conexión. Revisa tu internet e inténtalo de nuevo.");
  }
  if (rpc.error) throw new CheckoutApiError(404, "ORDER_NOT_FOUND", "Pedido no encontrado. Verifica los datos.");
  const raw = rpc.data as Record<string, unknown>;
  return {
    id: String(raw["id"] ?? orderId),
    order_number: String(raw["order_number"] ?? ""),
    status: String(raw["status"] ?? ""),
    total_clp: Number(raw["total_clp"] ?? 0),
    items: (Array.isArray(raw["items"]) ? raw["items"] : []) as GuestOrderResult["items"],
  };
}
