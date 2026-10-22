/**
 * Regresión de la sonda de hidratación (`helpers/hidratacion.ts`).
 *
 * La sonda es la que evita que el E2E expire en silencio cuando el dev server
 * y el test usan hostnames distintos. Si alguien la "arregla" rompiéndola,
 * volveríamos al timeout mudo de dos minutos por test — y este test lo
 * atrapa: comprueba que **discrimina**, no solo que no truena.
 *
 *   · con la página sana → pasa.
 *   · con los bundles de la app bloqueados (página servida, React sin enganchar)
 *     → tiene que fallar. Si no fallara, la sonda sería vacua.
 */
import { expect, test } from "@playwright/test";
import {
  HidratacionNoDetectada,
  comprobarHidratacion,
} from "./helpers/hidratacion";

const PORT = Number(process.env.E2E_PORT ?? 3001);
const ORIGEN = new URL(
  process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`,
).origin;

test.describe("sonda de hidratación", () => {
  test("acepta una página que sí hidrata", async ({ page }) => {
    await page.goto(`${ORIGEN}/login`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: /Entrar/ })).toBeVisible();
    await expect(comprobarHidratacion(page, ORIGEN)).resolves.toBeUndefined();
  });

  test("rechaza una página servida sin sus bundles (hidratación rota)", async ({ page }) => {
    // Se bloquean los bundles ANTES de navegar: si no, el JS ya habría cargado
    // y el escenario sería idéntico al caso sano.
    await page.route(
      (url) => url.pathname.includes("/_next/static/"),
      (route) => route.abort(),
    );
    await page.goto(`${ORIGEN}/login`, { waitUntil: "domcontentloaded" });
    // El HTML llega completo: el botón está visible aunque React no lo esté.
    await expect(page.getByRole("button", { name: /Entrar/ })).toBeVisible();
    await expect(comprobarHidratacion(page, ORIGEN, 4_000)).rejects.toThrow(
      HidratacionNoDetectada,
    );
  });
});
