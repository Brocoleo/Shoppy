/**
 * E2E del flujo de compra (P-1): carrito → checkout → creación del pedido y
 * reserva de stock.
 *
 * Es el primer E2E que recorre el camino donde está el dinero. Antes solo
 * había E2E del admin (el módulo menos riesgoso), así que una regresión en la
 * creación del pedido o en la reserva de prenda única podía llegar a
 * producción sin que nada lo detectara.
 *
 * El pago NO se completa: el proveedor real (MercadoPago) abre su página
 * externa. Lo que se verifica es todo lo que controla Shopy antes de cobrar:
 * que el pedido se crea con el total correcto, que el pago queda pendiente y
 * que la prenda queda RESERVADA (stock 0) durante 15 minutos.
 *
 * El usuario y la prenda son de prueba y se limpian al terminar.
 */
import { expect, test, type Page } from "@playwright/test";
import {
  adminClient,
  createTempUser,
  deleteTempUser,
} from "./helpers/supabase-admin";
import { WEB_URL } from "./helpers/env";

const PASSWORD = "E2ECompra-2026!x";
const RUN_ID = `e2e-compra-${Date.now()}`;
const SLUG = `prenda-compra-e2e-${Date.now()}`;
const PRICE = 10000;

interface TestOrder {
  id: string;
  order_number: string;
  status: string;
  subtotal_clp: number;
  shipping_clp: number;
  total_clp: number;
  user_id: string | null;
  guest_token: string | null;
}

let userId = "";
let productId = "";
let orderId = "";

