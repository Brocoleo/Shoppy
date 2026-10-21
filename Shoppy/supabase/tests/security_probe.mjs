/**
 * Verificación funcional (temporal) de la migración 20261020000000 contra la
 * BD REAL. Crea dos usuarios de prueba, intenta la escalada de privilegios con
 * la anon key y con la sesión de un admin, y limpia todo al final verificando
 * que no queda residuo.
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL;
const SECRET = process.env.SUPABASE_SECRET_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;

const admin = createClient(URL, SECRET, { auth: { persistSession: false } });
const stamp = Date.now();
const emailA = `audit-secc-a-${stamp}@example.com`;
const emailB = `audit-secc-b-${stamp}@example.com`;
const password = "AuditTemporal-2026!x";
const ids = [];

const rows = [];
const check = (name, ok, detail) => {
  rows.push({ caso: name, resultado: ok ? "OK" : "FALLO", detalle: detail });
};

/** Borra un usuario de auth y su perfil; reintenta y reporta el error real. */
async function purge(id, email) {
  const d1 = await admin.auth.admin.deleteUser(id);
  if (d1.error) {
    await new Promise((r) => setTimeout(r, 800));
    const d2 = await admin.auth.admin.deleteUser(id);
    if (d2.error) console.error(`  ! no se pudo borrar el usuario ${email}: ${d2.error.message}`);
  }
  const p = await admin.from("profiles").delete().eq("id", id);
  if (p.error) console.error(`  ! no se pudo borrar el perfil ${id}: ${p.error.message}`);
}

try {
  for (const email of [emailA, emailB]) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw new Error(`alta de ${email}: ${error.message}`);
    ids.push(data.user.id);
  }
  const [idA, idB] = ids;

  // Sesión del cliente normal (A).
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: le } = await client.auth.signInWithPassword({ email: emailA, password });
  if (le) throw new Error(`login A: ${le.message}`);

  // 1) UPDATE role='admin' sobre su propio perfil -> debe fallar.
  let r = await client.from("profiles").update({ role: "admin" }).eq("id", idA);
  check("cliente: UPDATE role='admin'", !!r.error, r.error ? r.error.message : "PERMITIDO (vulnerable)");

  // 2) INSERT role='admin' con otro id -> debe fallar.
  const idC = "55555555-5555-4555-8555-555555555555";
  r = await client.from("profiles").insert({ id: idC, email: "audit-secc-c@example.com", role: "admin" });
  check("cliente: INSERT role='admin'", !!r.error, r.error ? r.error.message : "PERMITIDO (vulnerable)");

  // 3) DELETE de su propio perfil -> permitido (derecho de supresión).
  r = await client.from("profiles").delete().eq("id", idA);
  check("cliente: DELETE de su propio perfil", !r.error, r.error ? `BLOQUEADO: ${r.error.message}` : "permitido");

  // 4) Re-INSERT role='admin' tras el borrado -> debe fallar (vector de escalada).
  r = await client.from("profiles").insert({ id: idA, email: emailA, role: "admin" });
  check("cliente: DELETE+INSERT role='admin'", !!r.error, r.error ? r.error.message : "PERMITIDO (vulnerable)");

  // 5) UPDATE payments.status -> debe fallar.
  r = await client.from("payments").update({ status: "approved" }).eq("id", "00000000-0000-4000-8000-000000000000");
  check("cliente: UPDATE payments.status", !!r.error, r.error ? r.error.message : "PERMITIDO (vulnerable)");

  // 6) RPC mark_order_paid -> debe fallar.
  r = await client.rpc("mark_order_paid", { p_order_id: "00000000-0000-4000-8000-000000000000" });
  check("cliente: rpc mark_order_paid", !!r.error, r.error ? r.error.message : "PERMITIDO (vulnerable)");

  // 7) ADMIN: el toggle de rol del panel debe funcionar (ya funcionaba con la
  //    policy nueva; antes actualizaba 0 filas en silencio).
  await admin.from("profiles").insert({ id: idA, email: emailA, role: "customer" });
  await admin.from("profiles").update({ role: "admin" }).eq("id", idB);
  const adminClient = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: le2 } = await adminClient.auth.signInWithPassword({ email: emailB, password });
  if (le2) throw new Error(`login B: ${le2.message}`);
  r = await adminClient.from("profiles").update({ role: "customer" }).eq("id", idA);
  const reread = await adminClient.from("profiles").select("role").eq("id", idA).maybeSingle();
  check(
    "admin: cambiar el rol de otro usuario (toggle del panel)",
    !r.error && reread.data?.role === "customer",
    r.error ? r.error.message : `role resultante=${reread.data?.role}`,
  );

  // 8) ADMIN: no puede escribir el estado de un pago.
  r = await adminClient.from("payments").update({ status: "approved" }).eq("id", "00000000-0000-4000-8000-000000000000");
  check("admin: UPDATE payments.status", !!r.error, r.error ? r.error.message : "PERMITIDO (vulnerable)");

  // 9) ADMIN: tampoco puede liquidar pedidos directamente.
  r = await adminClient.rpc("mark_order_paid", { p_order_id: "00000000-0000-4000-8000-000000000000" });
  check("admin: rpc mark_order_paid", !!r.error, r.error ? r.error.message : "PERMITIDO (vulnerable)");
} finally {
  for (const [i, id] of ids.entries()) await purge(id, i === 0 ? emailA : emailB);
  await admin.from("profiles").delete().eq("email", "audit-secc-c@example.com");
  const { count } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .like("email", "audit-secc-%");
  const listed = await admin.auth.admin.listUsers({ perPage: 200 });
  const left = (listed.data?.users ?? []).filter((u) => (u.email ?? "").startsWith("audit-secc-")).length;
  rows.push({
    caso: "limpieza",
    resultado: count === 0 && left === 0 ? "OK" : "FALLO",
    detalle: `perfiles residuales=${count}; usuarios residuales=${left}`,
  });
}

console.table(rows);
const fallos = rows.filter((x) => x.resultado === "FALLO");
console.log(fallos.length === 0 ? "\nTODO OK" : `\n${fallos.length} CASOS FALLIDOS`);
process.exit(fallos.length === 0 ? 0 : 1);
