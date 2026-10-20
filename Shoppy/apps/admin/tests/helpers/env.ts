/**
 * Carga de secretos para los tests E2E.
 *
 * Las credenciales viven SOLO en archivos locales gitignored:
 *   - `apps/admin/.env.local`  → NEXT_PUBLIC_SUPABASE_URL / ANON_KEY
 *   - `supabase/.env`          → SUPABASE_SECRET_KEY (service role)
 *
 * Nunca se imprimen ni se commitean. Si falta algo, el test falla con un
 * mensaje accionable en vez de romperse con un 401 críptico.
 */
import fs from "node:fs";
import path from "node:path";

const ADMIN_DIR = path.resolve(__dirname, "..", "..");
const REPO_ROOT = path.resolve(ADMIN_DIR, "..", "..");

function parseEnvFile(file: string): Record<string, string> {
  if (!fs.existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const raw of fs.readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const files = {
  ...parseEnvFile(path.join(REPO_ROOT, "supabase", ".env")),
  ...parseEnvFile(path.join(ADMIN_DIR, ".env.local")),
  ...parseEnvFile(path.join(ADMIN_DIR, ".env.test.local")),
};

function required(key: string): string {
  const value = process.env[key] ?? files[key];
  if (!value) {
    throw new Error(
      `[e2e] Falta ${key}. Configúralo en apps/admin/.env.test.local (gitignored) o supabase/.env.`,
    );
  }
  return value;
}

export const SUPABASE_URL = required("NEXT_PUBLIC_SUPABASE_URL");
export const SUPABASE_ANON_KEY = required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
export const SUPABASE_SECRET_KEY = required("SUPABASE_SECRET_KEY");

/**
 * URL pública del sitio para verificar la prenda publicada.
 * Por defecto el web local que levanta Playwright (misma BD que producción).
 * Se puede apuntar al despliegue real con E2E_WEB_URL.
 */
export const WEB_URL =
  process.env.E2E_WEB_URL?.replace(/\/$/, "") ??
  `http://127.0.0.1:${process.env.E2E_WEB_PORT ?? 3010}`;

/** Credenciales del admin temporal. Si no se fijan, el test las genera. */
export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "";
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";
