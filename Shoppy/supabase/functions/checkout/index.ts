/**
 * checkout — Edge Function (Fase 6).
 * Acciones: quote (totales sin efectos) · create (valida, crea pedido,
 * reserva 15 min, pago mock pendiente) · confirm (verifica y marca PAID,
 * idempotente).
 *
 * Todo monto/stock/disponibilidad se calcula en backend. El cliente nunca
 * decide precios. Requiere service key (solo servidor, jamás en mobile).
 */
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { timingSafeEqual } from "node:crypto";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.117.2";
import { z } from "npm:zod";
import { getPaymentProvider } from "../_shared/payment.ts";
import { sendOrderEmail } from "../_shared/notify.ts";
import { rateLimit } from "../_shared/ratelimit.ts";

const addressSchema = z.object({
  fullName: z.string().min(2).max(120),
  email: z.string().email().max(160),
  phone: z.string().min(6).max(30),
  street: z.string().min(3).max(200),
  comuna: z.string().min(2).max(100),
  region: z.string().min(2).max(100),
  zipCode: z.string().max(20).nullish(),
  notes: z.string().max(500).nullish(),
});

const itemSchema = z.object({
  product_id: z.string().uuid(),
  qty: z.number().int().min(1).max(99),
});

const quoteSchema = z.object({
  action: z.literal("quote"),
  items: z.array(itemSchema).min(1).max(50),
  shipping_rate_id: z.string().uuid(),
  discount_code: z.string().max(40).nullish(),
  region: z.string().min(2).max(100),
});

const createSchema = z.object({
  action: z.literal("create"),
  items: z.array(itemSchema).min(1).max(50),
  address: addressSchema,
  shipping_rate_id: z.string().uuid(),
  discount_code: z.string().max(40).nullish(),
  save_address: z.boolean().optional(),
  /** Deep link de retorno (shopy://…) para proveedores con redirect. */
  return_url: z.string().max(256).nullish().refine(
    (v) => v == null || /^(shopy:\/\/|https:\/\/)/.test(v),
    { message: "return_url debe ser shopy:// o https://" },
  ),
});

const confirmSchema = z.object({
  action: z.literal("confirm"),
  order_id: z.string().uuid(),
  /** Prueba de propiedad para pedidos invitados (el token de create). */
  guest_token: z.string().min(1).max(128).nullish(),
});

type Quote = {
  lines: {
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
  }[];
  subtotal_clp: number;
  discount_clp: number;
  discount_id: string | null;
  shipping_clp: number;
  total_clp: number;
};

class CheckoutError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function svc(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    ?? Deno.env.get("SUPABASE_SECRET_KEY")
    ?? "";
  if (!url || !key) throw new Error("faltan SUPABASE_URL / service key en la función");
  return createClient(url, key, { auth: { persistSession: false } });
}

function storageBase(): string {
  const fromEnv = (Deno.env.get("PUBLIC_STORAGE_URL") ?? "").replace(/\/$/, "");
  if (fromEnv) return `${fromEnv}/storage/v1/object/public/product-images`;
  return `${(Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "")}/storage/v1/object/public/product-images`;
}

function dbCode(err: { message?: string } | null, fallback: string): string {
  const msg = err?.message ?? "";
  const m = msg.match(/([A-Z_]+)(:|$)/);
  return m ? (m[1] as string) : fallback;
}

