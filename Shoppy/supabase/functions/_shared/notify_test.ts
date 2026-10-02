/**
 * Tests Fase 9 (puros, sin red ni credenciales).
 * Correr: deno test --allow-env --allow-net supabase/functions/_shared/notify_test.ts
 */
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  MockEmailProvider,
  getEmailProvider,
  renderOrderEmail,
  type OrderEmailData,
  type OrderEmailEvent,
} from "./email.ts";
import { ManualShippingProvider, getShippingProvider } from "./shipping.ts";

const SAMPLE: OrderEmailData = {
  order_number: "SHO-TEST01",
  customer_name: "María González",
  total_clp: 38980,
  items: [{ name: "Chaqueta trucker Levi's", qty: 1, unit_price_clp: 34990 }],
  address_line: "Calle 1, Providencia, Metropolitana",
  carrier: "Chilexpress",
  tracking_number: "123",
  tracking_url: "https://ejemplo.cl/t/123",
  guest_token: "abc123",
};

const EVENTS: OrderEmailEvent[] = [
  "order_created",
  "payment_confirmed",
  "order_preparing",
  "order_shipped",
  "order_delivered",
  "order_cancelled",
  "order_refunded",
];

Deno.test("email: los 7 templates incluyen nº pedido, total e ítems", () => {
  for (const event of EVENTS) {
    const { subject, html } = renderOrderEmail(event, SAMPLE);
    assert(subject.includes("SHO-TEST01"), `${event}: subject sin nº`);
    assert(html.includes("SHO-TEST01"), `${event}: html sin nº`);
    assert(html.includes("$38.980"), `${event}: html sin total`);
    assert(html.includes("Chaqueta trucker Levi"), `${event}: html sin ítem`);
    assert(!html.includes("<script"), `${event}: html inseguro`);
  }
});

Deno.test("email: token invitado y tracking solo cuando existen", () => {
  const created = renderOrderEmail("order_created", SAMPLE);
  assert(created.html.includes("abc123"), "created debe incluir token guest");
  const paid = renderOrderEmail("payment_confirmed", { ...SAMPLE, guest_token: null });
  assert(!paid.html.includes("abc123"), "sin token no debe mencionarlo");
  const shipped = renderOrderEmail("order_shipped", SAMPLE);
  assert(shipped.html.includes("Chilexpress") && shipped.html.includes("123"), "shipped con carrier+tracking");
  const preparing = renderOrderEmail("order_preparing", { ...SAMPLE, tracking_number: null, tracking_url: null });
  assert(!preparing.html.includes("Seguimiento"), "sin tracking no debe mencionarlo");
});

Deno.test("email: mock loguea y factory default", async () => {
  assertEquals(getEmailProvider().name, "mock");
  const { id } = await new MockEmailProvider().send({ to: "a@b.cl", subject: "s", html: "<p>x</p>" });
  assert(id.startsWith("mock_"));
});

Deno.test("email: resend sin key falla explícito", () => {
  Deno.env.set("EMAIL_PROVIDER", "resend");
  try {
    let msg = "";
    try {
      getEmailProvider();
    } catch (e) {
      msg = (e as Error).message;
    }
    assert(msg.includes("RESEND_API_KEY"), `debía exigir key, fue: ${msg}`);
  } finally {
    Deno.env.delete("EMAIL_PROVIDER");
  }
});

Deno.test("shipping: manual ordena por precio y track usa registros", async () => {
  assertEquals(getShippingProvider().name, "manual");
  const p = new ManualShippingProvider(
    [
      { carrier: "Chilexpress", price_clp: 3990, eta_days_min: 1, eta_days_max: 2 },
      { carrier: "Starken", price_clp: 2990, eta_days_min: 1, eta_days_max: 2 },
    ],
    new Map([["1", { carrier: "Starken", tracking_number: "1", tracking_url: null, status: "SHIPPED" }]]),
  );
  const quotes = await p.quote();
  assertEquals(quotes.map((q) => q.carrier), ["Starken", "Chilexpress"]);
  assertEquals((await p.track("1")).status, "SHIPPED");
  let msg = "";
  try {
    await p.track("nope");
  } catch (e) {
    msg = (e as Error).message;
  }
  assert(msg.includes("no encontrado"));
});

Deno.test("shipping: carriers sin credenciales fallan explícito", () => {
  for (const [name, varName] of [["chilexpress", "CHILEXPRESS_API_KEY"], ["starken", "STARKEN_API_KEY"]]) {
    Deno.env.set("SHIPPING_PROVIDER", name);
    try {
      let msg = "";
      try {
        getShippingProvider();
      } catch (e) {
        msg = (e as Error).message;
      }
      assert(msg.includes(varName), `${name} debía exigir ${varName}, fue: ${msg}`);
    } finally {
      Deno.env.delete("SHIPPING_PROVIDER");
    }
  }
});
