/**
 * EmailProvider desacoplado (Fase 9).
 * - mock: default, log a consola (dev). Retorna id mock.
 * - resend: HTTP API (RESEND_API_KEY + EMAIL_FROM). Sin SDKs.
 * Templates en español, branding mínimo Shopy. Password recovery lo maneja
 * Supabase Auth nativo (ver docs); aquí solo emails de pedido.
 */

export type OrderEmailEvent =
  | "order_created"
  | "payment_confirmed"
  | "order_preparing"
  | "order_shipped"
  | "order_delivered"
  | "order_cancelled"
  | "order_refunded";

export interface OrderEmailData {
  order_number: string;
  customer_name: string;
  total_clp: number;
  items: { name: string; qty: number; unit_price_clp: number }[];
  address_line: string;
  carrier?: string | null;
  tracking_number?: string | null;
  tracking_url?: string | null;
  guest_token?: string | null;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

export interface EmailProvider {
  readonly name: "mock" | "resend";
  send(input: SendEmailInput): Promise<{ id: string }>;
}

const SUBJECTS: Record<OrderEmailEvent, (orderNumber: string) => string> = {
  order_created: (n) => `Recibimos tu pedido ${n} · Shopy`,
  payment_confirmed: (n) => `Pago confirmado ${n} · Shopy`,
  order_preparing: (n) => `Estamos preparando tu pedido ${n} · Shopy`,
  order_shipped: (n) => `Tu pedido ${n} va en camino · Shopy`,
  order_delivered: (n) => `Pedido ${n} entregado · Shopy`,
  order_cancelled: (n) => `Pedido ${n} cancelado · Shopy`,
  order_refunded: (n) => `Reembolso de tu pedido ${n} · Shopy`,
};

const HEADS: Record<OrderEmailEvent, string> = {
  order_created: "¡Gracias por tu compra!",
  payment_confirmed: "Pago confirmado",
  order_preparing: "Lo estamos preparando",
  order_shipped: "¡Va en camino!",
  order_delivered: "Entregado",
  order_cancelled: "Pedido cancelado",
  order_refunded: "Reembolso procesado",
};

const BODIES: Record<OrderEmailEvent, (d: OrderEmailData) => string> = {
  order_created: (d) =>
    `<p>Reservamos tus prendas por 15 minutos mientras se confirma el pago.</p>${guestTokenNote(d)}`,
  payment_confirmed: () =>
    `<p>Tu pago fue aprobado. Empezaremos a preparar tu pedido de inmediato.</p>`,
  order_preparing: () =>
    `<p>Estamos revisando y empacando tus prendas con cuidado.</p>`,
  order_shipped: (d) =>
    `<p>Tu pedido fue despachado por <strong>${escapeHtml(d.carrier ?? "transportista")}</strong>.${trackingNote(d)}</p>`,
  order_delivered: () =>
    `<p>Tu pedido fue entregado. ¡Esperamos que disfrutes tus prendas!</p>`,
  order_cancelled: () =>
    `<p>Tu pedido fue cancelado y liberamos las prendas reservadas. Si pagaste, verás la reversa según tu medio de pago.</p>`,
  order_refunded: () =>
    `<p>Procesamos el reembolso de tu pedido. El plazo depende de tu medio de pago.</p>`,
};

function guestTokenNote(d: OrderEmailData): string {
  if (!d.guest_token) return "";
  return `<p>Compraste como invitado: guarda este código para rastrear tu pedido: <strong>${escapeHtml(d.guest_token)}</strong></p>`;
}

function trackingNote(d: OrderEmailData): string {
  if (!d.tracking_number && !d.tracking_url) return "";
  const inner = d.tracking_url
    ? `<a href="${escapeHtml(d.tracking_url)}">${escapeHtml(d.tracking_number ?? "seguir pedido")}</a>`
    : escapeHtml(d.tracking_number ?? "");
  return ` Seguimiento: ${inner}.`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatCLP(n: number): string {
  return `$${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

export function renderOrderEmail(event: OrderEmailEvent, d: OrderEmailData): SendEmailInput & { subject: string } {
  const items = d.items
    .map((i) => `<li>${i.qty} × ${escapeHtml(i.name)} — ${formatCLP(i.unit_price_clp * i.qty)}</li>`)
    .join("");
  const html = `<!doctype html><html lang="es"><body style="font-family:sans-serif;max-width:560px;margin:auto;color:#111">
<h2>${HEADS[event]}</h2>
<p><strong>Pedido ${escapeHtml(d.order_number)}</strong> · ${escapeHtml(d.customer_name)}</p>
${BODIES[event](d)}
<ul>${items}</ul>
<p><strong>Total: ${formatCLP(d.total_clp)}</strong></p>
<p style="color:#666;font-size:13px">${escapeHtml(d.address_line)}</p>
<p style="color:#666;font-size:12px">Shopy · Ropa de segunda mano · Chile</p>
</body></html>`;
  return { to: "", subject: SUBJECTS[event](d.order_number), html };
}

export class MockEmailProvider implements EmailProvider {
  readonly name = "mock" as const;
  async send(input: SendEmailInput): Promise<{ id: string }> {
    console.log(`[email:mock] to=${input.to} subject=${input.subject} (${input.html.length} chars)`);
    return { id: `mock_${Date.now()}` };
  }
}

export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend" as const;
  private apiKey: string;
  private from: string;

  constructor(apiKey?: string, from?: string) {
    this.apiKey = apiKey ?? Deno.env.get("RESEND_API_KEY") ?? "";
    this.from = from ?? Deno.env.get("EMAIL_FROM") ?? "Shopy <hola@shopy.cl>";
    if (!this.apiKey) throw new Error("falta RESEND_API_KEY");
  }

  async send(input: SendEmailInput): Promise<{ id: string }> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: this.from, to: input.to, subject: input.subject, html: input.html }),
    });
    const json = (await res.json().catch(() => null)) as { id?: string; message?: string } | null;
    if (!res.ok) throw new Error(`resend -> ${res.status}: ${json?.message ?? "error"}`);
    return { id: String(json?.id ?? "") };
  }
}

export function getEmailProvider(): EmailProvider {
  const name = (Deno.env.get("EMAIL_PROVIDER") ?? "mock").toLowerCase();
  if (name === "resend") return new ResendEmailProvider();
  if (name !== "mock") throw new Error(`email provider ${name} desconocido (mock|resend)`);
  return new MockEmailProvider();
}