async function computeQuote(
  db: SupabaseClient,
  input: { items: { product_id: string; qty: number }[]; shipping_rate_id: string; discount_code?: string | null; region: string },
): Promise<Quote> {
  const ids = [...new Set(input.items.map((i) => i.product_id))];
  const { data: products, error: pErr } = await db
    .from("products")
    .select("id,slug,name,brand_id,size,color,condition,price_clp,stock,availability,published_at")
    .in("id", ids);
  if (pErr) throw new CheckoutError(500, "DB_ERROR", "No se pudo validar el carrito.");
  const byId = new Map(((products ?? []) as Record<string, unknown>[]).map((r) => [r["id"] as string, r]));

  const brandIds = [...new Set([...byId.values()].map((r) => (r as Record<string, unknown>)["brand_id"] as string).filter(Boolean))];
  let brandById = new Map<string, string>();
  if (brandIds.length > 0) {
    const { data: brands } = await db.from("brands").select("id,name").in("id", brandIds);
    brandById = new Map(((brands ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));
  }
  const { data: covers } = await db
    .from("product_images")
    .select("product_id,storage_path")
    .in("product_id", ids)
    .eq("is_cover", true);
  const coverByProduct = new Map(
    ((covers ?? []) as { product_id: string; storage_path: string }[]).map((c) => [
      c.product_id,
      `${storageBase()}/${c.storage_path}`,
    ]),
  );

  const lines: Quote["lines"] = [];
  for (const item of input.items) {
    const p = byId.get(item.product_id) as
      | {
        slug: string; name: string; brand_id: string | null; size: string | null;
        color: string | null; condition: string; price_clp: number; stock: number;
        availability: string; published_at: string | null;
      }
      | undefined;
    if (!p || !p.published_at || p.availability === "ARCHIVED" || p.availability === "SOLD") {
      throw new CheckoutError(409, "PRODUCT_UNAVAILABLE", "Una prenda ya no está disponible.");
    }
    if (p.stock < item.qty) {
      throw new CheckoutError(409, "INSUFFICIENT_STOCK", `Stock insuficiente para "${p.name}".`);
    }
    lines.push({
      product_id: item.product_id,
      qty: item.qty,
      unit_price_clp: p.price_clp,
      product_slug: p.slug,
      product_name: p.name,
      brand_name: (p.brand_id && brandById.get(p.brand_id)) || null,
      size: p.size,
      color: p.color,
      condition: p.condition,
      image_url: coverByProduct.get(item.product_id) ?? null,
    });
  }

  const subtotal = lines.reduce((n, l) => n + l.unit_price_clp * l.qty, 0);

  const { data: rate, error: rErr } = await db
    .from("shipping_rates")
    .select("id,region,price_clp,is_active")
    .eq("id", input.shipping_rate_id)
    .maybeSingle();
  if (rErr || !rate) throw new CheckoutError(400, "INVALID_RATE", "Tarifa de despacho inválida.");
  const typedRate = rate as unknown as { region: string; price_clp: number; is_active: boolean };
  if (!typedRate.is_active) throw new CheckoutError(400, "INVALID_RATE", "Tarifa de despacho inactiva.");
  if (typedRate.region !== input.region && typedRate.region !== "OTRAS") {
    throw new CheckoutError(400, "INVALID_RATE", "La tarifa no corresponde a tu región.");
  }

  let discount_clp = 0;
  let discount_id: string | null = null;
  const code = input.discount_code?.trim();
  if (code) {
    const { data, error } = await db.rpc("validate_discount_code", {
      p_code: code,
      p_subtotal: subtotal,
    });
    if (error) {
      const map: Record<string, string> = {
        DISCOUNT_NOT_FOUND: "El cupón no existe.",
        DISCOUNT_INACTIVE: "El cupón está inactivo.",
        DISCOUNT_NOT_STARTED: "El cupón aún no es válido.",
        DISCOUNT_EXPIRED: "El cupón venció.",
        DISCOUNT_MIN_SUBTOTAL: "El cupón requiere un monto mínimo.",
        DISCOUNT_USAGE_LIMIT: "El cupón agotó sus usos.",
      };
      const c = dbCode(error, "INVALID_DISCOUNT");
      throw new CheckoutError(400, c, map[c] ?? "Cupón inválido.");
    }
    const row = (Array.isArray(data) ? data[0] : data) as unknown as {
      discount_id: string;
      amount_clp: number;
    };
    discount_id = row.discount_id;
    discount_clp = row.amount_clp;
  }

  return {
    lines,
    subtotal_clp: subtotal,
    discount_clp,
    discount_id,
    shipping_clp: typedRate.price_clp,
    total_clp: subtotal - discount_clp + typedRate.price_clp,
  };
}

async function handleQuote(db: SupabaseClient, body: unknown): Promise<Response> {
  const parsed = quoteSchema.safeParse(body);
  if (!parsed.success) return bad(400, "VALIDATION", "Datos de cotización inválidos.");
  const q = await computeQuote(db, {
    ...parsed.data,
    region: parsed.data.region,
    discount_code: parsed.data.discount_code,
  });
  const { discount_id: _discountId, ...publicQuote } = q;
  void _discountId;
  return ok(publicQuote);
}

async function handleCreate(db: SupabaseClient, userId: string | null, body: unknown): Promise<Response> {
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return bad(400, "VALIDATION", "Datos de checkout inválidos.");
  const input = parsed.data;

  const quote = await computeQuote(db, {
    items: input.items,
    shipping_rate_id: input.shipping_rate_id,
    discount_code: input.discount_code,
    region: input.address.region,
  });

  const guestToken = userId ? null : [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");

  const { data: order, error: oErr } = await db
    .from("orders")
    .insert({
      user_id: userId,
      guest_token: guestToken,
      status: "PENDING_PAYMENT",
      subtotal_clp: quote.subtotal_clp,
      discount_clp: quote.discount_clp,
      shipping_clp: quote.shipping_clp,
      total_clp: quote.total_clp,
      shipping_address: input.address,
      discount_code: input.discount_code?.trim() || null,
      shipping_rate_id: input.shipping_rate_id,
    })
    .select("id,order_number,guest_token,total_clp")
    .single();
  if (oErr || !order) throw new CheckoutError(500, "DB_ERROR", "No se pudo crear el pedido.");
  const typedOrder = order as unknown as { id: string; order_number: string; guest_token: string | null; total_clp: number };

  try {
    const { error: itemsErr } = await db.from("order_items").insert(
      quote.lines.map((l) => ({
        order_id: typedOrder.id,
        product_id: l.product_id,
        product_slug: l.product_slug,
        product_name: l.product_name,
        brand_name: l.brand_name,
        size: l.size,
        color: l.color,
        condition: l.condition,
        image_url: l.image_url,
        unit_price_clp: l.unit_price_clp,
        qty: l.qty,
      })),
    );
    if (itemsErr) throw new CheckoutError(500, "DB_ERROR", "No se pudo crear el pedido.");

    if (quote.discount_id) {
      // Guardia atómica contra carreras por límite de usos.
      const { data: claimed, error: claimErr } = await db.rpc("claim_discount_usage", {
        p_discount_id: quote.discount_id,
      });
      if (claimErr || claimed !== true) {
        throw new CheckoutError(409, "DISCOUNT_USAGE_LIMIT", "El cupón agotó sus usos.");
      }
      await db.from("discount_usages").insert({
        discount_id: quote.discount_id,
        order_id: typedOrder.id,
        user_id: userId,
      });
    }

    if (input.save_address && userId) {
      await db.from("addresses").insert({
        user_id: userId,
        full_name: input.address.fullName,
        email: input.address.email,
        phone: input.address.phone,
        street: input.address.street,
        comuna: input.address.comuna,
        region: input.address.region,
        zip_code: input.address.zipCode ?? null,
        notes: input.address.notes ?? null,
      });
    }

    const { error: reserveErr } = await db.rpc("reserve_products", {
      p_order_id: typedOrder.id,
      p_items: input.items.map((i) => ({ product_id: i.product_id, qty: i.qty })),
    });
    if (reserveErr) {
      throw new CheckoutError(409, dbCode(reserveErr, "RESERVE_FAILED"), "Una prenda se agotó mientras pagabas. Vuelve a intentarlo.");
    }
  } catch (e) {
    await db.from("orders").delete().eq("id", typedOrder.id);
    throw e;
  }

  const provider = getPaymentProvider();
  const webhookBase = (Deno.env.get("FUNCTIONS_PUBLIC_URL") ?? "").replace(/\/$/, "");
  const payment = await provider.createPayment(
    {
      orderId: typedOrder.id,
      orderNumber: typedOrder.order_number,
      amountClp: typedOrder.total_clp,
      returnUrl: input.return_url ?? undefined,
      webhookUrl: webhookBase ? `${webhookBase}/functions/v1/checkout` : undefined,
      email: input.address.email,
    },
    typedOrder.id,
  );
  await db.from("payments").insert({
    order_id: typedOrder.id,
    provider: provider.name,
    provider_payment_id: payment.providerPaymentId,
    amount_clp: typedOrder.total_clp,
    status: "pending",
    idempotency_key: typedOrder.id,
  });

  // Email transaccional best-effort (nunca falla el checkout).
  try {
    await sendOrderEmail(db, typedOrder.id, "order_created");
  } catch (e) {
    console.warn("order_created email falló:", e);
  }

  return ok({
    order_id: typedOrder.id,
    order_number: typedOrder.order_number,
    guest_token: typedOrder.guest_token,
    total_clp: typedOrder.total_clp,
    payment: {
      provider: provider.name,
      provider_payment_id: payment.providerPaymentId,
      status: payment.status,
      checkout_url: payment.checkoutUrl,
    },
  });
}

/** Convergencia idempotente pago→pedido. Retorna respuesta lista o null si nada que hacer. */
async function convergePaid(
  db: SupabaseClient,
  order: { id: string; order_number: string; status: string; guest_token: string | null },
  paymentId: string,
): Promise<Response | null> {
  if (order.status === "PAID") {
    return ok({
      order_id: order.id,
      order_number: order.order_number,
      status: "PAID",
      guest_token: order.guest_token,
      already: true,
    });
  }
  if (order.status !== "PENDING_PAYMENT") {
    return bad(409, "INVALID_STATUS", "El pedido ya no puede pagarse.");
  }
  const { data: payment } = await db
    .from("payments")
    .select("id,status")
    .eq("id", paymentId)
    .maybeSingle();
  if ((payment as unknown as { status: string } | null)?.status === "approved") {
    await db.rpc("mark_order_paid", { p_order_id: order.id });
    try {
      await sendOrderEmail(db, order.id, "payment_confirmed");
    } catch (e) {
      console.warn("payment_confirmed email falló:", e);
    }
    return ok({
      order_id: order.id,
      order_number: order.order_number,
      status: "PAID",
      guest_token: order.guest_token,
      already: true,
    });
  }
  await db.from("payments").update({ status: "approved" }).eq("id", paymentId);
  const { error: paidErr } = await db.rpc("mark_order_paid", { p_order_id: order.id });
  if (paidErr) {
    const code = dbCode(paidErr, "CONFIRM_FAILED");
    if (code === "RESERVATION_EXPIRED") {
      return bad(409, code, "La reserva venció. Vuelve a hacer checkout.");
    }
    return bad(500, code, "No se pudo confirmar el pago.");
  }
  try {
    await sendOrderEmail(db, order.id, "payment_confirmed");
  } catch (e) {
    console.warn("payment_confirmed email falló:", e);
  }
  return null;
}

/** Resuelve el user_id desde el JWT (null si ausente/inválido → invitado). */
async function authUserId(db: SupabaseClient, req: Request): Promise<string | null> {
  const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data } = await db.auth.getUser(jwt);
  return data.user?.id ?? null;
}

/** Comparación timing-safe para no filtrar el token por tiempo de respuesta. */
function tokensEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

async function handleConfirm(db: SupabaseClient, userId: string | null, body: unknown): Promise<Response> {
  const parsed = confirmSchema.safeParse(body);
  if (!parsed.success) return bad(400, "VALIDATION", "order_id inválido.");
  const { order_id, guest_token } = parsed.data;

  const { data: order } = await db
    .from("orders")
    .select("id,user_id,order_number,status,total_clp,guest_token")
    .eq("id", order_id)
    .maybeSingle();
  const typedOrder = order as unknown as {
    id: string; user_id: string | null; order_number: string; status: string; total_clp: number; guest_token: string | null;
  } | null;
  if (!typedOrder) return bad(404, "ORDER_NOT_FOUND", "Pedido no encontrado.");

  // API1 BOLA: confirmar exige probar propiedad. Pedido con dueño → JWT del
  // dueño; pedido invitado → guest_token entregado en create.
  if (typedOrder.user_id) {
    if (!userId || userId !== typedOrder.user_id) {
      return bad(403, "FORBIDDEN", "No puedes confirmar este pedido.");
    }
  } else if (!typedOrder.guest_token || !guest_token || !tokensEqual(guest_token, typedOrder.guest_token)) {
    return bad(403, "FORBIDDEN", "No puedes confirmar este pedido.");
  }

  const { data: payment } = await db
    .from("payments")
    .select("id,provider,provider_payment_id,amount_clp,status")
    .eq("order_id", order_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const typedPayment = payment as unknown as {
    id: string; provider: string; provider_payment_id: string; amount_clp: number; status: string;
  } | null;
  if (!typedPayment) return bad(404, "PAYMENT_NOT_FOUND", "Pago no encontrado.");

  const provider = getPaymentProvider();
  const verdict = await provider.verifyPayment(
    typedPayment.provider_payment_id,
    typedOrder.total_clp,
    typedOrder.id,
  );
  if (verdict !== "APPROVED") {
    await db.from("payments").update({ status: "rejected" }).eq("id", typedPayment.id);
    return bad(402, "PAYMENT_REJECTED", "El pago fue rechazado.");
  }
  const converged = await convergePaid(db, typedOrder, typedPayment.id);
  if (converged) return converged;
  return ok({ order_id, order_number: typedOrder.order_number, status: "PAID", guest_token: typedOrder.guest_token });
}

/** Webhook genérico (hoy: Mercado Pago). Idempotente y con firma verificada. */
async function handleWebhook(db: SupabaseClient, req: Request, body: unknown): Promise<Response> {
  const provider = getPaymentProvider();
  const url = new URL(req.url);
  const headers: Record<string, string | undefined> = {};
  req.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v;
  });
  const query: Record<string, string | undefined> = {};
  url.searchParams.forEach((v, k) => {
    query[k] = v;
  });
  let result;
  try {
    result = await provider.handleWebhook({ headers, query, body });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "webhook inválido";
    const status = msg.includes("firma inválida") ? 401 : 400;
    return bad(status, "WEBHOOK_REJECTED", msg);
  }
  if (result.status !== "APPROVED") {
    return Response.json({ received: true }, { status: 200 });
  }
  const { data: order } = await db
    .from("orders")
    .select("id,order_number,status,guest_token")
    .eq("id", result.orderId)
    .maybeSingle();
  const typedOrder = order as unknown as {
    id: string; order_number: string; status: string; guest_token: string | null;
  } | null;
  if (!typedOrder) return Response.json({ received: true }, { status: 200 });
  const { data: payment } = await db
    .from("payments")
    .select("id")
    .eq("order_id", result.orderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const paymentId = (payment as unknown as { id: string } | null)?.id;
  if (!paymentId) return Response.json({ received: true }, { status: 200 });
  const converged = await convergePaid(db, typedOrder, paymentId);
  if (converged && converged.status !== 200) {
    // No reintentar errores de negocio (ej: reserva vencida) como fallo HTTP.
    return Response.json({ received: true }, { status: 200 });
  }
  // MP espera 200/201.
  return Response.json({ received: true }, { status: 200 });
}

function ok(data: Record<string, unknown>): Response {
  return Response.json(data, { status: 200 });
}

function bad(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

serve(async (req) => {
  if (req.method !== "POST") return bad(405, "METHOD", "Solo POST.");
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad(400, "VALIDATION", "JSON inválido.");
  }
  const action = (body as Record<string, unknown>)?.["action"];
  // Webhooks MP llegan sin action (query type/data.id): cubeta amplia aparte.
  const url0 = new URL(req.url);
  const bucket = !action && url0.searchParams.get("type") === "payment"
    ? "webhook"
    : typeof action === "string" ? action : "unknown";
  const max = bucket === "webhook" ? 300 : bucket === "create" ? 30 : 60;
  const limited = rateLimit(req, { bucket: `checkout:${bucket}`, max });
  if (limited) return limited;
  try {
    const db = svc();
    if (action === "webhook") return await handleWebhook(db, req, body);
    // Webhooks MP llegan sin action (query type/data.id).
    const url = new URL(req.url);
    if (!action && url.searchParams.get("type") === "payment") {
      return await handleWebhook(db, req, body);
    }
    if (action === "quote") return await handleQuote(db, body);
    if (action === "create") {
      return await handleCreate(db, await authUserId(db, req), body);
    }
    if (action === "confirm") return await handleConfirm(db, await authUserId(db, req), body);
    return bad(400, "VALIDATION", "action debe ser quote|create|confirm|webhook.");
  } catch (e) {
    if (e instanceof CheckoutError) return bad(e.status, e.code, e.message);
    console.error("checkout error:", e);
    return bad(500, "INTERNAL", "Error interno.");
  }
});
