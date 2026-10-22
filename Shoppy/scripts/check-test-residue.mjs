#!/usr/bin/env node
/**
 * Comprobación de residuos de prueba en el sandbox de Supabase.
 *
 * Los E2E del admin limpian lo que crean, pero las verificaciones manuales
 * anteriores al E2E con limpieza dejaron pedidos `mode='test'` y reservas
 * colgando. Este script responde, de un vistazo, si la BD está limpia.
 *
 * Es de SOLO LECTURA: no modifica nada.
 *
 *   node scripts/check-test-residue.mjs
 *
 * Sale con código 1 si encuentra residuos (sirve como puerta en CI) y con 0
 * si la BD está limpia. Nunca imprime secretos.
 */
import {
  detectarDatosDePrueba,
  hayResiduo,
  resumir,
  sandboxClient,
} from "./lib/sandbox.mjs";

const db = sandboxClient();
const datos = await detectarDatosDePrueba(db);

console.log("Residuos de prueba en el sandbox de Supabase\n");
for (const [tabla, n] of resumir(datos)) {
  console.log(`  ${tabla.padEnd(34)} ${n}`);
}

if (!hayResiduo(datos)) {
  console.log("\nOK: la base no tiene residuos de prueba.");
  process.exit(0);
}

console.log("\nDetalle de lo que hay que limpiar:");
for (const pedido of datos.pedidos) {
  console.log(
    `  pedido ${pedido.order_number} (${pedido.status}) creado ${String(pedido.created_at).slice(0, 10)}`,
  );
}
for (const prenda of datos.productos) {
  console.log(`  prenda ${prenda.slug} (${prenda.availability})`);
}
for (const perfil of datos.perfiles) {
  console.log(`  perfil ${perfil.email} (${perfil.role})`);
}

console.log(
  "\nPara limpiar: node scripts/cleanup-test-data.mjs --apply  (revisá el informe antes)",
);
process.exit(1);
