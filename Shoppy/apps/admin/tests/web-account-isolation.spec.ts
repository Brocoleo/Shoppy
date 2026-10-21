/**
 * E2E de aislamiento entre cuentas en el sitio público.
 *
 * Regresión de A-02: la web no purga la caché de React Query al cambiar de
 * cuenta y las claves de consulta no incluían al usuario, así que la cuenta B
 * podía ver los pedidos de la cuenta A servidos desde la caché (staleTime 60 s).
 *
 * Toda la navegación es CLIENTE (clics en enlaces de Next.js) a propósito: un
 * page.goto() recarga el documento y borra la caché en memoria de React Query,
 * con lo que la fuga no sería observable y el test daría verde siempre.
 *
 * El login y el logout se hacen en la UI real. Los datos de prueba (2 usuarios
 * y 1 pedido) se crean y se limpian al terminar.
 */
import { expect, test, type Page } from "@playwright/test";
import {
  createTempUser,
  createTestOrder,
  deleteTempUser,
  deleteTestOrder,
} from "./helpers/supabase-admin";
import { WEB_URL } from "./helpers/env";

const PASSWORD = "E2EAislamiento-2026!x";

/** Login desde la UI real, entrando por el enlace del encabezado si existe. */
async function login(page: Page, email: string) {
  const header = page.getByRole("banner");
  const entrar = header.getByRole("link", { name: "Entrar" }).first();
  if (await entrar.isVisible().catch(() => false)) {
    await entrar.click();
  } else {
    await page.goto(`${WEB_URL}/login`);
  }
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
}

async function logout(page: Page) {
  await page
    .locator("button:visible")
    .filter({ hasText: /^Salir$/ })
    .first()
    .click();
  await expect(page.getByRole("banner").getByRole("link", { name: "Entrar" })).toBeVisible();
}

/** Navegación cliente a "Mis pedidos" (sin recargar el documento). */
async function openOrders(page: Page) {
  await page.getByRole("banner").getByRole("link", { name: "Mis pedidos" }).click();
  await page.waitForURL(/\/pedidos/);
}

test("los pedidos de una cuenta no se sirven a otra cuenta", async ({ browser }) => {
  const stamp = Date.now();
  const emailA = `e2e-aislamiento-a-${stamp}@example.com`;
  const emailB = `e2e-aislamiento-b-${stamp}@example.com`;

  const userA = await createTempUser(emailA, PASSWORD);
  const userB = await createTempUser(emailB, PASSWORD);
  const order = await createTestOrder(userA.id);

  const context = await browser.newContext();
  try {
    const page = await context.newPage();

    // 1) La cuenta A entra y ve su pedido (la caché queda "calentada").
    await page.goto(`${WEB_URL}/login`);
    await page.getByLabel("Email").fill(emailA);
    await page.getByLabel("Contraseña").fill(PASSWORD);
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
    await openOrders(page);
    await expect(page.getByText(order.order_number)).toBeVisible({ timeout: 20_000 });

    // 2) La cuenta B entra en la MISMA pestaña: no puede ver el pedido de A.
    await logout(page);
    await login(page, emailB);
    await openOrders(page);
    await expect(page.getByText(order.order_number)).toHaveCount(0, { timeout: 20_000 });
    await expect(page.getByText("Aún no tienes pedidos")).toBeVisible({ timeout: 20_000 });

    // 3) La cuenta A vuelve a entrar: sigue viendo su propio pedido.
    await logout(page);
    await login(page, emailA);
    await openOrders(page);
    await expect(page.getByText(order.order_number)).toBeVisible({ timeout: 20_000 });
  } finally {
    await context.close();
    await deleteTestOrder(order.id);
    await deleteTempUser(userA.id);
    await deleteTempUser(userB.id);
  }
});
