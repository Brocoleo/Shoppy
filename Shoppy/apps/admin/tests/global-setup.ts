import { chromium } from "@playwright/test";
import { CHROMIUM_ARGS, chromiumExecutable } from "./helpers/browser";

/**
 * Sonda de hidratación del admin, previa a toda la suite.
 *
 * Next.js bloquea los recursos cross-origin en desarrollo. Si el dev server se
 * arrancó en `localhost` y el test apunta a `127.0.0.1` (o al revés), la
 * página se sirve pero **nunca hidrata**: el login no responde, no aparece
 * ningún error y el test expira en `waitForURL` — un fallo que parece de
 * autenticación y es de infraestructura.
 *
 * Esta sonda comprueba, antes de gastar minutos en la suite, que la página de
 * login realmente hidrató. Si no, falla de inmediato con el mensaje accionable.
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
    const boton = page.getByRole("button", { name: /Entrar/ });
    await boton.waitFor({ timeout: 30_000 });

    // Se bloquea todo lo que no sea del propio origen: así la llamada a
    // Supabase falla sola y la única señal posible de hidratación es que React
    // actualice la vista. El fallo se **retasa 1,5 s** a propósito: sin esa
    // demora el estado «Entrando…» existe apenas unos milisegundos y la sonda
    // sería una lotería.
    await page.route(
      (url) => url.origin !== origen,
      async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        await route.abort();
      },
    );
    await boton.click();
    await Promise.any([
      page.getByRole("button", { name: /Entrando/ }).waitFor({ timeout: 15_000 }),
      page.getByRole("alert").first().waitFor({ timeout: 15_000 }),
    ]);
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
