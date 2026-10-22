#!/usr/bin/env node
/**
 * Limpieza de datos de prueba del sandbox de Supabase.
 *
 * Los E2E del admin limpian lo que crean, pero las verificaciones manuales
 * anteriores al E2E con limpieza dejaron pedidos `mode='test'`, sus reservas
 * y una prenda de ejemplo. Este script los retira.
 *
 * Por defecto SOLO INFORMA (dry run). Nada se borra sin `--apply`:
 *
 *   node scripts/cleanup-test-data.mjs              # informe
 *   node scripts/cleanup-test-data.mjs --apply      # borra
 *   node scripts/cleanup-test-data.mjs --apply --solo-pedidos
 *
 * Garantías:
 * - Solo toca filas de prueba (modo sandbox): un pedido con `mode='live'` y
 *   una prenda referenciada por un pedido real quedan intactos y se avisa.
 * - El orden de borrado respeta las claves foráneas (`checkout_attempts`
 *   bloquea el borrado del pedido; `product_reservations` sobrevive con
 *   `order_id` nulo).
 * - Los objetos de Storage de las imágenes se borran también.
 * - Nunca imprime secretos.
 */
import {
  detectarDatosDePrueba,
  sandboxClient,
} from "./lib/sandbox.mjs";

const aplicar = process.argv.includes("--apply");
const soloPedidos = process.argv.includes("--solo-pedidos");

const db = sandboxClient();
const datos = await detectarDatosDePrueba(db);

const ids = (lista) => (lista.length ? lista.map((v) => v.id) : ["__ninguno__"]);

console.log(
  aplicar
    ? "LIMPIEZA DE DATOS DE PRUEBA (--apply): se borra lo de abajo"
    : "INFORME DE DATOS DE PRUEBA (dry run): nada se borra sin --apply",
);
console.log("");

if (!datos.pedidos.length && !datos.productos.length && !datos.perfiles.length) {
  console.log("No hay datos de prueba que limpiar.");
  process.exit(0);
}

for (const pedido of datos.pedidos) {
  console.log(
    `  pedido ${pedido.order_number} · ${pedido.status} · creado ${String(pedido.created_at).slice(0, 10)}`,
  );
}
for (const prenda of datos.productos) {
  const protegida = datos.productosProtegidos.some((p) => p.id === prenda.id);
  console.log(
    `  prenda ${prenda.slug} · ${prenda.availability}` +
      (protegida ? " · PROTEGIDA: aparece en un pedido real, no se borra" : ""),
  );
}
for (const perfil of datos.perfiles) {
  console.log(`  perfil ${perfil.email} · ${perfil.role}`);
}
console.log(
  `  (+ ${datos.intentos.length} intentos, ${datos.pagos.length} pagos, ${datos.items.length} ítems, ` +
    `${datos.reservas.length} reservas, ${datos.imagenes.length} imágenes, ${datos.colaImagenes.length} en cola)`,
);
console.log("");

if (!aplicar) {
  console.log("Nada se borró. Repetí con --apply si querés limpiarlo de verdad.");
  process.exit(0);
}

// ── 1. Intentos de checkout: su FK al pedido no tiene cascada ──────────────
const borrarIntentos = await db
  .from("checkout_attempts")
  .delete()
  .in("id", ids(datos.intentos));
if (borrarIntentos.error) throw borrarIntentos.error;
console.log(`  checkout_attempts borrados: ${datos.intentos.length}`);

// ── 2. Reservas: sobreviven al borrado del pedido (order_id queda nulo) ─────
const borrarReservas = await db
  .from("product_reservations")
  .delete()
  .in("id", ids(datos.reservas));
if (borrarReservas.error) throw borrarReservas.error;
console.log(`  product_reservations borradas: ${datos.reservas.length}`);

// ── 3. Pedidos: pagos, ítems e historial caen por cascada ──────────────────
const borrarPedidos = await db.from("orders").delete().in("id", ids(datos.pedidos));
if (borrarPedidos.error) throw borrarPedidos.error;
console.log(`  pedidos borrados: ${datos.pedidos.length}`);

if (soloPedidos) {
  console.log("\nListo (--solo-pedidos: no se tocaron prendas ni perfiles).");
  process.exit(0);
}

// ── 4. Imágenes y objetos de Storage de las prendas de prueba ──────────────
const rutas = [
  ...datos.imagenes.map((i) => i.storage_path),
  ...datos.colaImagenes.map((c) => c.storage_path),
].filter(Boolean);
if (rutas.length) {
  const storage = await db.storage.from("product-images").remove(rutas);
  if (storage.error) console.warn(`  aviso: no se pudieron borrar ${rutas.length} objetos: ${storage.error.message}`);
  else console.log(`  objetos de Storage borrados: ${rutas.length}`);
}
if (datos.colaImagenes.length) {
  await db.from("image_cleanup").delete().in("product_id", ids(datos.productos));
  console.log(`  filas de image_cleanup borradas: ${datos.colaImagenes.length}`);
}

// ── 5. Prendas de prueba (salvo las que estén en un pedido real) ───────────
const borrables = datos.productos.filter(
  (p) => !datos.productosProtegidos.some((protegida) => protegida.id === p.id),
);
if (borrables.length) {
  const borrarPrendas = await db
    .from("products")
    .delete()
    .in("id", ids(borrables));
  if (borrarPrendas.error) throw borrarPrendas.error;
  console.log(`  prendas borradas: ${borrables.length}`);
}
for (const protegida of datos.productosProtegidos) {
  console.log(`  prenda protegida (tiene un pedido real): ${protegida.slug}`);
}

// ── 6. Perfiles y usuarios de auth de los E2E ──────────────────────────────
for (const perfil of datos.perfiles) {
  await db.auth.admin.deleteUser(perfil.id);
  await db.from("profiles").delete().eq("id", perfil.id);
}
if (datos.perfiles.length) {
  console.log(`  perfiles y usuarios de auth borrados: ${datos.perfiles.length}`);
}

console.log("\nLimpieza terminada. Verificá con: node scripts/check-test-residue.mjs");
