import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { CHROMIUM_ARGS, chromiumExecutable } from "./tests/helpers/browser";

/**
 * Configuración de los E2E del admin.
 *
 * - Levanta dos servidores: el admin (3001) y el sitio público (3010) para
 *   comprobar que una prenda publicada se ve en la web.
 * - Se usa el Chromium ya instalado en la caché de Playwright para no
 *   depender de descargas en entornos sin salida a internet.
 * - `E2E_BASE_URL` permite apuntar a otro servidor (p. ej. un túnel).
 * - `globalSetup` verifica ANTES de la suite que la página de login hidrata:
 *   si el dev server y el test usan hostnames distintos (`localhost` vs
 *   `127.0.0.1`), Next bloquea los recursos cross-origin, la página se sirve
 *   pero nunca hidrata y cada test expira sin dar ningún error.
 */
const PORT = Number(process.env.E2E_PORT ?? 3001);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3010);

/** Normaliza y valida una URL base: `0.0.0.0` es de escucha, no de conexión. */
function resolveBaseUrl(raw: string, nombre: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`[e2e] ${nombre} no es una URL válida: ${raw}`);
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "0.0.0.0" || host === "::") {
    throw new Error(
      `[e2e] ${nombre}=${raw} no sirve: esa dirección es de escucha, no de conexión. Usa localhost o 127.0.0.1.`,
    );
  }
  return url.origin;
}

const BASE_URL = resolveBaseUrl(
  process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`,
  "E2E_BASE_URL",
);
const WEB_BASE_URL = resolveBaseUrl(
  process.env.E2E_WEB_URL ?? `http://127.0.0.1:${WEB_PORT}`,
  "E2E_WEB_URL",
);

const executablePath = chromiumExecutable();

export default defineConfig({
  testDir: "./tests",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  outputDir: "./test-results",
  use: {
    baseURL: BASE_URL,
    locale: "es-CL",
    timezoneId: "America/Santiago",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
    launchOptions: {
      ...(executablePath
        ? { executablePath, args: CHROMIUM_ARGS }
        : { args: CHROMIUM_ARGS }),
    },
  },
  globalSetup: "./tests/global-setup.ts",
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: `npx next dev --port ${PORT} --hostname 127.0.0.1`,
          cwd: __dirname,
          url: BASE_URL,
          reuseExistingServer: true,
          timeout: 180_000,
          stdout: "ignore",
          stderr: "pipe",
        },
        {
          command: `npx next dev --port ${WEB_PORT} --hostname 127.0.0.1`,
          cwd: path.resolve(__dirname, "..", "web"),
          url: WEB_BASE_URL,
          reuseExistingServer: true,
          timeout: 180_000,
          stdout: "ignore",
          stderr: "pipe",
        },
      ],
});
