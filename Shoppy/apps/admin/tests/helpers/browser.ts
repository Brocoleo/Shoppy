import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Ubica el Chromium ya instalado en la caché de Playwright.
 *
 * Se usa el navegador de la caché local para no depender de descargas en
 * entornos sin salida a internet. Si no está, se devuelve `undefined` y
 * Playwright usa el Chromium que tenga configurado.
 */
export function chromiumExecutable(): string | undefined {
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

/** Argumentos de arranque usados tanto por los tests como por la sonda de hidratación. */
export const CHROMIUM_ARGS = ["--no-sandbox", "--disable-dev-shm-usage"];
