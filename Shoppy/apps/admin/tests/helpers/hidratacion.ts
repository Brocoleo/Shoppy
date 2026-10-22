import type { Page } from "@playwright/test";

/**
 * Sonda de hidratación del admin, compartida por `global-setup.ts` y por el
 * test de regresión `tests/e2e-sonda.spec.ts`.
 *
 * Next.js bloquea los recursos cross-origin en desarrollo. Si el dev server se
 * arrancó en `localhost` y el test apunta a `127.0.0.1` (o al revés), la
 * página se sirve pero **nunca hidrata**: el login no responde, no aparece
 * ningún error y el test expira en `waitForURL` — un fallo que parece de
 * autenticación y es de infraestructura.
 *
 * La señal que usa es la única que controla: un clic en «Entrar» que mueve el
 * estado de la vista. Para que no sea una lotería, la respuesta bloqueada se
 * retasa `timeoutMs` antes de abortarse: si el fallo de red es instantáneo, el
 * estado «Entrando…» existe apenas milisegundos y no se puede observar.
 */
export class HidratacionNoDetectada extends Error {}

export async function comprobarHidratacion(
  page: Page,
  origen: string,
  timeoutMs = 15_000,
): Promise<void> {
  // Se bloquea todo lo que no sea del propio origen: así la llamada a
  // Supabase falla sola y la única señal posible de hidratación es que React
  // actualice la vista.
  await page.route(
    (url) => url.origin !== origen,
    async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.abort();
    },
  );
  const boton = page.getByRole("button", { name: /Entrar/ });
  await boton.click();
  try {
    await Promise.any([
      // `.first()` porque el overlay de desarrollo de Next también publica un
      // `role="alert"` y, en modo estricto, dos coincidencias se lanzan.
      page.getByRole("button", { name: /Entrando/ }).waitFor({ timeout: timeoutMs }),
      page.getByRole("alert").first().waitFor({ timeout: timeoutMs }),
    ]);
  } catch {
    throw new HidratacionNoDetectada(
      `La página de login (${origen}/login) no respondió al clic: React no se enganchó.`,
    );
  }
}
