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
import { z } from "npm:zod@3.25.76";
import { getPaymentProvider, enabledPaymentProviders, sandboxOnly } from "../_shared/payment.ts";
import { sendOrderEmail } from "../_shared/notify.ts";
import { rateLimit } from "../_shared/ratelimit.ts";
import { addressFields, addressIssues, isKnownRegion, matchesShippingRegion, isCommercialProduct } from "../_shared/checkout-rules.ts";

const addressSchema = z.object({
  fullName: z.string().min(addressFields.fullName.min).max(addressFields.fullName.max),
  email: z.string().email().max(addressFields.email.max),
  phone: z.string().min(addressFields.phone.min).max(addressFields.phone.max),
  street: z.string().min(addressFields.street.min).max(addressFields.street.max),
  comuna: z.string().min(addressFields.comuna.min).max(addressFields.comuna.max),
  region: z.string().min(addressFields.region.min).max(addressFields.region.max),
  zipCode: z.string().max(addressFields.zipCode.max).nullish(),
  notes: z.string().max(addressFields.notes.max).nullish(),
}).superRefine((address, ctx) => {
  for (const issue of addressIssues(address)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [issue.path], message: issue.message });
  }
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
  region: z.string().min(2).max(100).refine(isKnownRegion, "Región inválida."),
});

