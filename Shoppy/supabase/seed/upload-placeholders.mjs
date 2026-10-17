/**
 * Simula la carga de placeholders locales al bucket product-images.
 * Escribir requiere --apply, SUPABASE_URL y SUPABASE_SECRET_KEY.
 * Nunca reemplaza un objeto existente, aunque haya cambiado desde la simulación.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function collectPlaceholders(directory) {
  const files = [];
  function walk(current, prefix = "") {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const key = prefix + entry.name;
      if (entry.isDirectory()) walk(join(current, entry.name), `${key}/`);
      else if (entry.isFile() && entry.name.endsWith(".png")) {
        files.push({ key, read: () => readFileSync(join(current, entry.name)) });
      }
    }
  }
  walk(directory);
  return files;
}

export function parseArguments(args) {
  if (args.some((arg) => arg !== "--apply" && arg !== "--dry-run") ||
      (args.includes("--apply") && args.includes("--dry-run"))) {
    throw new Error("Uso: node supabase/seed/upload-placeholders.mjs [--dry-run | --apply]");
  }
  return { apply: args.includes("--apply") };
}

export async function uploadPlaceholders({ files, apply = false, upload }) {
  const keys = new Set();
  // Validate the whole batch before any write, including duplicate paths.
  for (const { key, read } of files) {
    if (typeof key !== "string" || !key.endsWith(".png") || key.startsWith("/") ||
        key.includes("\\") || key.split("/").some((part) => !part || part === "." || part === "..") ||
        keys.has(key) || typeof read !== "function") throw new Error("Ruta de placeholder inválida o duplicada");
    keys.add(key);
  }
  if (apply && typeof upload !== "function") throw new Error("Falta transporte de carga");
  const results = [];
  for (const file of files) {
    if (!apply) {
      results.push({ key: file.key, status: "planned" });
      continue;
    }
    try {
      const { error } = await upload(file.key, file.read(), { contentType: "image/png", upsert: false });
      if (!error) results.push({ key: file.key, status: "uploaded" });
      else {
        const conflict = String(error.statusCode ?? error.status) === "409" || error.error === "Duplicate";
        results.push({ key: file.key, status: conflict ? "conflict" : "error", message: error.message });
      }
    } catch (error) {
      results.push({ key: file.key, status: "error", message: error instanceof Error ? error.message : "Error de carga" });
    }
  }
  return { mode: apply ? "apply" : "dry-run", results };
}

async function main() {
  const { apply } = parseArguments(process.argv.slice(2));
  const files = collectPlaceholders(join(dirname(fileURLToPath(import.meta.url)), "placeholders"));
  let upload;
  if (apply) {
    const url = process.env.SUPABASE_URL;
    const secret = process.env.SUPABASE_SECRET_KEY;
    if (!url || !secret) throw new Error("Faltan SUPABASE_URL o SUPABASE_SECRET_KEY");
    const { createClient } = await import("@supabase/supabase-js");
    const bucket = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } }).storage.from("product-images");
    upload = (...args) => bucket.upload(...args);
  }
  const report = await uploadPlaceholders({ files, apply, upload });
  console.log(JSON.stringify(report, null, 2));
  if (report.results.some(({ status }) => status === "error" || status === "conflict")) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
