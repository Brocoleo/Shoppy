/**
 * Comparativa visual FINAL: pipeline anterior vs. el nuevo, con la misma
 * foto real, al mismo tamaño de pantalla y con recorte equivalente.
 *
 * Es la foto que se sube al almacen: asi se ve en la web.
 *
 *   node scripts/image-quality-comparar.mjs <foto> [salida]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { chromium } from "playwright";
import ts from "typescript";

const ENTRADA = process.argv[2];
const SALIDA = process.argv[3] ?? "/tmp/opencode/comparar";
if (!ENTRADA) {
  console.error("uso: node scripts/image-quality-comparar.mjs <foto> [salida]");
  process.exit(1);
}
mkdirSync(SALIDA, { recursive: true });

const MODULO = join(process.cwd(), "apps/admin/src/lib/prepareImage.ts");
const fuente = readFileSync(MODULO, "utf8");

/** Transpila el modulo real con los parametros indicados. */
function compilarCon({ maxLado, calidad, radio, cantidad, umbral }) {
  const js = ts.transpileModule(fuente, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  return js
    .replace(/const MAX_LADO = \d+;/, `const MAX_LADO = ${maxLado};`)
    .replace(/const WEBP_QUALITY = [\d.]+;/, `const WEBP_QUALITY = ${calidad};`)
    .replace(/const DETALLE_RADIO = [\d.]+;/, `const DETALLE_RADIO = ${radio};`)
    .replace(/const DETALLE_CANTIDAD = [\d.]+;/, `const DETALLE_CANTIDAD = ${cantidad};`)
    .replace(/const DETALLE_UMBRAL = [\d.]+;/, `const DETALLE_UMBRAL = ${umbral};`);
}

const VARIANTES = [
  {
    etiqueta: "1-ANTIGUO-1800-q086-sin-realce",
    maxLado: 1800,
    calidad: 0.86,
    radio: 0,
    cantidad: 0,
    umbral: 0,
  },
  {
    etiqueta: "2-NUEVO-1700-q086-realce-umbral",
    maxLado: 1700,
    calidad: 0.86,
    radio: 1,
    cantidad: 0.5,
    umbral: 3,
  },
];

const bytes = readFileSync(ENTRADA);
const mime = extname(ENTRADA).toLowerCase() === ".png" ? "image/png" : "image/jpeg";

const navegador = await chromium.launch();
const pagina = await navegador.newPage();

const salida = await pagina.evaluate(
  async ({ datos, mimeOriginal, nombreArchivo, fuentes }) => {
    const binario = atob(datos);
    const buffer = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i += 1) buffer[i] = binario.charCodeAt(i);
    const archivo = new File([buffer], nombreArchivo, { type: mimeOriginal });

    const resultados = [];
    for (const [etiqueta, codigo] of fuentes) {
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
      const blob = await new Promise((r) => c.toBlob(r, "image/png"));
      const buf = new Uint8Array(await blob.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 0x8000) {
        bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      }
      resultados.push({
        etiqueta,
        ancho: dec.width,
        alto: dec.height,
        peso: optimizada.size,
        datos: btoa(bin),
      });
      dec.close();
    }
    return resultados;
  },
  {
    datos: Buffer.from(bytes).toString("base64"),
    mimeOriginal: mime,
    nombreArchivo: basename(ENTRADA),
    fuentes: VARIANTES.map((v) => [
      v.etiqueta,
      compilarCon(v),
    ]),
  },
);

await navegador.close();

const base = basename(ENTRADA).replace(/\.[^.]+$/, "");
for (const r of salida) {
  writeFileSync(join(SALIDA, `${base}-${r.etiqueta}.png`), Buffer.from(r.datos, "base64"));
  console.log(`${r.etiqueta.padEnd(34)} ${r.ancho}x${r.alto}  ${(r.peso / 1024).toFixed(0)} KB`);
}
console.log(`\nEn ${SALIDA}/`);