const createSchema = z.object({
  action: z.literal("create"),
  items: z.array(itemSchema).min(1).max(50),
  address: addressSchema,
  shipping_rate_id: z.string().uuid(),
  discount_code: z.string().max(40).nullish(),
  save_address: z.boolean().optional(),
  provider: z.enum(["mock", "mercadopago", "transbank"]).optional(),
  idempotency_key: z.string().uuid().optional(),
  attempt_secret: z.string().uuid().optional(),
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
  const code = msg.match(/^([A-Z_]+)(:|$)/)?.[1];
  const publicCodes = new Set([
    "DISCOUNT_NOT_FOUND", "DISCOUNT_INACTIVE", "DISCOUNT_NOT_STARTED",
    "DISCOUNT_EXPIRED", "DISCOUNT_MIN_SUBTOTAL", "DISCOUNT_USAGE_LIMIT",
    "ATTEMPT_NOT_AVAILABLE", "INSUFFICIENT_STOCK", "PRODUCT_UNAVAILABLE",
    "INVALID_QTY", "ORDER_NOT_FOUND", "RESERVATION_EXPIRED",
  ]);
  return code && publicCodes.has(code) ? code : fallback;
}

async function computeQuote(
  db: SupabaseClient,
  input: { items: { product_id: string; qty: number }[]; shipping_rate_id: string; discount_code?: string | null; region: string },
): Promise<Quote> {
  const ids = [...new Set(input.items.map((i) => i.product_id))];
  if (ids.length !== input.items.length) throw new CheckoutError(400, "VALIDATION", "Productos repetidos.");
  const { data: products, error: pErr } = await db
    .from("products")
    .select("id,slug,name,brand_id,size,color,condition,price_clp,stock,availability,published_at,metadata")
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
      // ?v=2 invalida caché de cliente tras regenerar placeholders (ver mobile publicImageUrl).
      `${storageBase()}/${c.storage_path}?v=2`,
    ]),
  );

  const lines: Quote["lines"] = [];
  for (const item of input.items) {
    const p = byId.get(item.product_id) as
      | {
        slug: string; name: string; brand_id: string | null; size: string | null;
        color: string | null; condition: string; price_clp: number; stock: number;
        id: string; metadata?: unknown; availability: string; published_at: string | null;
      }
      | undefined;
    if (!p || !isCommercialProduct(p)) {
      throw new CheckoutError(409, "PRODUCT_UNAVAILABLE", "Una prenda ya no está disponible.");
    }
    if (!Number.isSafeInteger(p.stock) || !Number.isSafeInteger(p.price_clp) || p.price_clp <= 0) {
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
  if (!matchesShippingRegion(typedRate.region, input.region)) {
    throw new CheckoutError(400, "INVALID_RATE", "La tarifa no corresponde a tu región.");
  }
  if (!Number.isSafeInteger(typedRate.price_clp) || typedRate.price_clp < 0) {
    throw new CheckoutError(400, "INVALID_RATE", "Tarifa de despacho inválida.");
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
    if (!row || !Number.isSafeInteger(row.amount_clp) || row.amount_clp < 0 || row.amount_clp > subtotal) {
      throw new CheckoutError(500, "DB_ERROR", "No se pudo validar el cupón.");
    }
    discount_id = row.discount_id;
    discount_clp = row.amount_clp;
  }

  if (!Number.isSafeInteger(subtotal) || !Number.isSafeInteger(subtotal - discount_clp + typedRate.price_clp)) {
    throw new CheckoutError(409, "INVALID_TOTAL", "No se pudo calcular el total del pedido.");
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

async function digest(value: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map((v) => v.toString(16).padStart(2, "0")).join("");
}

async function recoverAttempt(db: SupabaseClient, userId: string | null, key: string, secret: string, requestHash?: string): Promise<Response> {
  const { data: attempt, error } = await db.from("checkout_attempts").select("*").eq("id", key).maybeSingle();
  if (error) throw new CheckoutError(500, "DB_ERROR", "No se pudo recuperar el intento.");
  if (!attempt) return bad(404, "ATTEMPT_NOT_FOUND", "Intento no recibido. Puedes reenviar la misma solicitud.");
  if (attempt.user_id !== userId || !tokensEqual(attempt.secret_hash, await digest(secret))) return bad(403, "FORBIDDEN", "No puedes recuperar este intento.");
  if (requestHash && attempt.request_hash !== requestHash) return bad(409, "ATTEMPT_CHANGED", "Recupera el intento anterior antes de cambiar el pedido.");
  if (attempt.response) return ok(attempt.response);
  if (attempt.order_id) {
    const [{ data: order }, { data: payment }] = await Promise.all([
      db.from("orders").select("id,order_number,guest_token,total_clp").eq("id", attempt.order_id).maybeSingle(),
      db.from("payments").select("provider,provider_payment_id,status,checkout_url,return_token").eq("order_id", attempt.order_id).maybeSingle(),
    ]);
    if (order && payment?.provider_payment_id) {
      const bridge = (Deno.env.get("PAYMENT_BRIDGE_URL") ?? "").replace(/\/$/, "");
      const response = { order_id: order.id, order_number: order.order_number, guest_token: order.guest_token, total_clp: order.total_clp, payment: { ...payment, checkout_url: payment.provider === "transbank" ? `${bridge}/api/payments/start?state=${payment.return_token}` : payment.checkout_url } };
      await db.from("checkout_attempts").update({ state: "ready", response }).eq("id", key);
      return ok(response);
    }
  }
  if (attempt.state === "failed") return bad(409, "ATTEMPT_FAILED", "El intento no creó un pedido. Puedes iniciar uno nuevo.");
  return bad(409, attempt.state === "review" ? "ATTEMPT_REVIEW" : "ATTEMPT_PROCESSING", "El pedido sigue pendiente de recuperación. No vuelvas a comprar; verifica este intento.");
}

async function handleCreate(db: SupabaseClient, userId: string | null, body: unknown): Promise<Response> {
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return bad(400, "VALIDATION", "Datos de checkout inválidos.");
  const input = parsed.data;
  if (Boolean(input.idempotency_key) !== Boolean(input.attempt_secret)) return bad(400, "VALIDATION", "El intento requiere clave y secreto.");
  if (new Set(input.items.map((i) => i.product_id)).size !== input.items.length) return bad(400, "VALIDATION", "Productos repetidos.");
  const providerName = input.provider ?? Deno.env.get("PAYMENT_PROVIDER") ?? "mock";
  if (!enabledPaymentProviders().includes(providerName)) return bad(400, "PROVIDER_DISABLED", "Medio de pago no disponible.");
  const provider = getPaymentProvider(providerName);
  const betaUrl = (Deno.env.get("PAYMENT_BRIDGE_URL") ?? "").replace(/\/$/, "");
  if (provider.name !== "mock" && !betaUrl.startsWith("https://")) return bad(503, "PAYMENT_CONFIG", "El pago de prueba aún no está configurado.");
  const key = input.idempotency_key ?? crypto.randomUUID();
  const secret = input.attempt_secret ?? crypto.randomUUID();
  const { idempotency_key: _key, attempt_secret: _secret, return_url: _return, ...fingerprint } = input;
  const requestHash = await digest(JSON.stringify(fingerprint));
  const { error: claimError } = await db.from("checkout_attempts").insert({ id: key, user_id: userId, secret_hash: await digest(secret), request_hash: requestHash });
  if (claimError?.code === "23505") return recoverAttempt(db, userId, key, secret, requestHash);
  if (claimError) throw new CheckoutError(500, "DB_ERROR", "No se pudo iniciar el intento.");
  let createdOrder = false;
  try {
    const quote = await computeQuote(db, { ...input, region: input.address.region });
    const mode = sandboxOnly() ? "test" : "live";
    const { data: order, error } = await db.rpc("create_checkout_order", {
      p_attempt: key, p_user: userId, p_guest_token: userId ? null : crypto.randomUUID(), p_input: input, p_quote: quote, p_mode: mode,
    });
    if (error || !order) throw new CheckoutError(409, dbCode(error, "CREATE_FAILED"), "No se pudo reservar el pedido. Revisa stock y cupón.");
    createdOrder = true;
    const returnToken = crypto.randomUUID();
    const { data: payRow, error: payError } = await db.from("payments").insert({ order_id: order.id, provider: provider.name, amount_clp: order.total_clp, status: "pending", idempotency_key: key, return_token: returnToken, mode }).select("id").single();
    if (payError) throw new Error("No se pudo registrar el intento de pago");
    const functionsBase = (Deno.env.get("FUNCTIONS_PUBLIC_URL") ?? `${Deno.env.get("SUPABASE_URL")}/functions/v1`).replace(/\/$/, "").replace(/\/functions\/v1$/, "");
    const payment = await provider.createPayment({ orderId: order.id, orderNumber: order.order_number, amountClp: order.total_clp,
      returnUrl: `${betaUrl}/api/payments/return?state=${returnToken}`, webhookUrl: `${functionsBase}/functions/v1/checkout`, email: input.address.email }, key);
    const { error: updateError } = await db.from("payments").update({ provider_payment_id: payment.providerPaymentId, checkout_url: payment.checkoutUrl }).eq("id", payRow.id);
    if (updateError) throw updateError;
    const response = { order_id: order.id, order_number: order.order_number, guest_token: order.guest_token, total_clp: order.total_clp,
      payment: { provider: provider.name, provider_payment_id: payment.providerPaymentId, status: payment.status, checkout_url: provider.name === "transbank" ? `${betaUrl}/api/payments/start?state=${returnToken}` : payment.checkoutUrl } };
    const { error: readyError } = await db.from("checkout_attempts").update({ state: "ready", response }).eq("id", key);
    if (readyError) throw readyError;
    if (input.save_address && userId) {
      await db.from("addresses").insert({ user_id: userId, full_name: input.address.fullName, email: input.address.email, phone: input.address.phone, street: input.address.street, comuna: input.address.comuna, region: input.address.region, zip_code: input.address.zipCode ?? null, notes: input.address.notes ?? null });
    }
    try { await sendOrderEmail(db, order.id, "order_created"); } catch { console.warn("order_created email pendiente"); }
    return ok(response);
  } catch (e) {
    await db.from("checkout_attempts").update({ state: createdOrder ? "review" : "failed", error_code: e instanceof CheckoutError ? e.code : "PROVIDER_UNCERTAIN" }).eq("id", key);
    if (createdOrder) throw new CheckoutError(409, "ATTEMPT_REVIEW", "No pudimos confirmar la creación del pago. Conservamos el pedido para revisión; no vuelvas a comprar.");
    throw e;
  }
}

/** Convergencia idempotente pago→pedido. Retorna respuesta lista o null si nada que hacer. */
async function convergePaid(db: SupabaseClient, order: { id: string; order_number: string; status: string; guest_token: string | null }, paymentId: string): Promise<Response | null> {
  const { data: outcome, error } = await db.rpc("settle_checkout_payment", { p_payment: paymentId });
  if (error) throw new CheckoutError(500, "CONFIRM_FAILED", "No se pudo registrar la confirmación. Verifica nuevamente.");
  if (outcome === "REFUND_REQUIRED") return bad(409, "REFUND_REQUIRED", "La reserva venció después del pago. Tu pago está en revisión para reembolso.");
  if (outcome === "REFUNDED") return bad(409, "REFUNDED", "El pago fue reembolsado.");
  try { await sendOrderEmail(db, order.id, "payment_confirmed"); } catch { console.warn("payment_confirmed email pendiente"); }
  return ok({ order_id: order.id, order_number: order.order_number, status: "PAID", guest_token: order.guest_token });
}

/** Solo la ausencia de JWT permite un pedido invitado; un JWT inválido se rechaza. */
async function authUserId(db: SupabaseClient, req: Request): Promise<string | null> {
  const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data } = await db.auth.getUser(jwt);
  if (!data.user) throw new CheckoutError(401, "SESSION_EXPIRED", "Tu sesión venció. Inicia sesión antes de continuar.");
  return data.user.id;
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

  if (typedPayment.amount_clp !== typedOrder.total_clp || !["mock", "mercadopago", "transbank"].includes(typedPayment.provider)) {
    return bad(409, "PAYMENT_MISMATCH", "Los datos del pago requieren revisión.");
  }
  if (typedPayment.status === "refunded") return bad(409, "REFUNDED", "El pago fue reembolsado.");
  if (typedPayment.status === "approved") return (await convergePaid(db, typedOrder, typedPayment.id))!;
  if (!typedPayment.provider_payment_id) return bad(409, "ATTEMPT_REVIEW", "El proveedor aún no está registrado. Requiere revisión.");
  const provider = getPaymentProvider(typedPayment.provider);
  const verdict = await provider.verifyPayment(
    typedPayment.provider_payment_id,
    typedOrder.total_clp,
    typedOrder.id,
  );
  if (verdict === "PENDING") return bad(409, "PAYMENT_PENDING", "El proveedor aún no confirma el pago.");
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
  const provider = getPaymentProvider("mercadopago");
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
    const status = msg.includes("firma inválida") ? 401
      : /^(webhook MP:|Modo de pago)/.test(msg) ? 400 : 503;
    return bad(status, status === 503 ? "PAYMENT_UNAVAILABLE" : "WEBHOOK_REJECTED", "No se pudo validar la notificación de pago.");
  }
  if (result.status !== "APPROVED") {
    return Response.json({ received: true }, { status: 200 });
  }
  const { data: order } = await db
    .from("orders")
    .select("id,order_number,status,guest_token,total_clp")
    .eq("id", result.orderId)
    .maybeSingle();
  const typedOrder = order as unknown as {
    id: string; order_number: string; status: string; guest_token: string | null; total_clp: number;
  } | null;
  if (!typedOrder) return Response.json({ received: true }, { status: 200 });
  if (!result.providerPaymentId || result.amountClp !== typedOrder.total_clp || result.currency !== "CLP") return bad(400, "PAYMENT_MISMATCH", "Monto o moneda inválido.");
  const { data: payment } = await db
    .from("payments")
    .select("id,amount_clp")
    .eq("order_id", result.orderId)
    .eq("provider", "mercadopago")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const typedPayment = payment as unknown as { id: string; amount_clp: number } | null;
  const paymentId = typedPayment?.id;
  if (!paymentId) return Response.json({ received: true }, { status: 200 });
  if (typedPayment?.amount_clp !== result.amountClp) return bad(400, "PAYMENT_MISMATCH", "Monto o moneda inválido.");
  const { error: eventError } = await db.from("payments").update({ raw_payload: { payment_id: result.providerPaymentId } }).eq("id", paymentId);
  if (eventError) throw eventError;
  const converged = await convergePaid(db, typedOrder, paymentId);
  if (converged && converged.status >= 500) return converged;
  if (converged && converged.status !== 200) {
    // No reintentar errores de negocio (ej: reserva vencida) como fallo HTTP.
    return Response.json({ received: true }, { status: 200 });
  }
  // MP espera 200/201.
  return Response.json({ received: true }, { status: 200 });
}

async function closeAttempt(db: SupabaseClient, userId: string | null, body: unknown): Promise<Response> {
  const parsed = z.object({ idempotency_key: z.string().uuid(), attempt_secret: z.string().uuid() }).safeParse(body);
  if (!parsed.success) return bad(400, "VALIDATION", "Intento inválido.");
  const access = await recoverAttempt(db, userId, parsed.data.idempotency_key, parsed.data.attempt_secret);
  if (access.status === 403 || access.status === 404) return access;
  const { data: attempt, error } = await db.from("checkout_attempts").select("state,order_id").eq("id", parsed.data.idempotency_key).single();
  if (error) throw error;
  if (attempt.state === "failed" && !attempt.order_id) return ok({ closed: true });
  if (!attempt.order_id || attempt.state === "review") return bad(409, "ATTEMPT_REVIEW", "El intento requiere revisión antes de iniciar otro.");
  const { data: closed, error: closeError } = await db.rpc("close_checkout_attempt", { p_order: attempt.order_id });
  if (closeError) throw closeError;
  return closed ? ok({ closed: true }) : bad(409, "PAYMENT_PENDING", "El pago sigue pendiente. Verifícalo o espera que venza la reserva.");
}

async function handleRefund(db: SupabaseClient, userId: string | null, body: unknown): Promise<Response> {
  if (!userId) return bad(403, "FORBIDDEN", "Requiere administrador.");
  const { data: profile } = await db.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (profile?.role !== "admin") return bad(403, "FORBIDDEN", "Requiere administrador.");
  const parsed = z.object({ payment_id: z.string().uuid() }).safeParse(body);
  if (!parsed.success) return bad(400, "VALIDATION", "Pago inválido.");
  const { data: payment, error } = await db.from("payments").update({ refund_state: "processing" }).eq("id", parsed.data.payment_id).eq("status", "approved").is("refund_state", null).select("*").maybeSingle();
  if (error) throw error;
  if (!payment) return bad(409, "REFUND_LOCKED", "Pago no reembolsable o reembolso ya iniciado. Revisa el estado del proveedor.");
  try {
    const providerId = payment.provider === "mercadopago" ? (payment.raw_payload?.payment_id ?? payment.provider_payment_id) : payment.provider_payment_id;
    if (!providerId) throw new Error("Falta identificador confirmado del proveedor");
    await getPaymentProvider(payment.provider).refundPayment(providerId, payment.amount_clp, payment.order_id);
    const { error: finishError } = await db.rpc("finish_checkout_refund", { p_payment: payment.id });
    if (finishError) throw finishError;
    try { await sendOrderEmail(db, payment.order_id, "order_refunded"); } catch { console.warn("order_refunded email pendiente"); }
    return ok({ refunded: true });
  } catch {
    await db.from("payments").update({ refund_state: "review", incident: "REFUND_REVIEW: verificar proveedor antes de reintentar" }).eq("id", payment.id);
    return bad(409, "REFUND_REVIEW", "Resultado del reembolso pendiente de revisión. No se repetirá automáticamente.");
  }
}

function ok(data: Record<string, unknown>): Response {
  return Response.json(data, { status: 200 });
}

function bad(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

/**
 * CORS: el browser llama quote/create/confirm desde el sitio (apikey +
 * Authorization, sin cookies/credenciales). ACAO = echo del Origin del
 * request — cubre cualquier dominio de la tienda sin wildcard (y sin el
 * comportamiento de enriquecimiento que duplicaba el header `*`).
 */
function corsHeaders(req: Request): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": req.headers.get("Origin") ?? "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, apikey, Authorization, x-client-info",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  const res = await handleCheckout(req);
  const headers = new Headers(res.headers);
  for (const [key, value] of Object.entries(corsHeaders(req))) {
    if (key === "Vary") {
      const fields = (headers.get("Vary") ?? "").split(",").map((field) => field.trim()).filter(Boolean);
      if (!fields.some((field) => field.toLowerCase() === "origin")) fields.push("Origin");
      headers.set("Vary", fields.join(", "));
    } else headers.set(key, value);
  }
  return new Response(res.body, { status: res.status, headers });
});

