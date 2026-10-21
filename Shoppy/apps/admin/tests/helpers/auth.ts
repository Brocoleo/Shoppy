/**
 * Login del admin en la UI real (no se inyecta la sesión a mano): así el
 * test cubre también el formulario de acceso y la verificación de rol.
 */
import { expect, type Page } from "@playwright/test";

export async function loginAsAdmin(
  page: Page,
  email: string,
  password: string,
) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 20_000,
  });
  // La barra lateral solo se renderiza con sesión admin válida.
  await expect(
    page.getByRole("navigation", { name: "Administración" }),
  ).toBeVisible({ timeout: 20_000 });
  // "exact" importa: el dashboard tiene un link "Ver productos" que, sin
  // coincidencia exacta, también matchea "Productos" (strict mode violation).
  await expect(page.getByRole("link", { name: "Productos", exact: true })).toBeVisible();
}
