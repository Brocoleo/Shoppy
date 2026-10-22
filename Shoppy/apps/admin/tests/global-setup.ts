import { chromium } from "@playwright/test";
import { CHROMIUM_ARGS, chromiumExecutable } from "./helpers/browser";
import { comprobarHidratacion } from "./helpers/hidratacion";

/**
 * Verificación previa a toda la suite: la página de login del admin tiene que
 * hidratar de verdad antes de gastar minutos en los tests.
 *
 * El caso que atrapa (y que ya costó una mañana) es el hostname cruzado:
 * servidor en `localhost`, test en `127.0.0.1`. Sin `allowedDevOrigins` la
 * página se sirve pero nunca hidrata y cada test expira sin dar ningún error.
 *
 * La lógica vive en `helpers/hidratacion.ts` para poder testearla: ver
 * `tests/e2e-sonda.spec.ts`.
 */
const PORT = Number(process.env.E2E_PORT ?? 3001);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default async function globalSetup(): Promise<void> {
  const origen = new URL(BASE_URL).origin;
  const browser = await chromium.launch({
    executablePath: chromiumExecutable(),
    args: CHROMIUM_ARGS,
  });
  const page = await browser.newPage();
  try {
    await page.goto(`${origen}/login`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.getByRole("button", { name: /Entrar/ }).waitFor({ timeout: 30_000 });
    await comprobarHidratacion(page, origen);
  } catch (error) {
    throw new Error(
      [
        `[e2e] La página de login del admin (${origen}/login) no hidrató.`,
        "Suele significar que el dev server y el test usan nombres de host distintos",
        "(`localhost` vs `127.0.0.1`): Next bloquea los recursos cross-origin en",
        "desarrollo, la página se sirve pero React nunca se engancha.",
        "Arranca el dev server y el test con el MISMO hostname, o usa",
        "`E2E_BASE_URL=http://localhost:<puerto>`.",
        `Detalle original: ${error instanceof Error ? error.message : String(error)}`,
      ].join(" "),
    );
  } finally {
    await browser.close();
  }
}
