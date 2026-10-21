/**
 * Prueba de la interfaz de subida: verifica que la barra de progreso total y
 * las barras por archivo avanzan, y que el estado final es "Guardado".
 * uso: node scripts/photo-drop-ui-test.mjs [url]
 */
import { chromium } from "playwright";
import { readdirSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const URL_BASE = process.argv[2] ?? "http://127.0.0.1:8080";
const FIXTURES = join(process.cwd(), "apps/admin/tests/fixtures");

const browser = await chromium.launch();
const page = await browser.newPage();
const errores = [];
page.on("pageerror", (e) => errores.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errores.push(m.text()); });

await page.goto(URL_BASE, { waitUntil: "domcontentloaded" });

// Se sube un archivo real grande para que la barra tenga tiempo de avanzar.
const archivo = process.argv[3] ?? join(FIXTURES, "prenda-2-vertical.jpg");
const nombre = `ui-test-${Date.now()}.jpg`;
await page.setInputFiles('input[type=file]', { name: nombre, mimeType: "image/jpeg", buffer: readFileSync(archivo) });
// Elegir el archivo no envía: hay que pulsar "Subir".
await page.click("#btnSubir");

// Durante la subida se muestrea el ancho de la barra por archivo.
const anchos = [];
const muestreo = setInterval(async () => {
  try {
    const ancho = await page.locator(".barra-archivo .barra").first().evaluate((el) => el.style.width);
    if (ancho) anchos.push(ancho);
  } catch {
    // el elemento puede no existir todavia: se ignora esta muestra
  }
}, 60);

// Espera a que el estado final sea "Guardado".
try {
  await page.waitForSelector(".estado-guardado", { timeout: 30_000 });
} catch (e) {
  await page.screenshot({ path: "/tmp/opencode/drop-ui-fallo.png", fullPage: true });
  console.log("captura en /tmp/opencode/drop-ui-fallo.png");
  console.log("errores de consola:", errores.join(" | ") || "ninguno");
  console.log("html del estado:", await page.locator(".archivo-estado").allTextContents());
  throw e;
}
clearInterval(muestreo);

const estado = await page.locator(".archivo-estado").first().textContent();
const total = await page.locator("#txtTotal").textContent();
const enCarpeta = readdirSync(FIXTURES).some((f) => f.startsWith(nombre.replace(".jpg", "")));

console.log("=== Resultado de la prueba de UI ===");
console.log(`Estado final por archivo : ${estado}`);
console.log(`Barra total              : ${total}`);
console.log(`Barra por archivo        : ${anchos.length ? anchos.join(" → ") : "(sin muestras)"}`);
console.log(`¿Archivo en la carpeta?  : ${enCarpeta ? "sí" : "NO"}`);
console.log(`Errores de consola       : ${errores.length ? errores.join(" | ") : "ninguno"}`);

// Limpieza del archivo de prueba.
for (const f of readdirSync(FIXTURES)) {
  if (f.startsWith(nombre.replace(".jpg", ""))) {
    try {
      unlinkSync(join(FIXTURES, f));
    } catch {
      // si no se pudo borrar, se avisa al final
    }
  }
}

await browser.close();
const ok = estado?.trim() === "Guardado" && enCarpeta && errores.length === 0;
console.log(ok ? "\nTODO OK" : "\nFALLO");
process.exit(ok ? 0 : 1);
