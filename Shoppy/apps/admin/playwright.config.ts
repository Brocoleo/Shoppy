import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Configuración de los E2E del admin.
 *
 * - Levanta dos servidores: el admin (3001) y el sitio público (3010) para
 *   comprobar que una prenda publicada se ve en la web.
 * - Se usa el Chromium ya instalado en la caché de Playwright para no
 *   depender de descargas en entornos sin salida a internet.
 * - `E2E_BASE_URL` permite apuntar a otro servidor (p. ej. un túnel).
 */
const PORT = Number(process.env.E2E_PORT ?? 3001);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3010);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;
const WEB_BASE_URL =
  process.env.E2E_WEB_URL ?? `http://127.0.0.1:${WEB_PORT}`;

function chromiumExecutable(): string | undefined {
  const cache = path.join(os.homedir(), ".cache", "ms-playwright");
  if (!fs.existsSync(cache)) return undefined;
  const dirs = fs
    .readdirSync(cache)
    .filter((d) => d.startsWith("chromium-"))
    .sort()
    .reverse();
  for (const dir of dirs) {
    for (const rel of [
      path.join("chrome-linux64", "chrome"),
      path.join("chrome-linux", "chrome"),
    ]) {
      const exe = path.join(cache, dir, rel);
      if (fs.existsSync(exe)) return exe;
    }
  }
  return undefined;
}

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
        ? { executablePath, args: ["--no-sandbox", "--disable-dev-shm-usage"] }
        : { args: ["--no-sandbox", "--disable-dev-shm-usage"] }),
    },
  },
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
