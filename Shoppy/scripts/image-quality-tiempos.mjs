/**
 * Desglose del tiempo de prepareImage: donde se va el tiempo al subir.
 *
 * Sube una foto real de 48 MP y mide por separado:
 *   - decodificar el JPEG (createImageBitmap)
 *   - dibujar en el canvas (escala + recorte)
 *   - realzar el detalle
 *   - codificar a WebP
 *
 * Con eso se sabe si el cuello de botella es la decodificacion (del navegador,
 * no se puede mejorar) o el realce (si se puede).
 *
 *   node scripts/image-quality-tiempos.mjs <foto>
 */
import { readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { chromium } from "playwright";
import ts from "typescript";

const ENTRADA = process.argv[2];
if (!ENTRADA) {
  console.error("uso: node scripts/image-quality-tiempos.mjs <foto>");
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

    // 1) Decodificacion sola.
    const t0 = performance.now();
    const bitmap = await createImageBitmap(archivo, { imageOrientation: "from-image" });
    const tDecode = performance.now() - t0;

    // 2) Pipeline completo (incluye decode otra vez).
    const t1 = performance.now();
    const optimizada = await modulo.prepareImage(archivo);
    const tTotal = performance.now() - t1;
    const ancho = bitmap.width;
    const alto = bitmap.height;
    bitmap.close();

    return {
      ancho,
      alto,
      mp: (ancho * alto) / 1e6,
      tDecode,
      tTotal,
      peso: optimizada.size,
      entradaMB: archivo.size / 1024 / 1024,
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

console.log(`\n${basename(ENTRADA)}: ${r.ancho}x${r.alto} (${r.mp.toFixed(1)} MP, ${r.entradaMB.toFixed(1)} MB)`);
console.log(`decodificar el JPEG : ${r.tDecode.toFixed(0)} ms`);
console.log(`pipeline completo    : ${r.tTotal.toFixed(0)} ms  (${(r.tTotal / r.tDecode).toFixed(1)}x la decodificacion)`);
console.log(`resto (escala+realce+webp): ${(r.tTotal - r.tDecode).toFixed(0)} ms`);
console.log(`salida               : ${(r.peso / 1024).toFixed(0)} KB`);
console.log(
  `\nPara 11 fotos: ${((r.tTotal * 11) / 1000).toFixed(1)} s de espera en el admin (procesamiento en el navegador).`,
);
