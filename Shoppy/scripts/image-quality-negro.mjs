/**
 * ¿La imagen sale NEGRA con los parametros que hay en el repo?
 *
 * Corre el modulo real prepareImage.ts SIN parchear (tal cual esta
 * commiteado) y comprueba el brillo del resultado. Si el realce produce NaN,
 * al escribir en el Uint8ClampedArray los pixeles quedan en 0 y la foto
 * entera sale negra: un fallo que ni el tamano ni el peso delatan.
 *
 *   node scripts/image-quality-negro.mjs <foto>
 */
import { readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { chromium } from "playwright";
import ts from "typescript";

const ENTRADA = process.argv[2];
if (!ENTRADA) {
  console.error("uso: node scripts/image-quality-negro.mjs <foto>");
  process.exit(1);
}

const MODULO = join(process.cwd(), "apps/admin/src/lib/prepareImage.ts");
const fuente = readFileSync(MODULO, "utf8");
const js = ts.transpileModule(fuente, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;

// Se ven los parametros tal como estan en el repo.
const constantes = [...fuente.matchAll(/const (MAX_LADO|WEBP_QUALITY|DETALLE_RADIO|DETALLE_CANTIDAD) = ([\d.]+);/g)].map(
  (m) => `${m[1]}=${m[2]}`,
);
console.log(`Parametros en el repo: ${constantes.join("  ")}`);

const bytes = readFileSync(ENTRADA);
const mime = extname(ENTRADA).toLowerCase() === ".png" ? "image/png" : "image/jpeg";

const navegador = await chromium.launch();
const pagina = await navegador.newPage();

const r = await pagina.evaluate(
  async ({ datos, mimeOriginal, nombreArchivo, codigo }) => {
    const binario = atob(datos);
    const buffer = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i += 1) buffer[i] = binario.charCodeAt(i);
    const archivo = new File([buffer], nombreArchivo, { type: mimeOriginal });
    const modulo = await import(
      `data:text/javascript;base64,${btoa(unescape(encodeURIComponent(codigo)))}`
    );
    const optimizada = await modulo.prepareImage(archivo);
    const dec = await createImageBitmap(optimizada);
    const c = document.createElement("canvas");
    c.width = dec.width;
    c.height = dec.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(dec, 0, 0);
    const p = ctx.getImageData(0, 0, c.width, c.height).data;
    let suma = 0;
    let negros = 0;
    const n = p.length / 4;
    for (let i = 0; i < p.length; i += 4) {
      const g = p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114;
      suma += g;
      if (g === 0) negros += 1;
    }
    return {
      ancho: c.width,
      alto: c.height,
      peso: optimizada.size,
      brillo: suma / n,
      negrosPct: (negros / n) * 100,
    };
  },
  {
    datos: Buffer.from(bytes).toString("base64"),
    mimeOriginal: mime,
    nombreArchivo: basename(ENTRADA),
    codigo: js,
  },
);

await navegador.close();

console.log(`\n${basename(ENTRADA)} -> ${r.ancho}x${r.alto}, ${(r.peso / 1024).toFixed(0)} KB`);
console.log(`brillo medio: ${r.brillo.toFixed(1)}  (0 = foto completamente negra)`);
console.log(`pixeles negros: ${r.negrosPct.toFixed(1)}%`);
console.log(
  r.brillo < 1 || r.negrosPct > 90
    ? "\n*** LA FOTO SALE NEGRA: el realce produce NaN ***"
    : "\nOK: la foto conserva imagen",
);
