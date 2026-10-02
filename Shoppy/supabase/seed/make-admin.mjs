/**
 * Crea (o promueve) el administrador inicial.
 * Uso:
 *   SUPABASE_URL=http://127.0.0.1:54321 \
 *   SUPABASE_SECRET_KEY=sb_secret_... \
 *   ADMIN_EMAIL=admin@shopy.cl ADMIN_PASSWORD=cambiar123 \
 *   node supabase/seed/make-admin.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const email = process.env.ADMIN_EMAIL ?? "admin@shopy.cl";
const password = process.env.ADMIN_PASSWORD ?? "cambiar123";
if (!url || !secret) {
  console.error("Faltan SUPABASE_URL o SUPABASE_SECRET_KEY");
  process.exit(1);
}

const sb = createClient(url, secret, { auth: { persistSession: false } });

// ¿Existe ya?
const { data: existing } = await sb.from("profiles").select("id,role").eq("email", email).maybeSingle();
if (existing) {
  await sb.from("profiles").update({ role: "admin" }).eq("id", existing.id);
  console.log(`OK: ${email} promovido a admin`);
  process.exit(0);
}

const { data, error } = await sb.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (error) {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
}
await sb.from("profiles").update({ role: "admin" }).eq("id", data.user.id);
console.log(`OK: admin creado (${email})`);