async function handleCheckout(req: Request): Promise<Response> {
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
    if (["create", "confirm", "recover", "close_attempt"].includes(String(action)) && body && Object.prototype.hasOwnProperty.call(body, "expected_user_id")) {
      if ((body as { expected_user_id: unknown }).expected_user_id !== await authUserId(db, req)) return bad(401, "SESSION_CHANGED", "La cuenta cambió. Recupera el pedido desde su cuenta original.");
    }
    if (action === "webhook") return await handleWebhook(db, req, body);
    // Webhooks MP llegan sin action (query type/data.id).
    const url = new URL(req.url);
    if (!action && (url.searchParams.get("type") === "payment" || (body as { type?: string })?.type === "payment")) {
      return await handleWebhook(db, req, body);
    }
    if (action === "providers") return ok({ providers: enabledPaymentProviders(), sandbox: sandboxOnly() });
    if (action === "recover") {
      const parsed = z.object({ idempotency_key: z.string().uuid(), attempt_secret: z.string().uuid() }).safeParse(body);
      if (!parsed.success) return bad(400, "VALIDATION", "Intento inválido.");
      return await recoverAttempt(db, await authUserId(db, req), parsed.data.idempotency_key, parsed.data.attempt_secret);
    }
    if (action === "close_attempt") return await closeAttempt(db, await authUserId(db, req), body);
    if (action === "refund") return await handleRefund(db, await authUserId(db, req), body);
    if (action === "quote") return await handleQuote(db, body);
    if (action === "create") {
      return await handleCreate(db, await authUserId(db, req), body);
    }
    if (action === "confirm") return await handleConfirm(db, await authUserId(db, req), body);
    return bad(400, "VALIDATION", "action debe ser quote|create|confirm|webhook.");
  } catch (e) {
    if (e instanceof CheckoutError) return bad(e.status, e.code, e.message);
    // No registrar excepciones de proveedores/DB: pueden contener datos personales o secretos.
    console.error("checkout error: INTERNAL");
    return bad(500, "INTERNAL", "Error interno.");
  }
}