/** Crea la prenda de prueba (publicada, stock 1) y devuelve su id. */
async function createTestProduct(): Promise<string> {
  const client = adminClient();
  const { data, error } = await client
    .from("products")
    .insert({
      slug: SLUG,
      name: `Prenda compra E2E ${RUN_ID}`,
      description: "Prenda de prueba para el flujo de compra.",
      condition: "bueno",
      price_clp: PRICE,
      stock: 1,
      availability: "AVAILABLE",
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw new Error(`[e2e] No se pudo crear la prenda: ${error.message}`);
  return data.id as string;
}

async function cleanup() {
  const client = adminClient();
  if (orderId) {
    // El intento de checkout referencia al pedido (FK): va primero.
    await client.from("checkout_attempts").delete().eq("order_id", orderId);
    // El pedido se va: sus pagos e ítems caen por cascada.
    await client.from("orders").delete().eq("id", orderId);
    // La reserva se libera y el stock vuelve (por si el pedido no llegó a crearse).
    await client.from("product_reservations").delete().eq("product_id", productId);
    await client.from("products").update({ stock: 1 }).eq("id", productId);
  }
  if (productId) await client.from("products").delete().eq("id", productId);
  if (userId) await deleteTempUser(userId);
}

/** El aviso de cookies puede tapar los controles: se cierra si aparece. */
async function dismissCookieBanner(page: Page) {
  const understood = page.getByRole("button", { name: /Entendido/i });
  if (await understood.isVisible().catch(() => false)) await understood.click();
}

async function fillAddress(page: Page, email: string) {
  await dismissCookieBanner(page);
  await page.getByLabel("Nombre completo").fill("María González");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Teléfono").fill("+56912345678");
  await page.getByLabel("Calle y número").fill("Av. Providencia 1234");
  // Región y comuna son listboxes propios (no <select>): se abre y se elige.
  await page.getByRole("combobox", { name: "Región" }).click();
  await page.getByRole("option", { name: "Metropolitana" }).click();
  await page.getByRole("combobox", { name: "Comuna" }).click();
  await page.getByRole("option", { name: "Providencia" }).click();
}

test("el checkout crea el pedido y reserva la prenda", async ({ browser }) => {
  const email = `e2e-compra-${Date.now()}@example.com`;
  const user = await createTempUser(email, PASSWORD);
  userId = user.id;
  productId = await createTestProduct();

  const context = await browser.newContext();
  try {
    const page = await context.newPage();

    // 1) La prenda aparece en el catálogo y se agrega al carrito.
    await page.goto(`${WEB_URL}/producto/${SLUG}`);
    await page.getByRole("button", { name: /Agregar al carrito/i }).click();
    await expect(page.getByRole("button", { name: /Agregada al carrito/i })).toBeVisible();

    // 2) Checkout: dirección → tarifa → medio de pago.
    await page.goto(`${WEB_URL}/checkout`);
    await fillAddress(page, email);
    await page.getByRole("button", { name: /Continuar/i }).first().click();

    // La tarifa aparece cuando ya hay región y comuna.
    const rate = page.locator('input[name="shippingRate"]').first();
    await expect(rate).toBeVisible({ timeout: 30_000 });
    await rate.check();

    // 3) Se revisa el pedido y se elige el medio de pago.
    // El botón se habilita cuando la cotización llega. Con los servidores
    // recién arrancados esa llamada tarda: se espera a que se habilite en
    // vez de fallar al primer clic.
    const revisar = page.getByRole("button", { name: /Revisar pedido/i });
    await expect(revisar).toBeEnabled({ timeout: 60_000 });
    await revisar.click();
    const provider = page.locator('input[name="paymentProvider"]').first();
    await expect(provider).toBeVisible({ timeout: 30_000 });
    await provider.check();

    // 4) "Pagar" crea el pedido y abre el proveedor externo.
    const pagar = page.getByRole("button", { name: /^Pagar/i }).first();
    await pagar.waitFor({ state: "visible", timeout: 30_000 });
    await pagar.click();

    // 4) El pedido existe, con el total correcto, y la prenda quedó reservada.
    const client = adminClient();
    await expect
      .poll(
        async () => {
          // El checkout se hace como invitado: el pedido se localiza por la
          // prenda de prueba que contiene, no por el usuario.
          const { data } = await client
            .from("order_items")
            .select("order_id")
            .eq("product_id", productId)
            .limit(1);
          const found = (data ?? [])[0] as { order_id: string } | undefined;
          if (found) orderId = found.order_id;
          return found?.order_id ?? null;
        },
        { timeout: 45_000, intervals: [1000] },
      )
      .toBeTruthy();

    const { data: orders } = await client
      .from("orders")
      .select("id,order_number,status,subtotal_clp,shipping_clp,total_clp,user_id,guest_token")
      .eq("id", orderId)
      .single();
    const order = orders as TestOrder;
    expect(order.status).toBe("PENDING_PAYMENT");
    // El total es el subtotal de la prenda más el despacho elegido.
    expect(order.subtotal_clp).toBe(PRICE);
    expect(order.shipping_clp).toBeGreaterThan(0);
    expect(order.total_clp).toBe(order.subtotal_clp + order.shipping_clp);
    // Compra como invitada: el pedido queda con token de rastreo.
    expect(order.guest_token).toBeTruthy();

    // El pago queda pendiente (no se cobra en sandbox sin proveedor real).
    const { data: payments } = await client
      .from("payments")
      .select("id,status,amount_clp,provider")
      .eq("order_id", orderId);
    expect((payments ?? []).length).toBe(1);
    expect((payments ?? [])[0].status).toBe("pending");
    // El pago es por el total del pedido (prenda + despacho).
    expect((payments ?? [])[0].amount_clp).toBe(order.total_clp);

    // La prenda única queda reservada: stock 0 y reserva activa.
    const { data: product } = await client
      .from("products")
      .select("stock,availability")
      .eq("id", productId)
      .single();
    expect(product?.stock).toBe(0);
    expect(product?.availability).toBe("RESERVED");

    const { data: reservations } = await client
      .from("product_reservations")
      .select("status,qty")
      .eq("order_id", orderId);
    expect((reservations ?? []).length).toBe(1);
    expect((reservations ?? [])[0].status).toBe("active");
  } finally {
    await context.close();
    await cleanup();
  }
});
