/**
 * Sube placeholders locales al bucket `product-images` conservando paths.
 * Uso (claves NUNCA commiteadas):
 *   SUPABASE_URL=http://127.0.0.1:54321 \
 *   SUPABASE_SECRET_KEY=sb_secret_... \
 *   node supabase/seed/upload-placeholders.mjs
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("Faltan SUPABASE_URL o SUPABASE_SECRET_KEY");
  process.exit(1);
}

const dir = join(dirname(fileURLToPath(import.meta.url)), "placeholders");
const files = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (e.endsWith(".png")) files.push(p);
  }
})(dir);

const supabase = createClient(url, secret);
let ok = 0;
for (const f of files) {
  const key = relative(dir, f).split(sep).join("/");
  const { error } = await supabase.storage
    .from("product-images")
    .upload(key, readFileSync(f), { contentType: "image/png", upsert: true });
  if (error) {
    console.error(`FAIL ${key}: ${error.message}`);
    process.exitCode = 1;
  } else {
    ok++;
  }
}
console.log(`OK: ${ok}/${files.length} archivos en bucket product-images`);
