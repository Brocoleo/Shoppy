/**
 * Compara el pipeline de imágenes (antes vs. después) con una FOTO REAL de
 * celular, ejecutando el mismo código del navegador (canvas + WebP) en
 * Chromium. Es la forma honesta de medirlo: mismo motor que usa el admin.
 *
 *   node scripts/image-quality-compare.mjs <imagen> [salida]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { chromium } from "playwright";

const ENTRADA = process.argv[2];
const SALIDA = process.argv[3] ?? "/tmp/opencode/imgcompare";
if (!ENTRADA) {
  console.error("uso: node scripts/image-quality-compare.mjs <imagen> [salida]");
  process.exit(1);
}
mkdirSync(SALIDA, { recursive: true });

const bytes = readFileSync(ENTRADA);
const extension = extname(ENTRADA).toLowerCase();
const mime = extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : "image/jpeg";

const navegador = await chromium.launch();
const pagina = await navegador.newPage();
await pagina.setContent("<body></body>");

const resultado = await pagina.evaluate(
  async ({ datos, mimeOriginal, nombre }) => {
    const archivo = new File([new Uint8Array(datos)], nombre, { type: mimeOriginal });

    const MAX_ANTES = 1800;
    const MAX_DESPUES = 2000;
    const CALIDAD_ANTES = 0.86;
    const CALIDAD_DESPUES = 0.90;
    const UNSHARP_RADIO = 0.5;
    const UNSHARP_CANTIDAD = 0.4;

    const bitmap = await createImageBitmap(archivo, { imageOrientation: "from-image" });

    /** Unsharp mask 3x3: devuelve el detalle fino que el downscale se come. */
    function unsharp(context, w, h) {
      const imagen = context.getImageData(0, 0, w, h);
      const { data } = imagen;
      const difuso = new Uint8ClampedArray(data.length);
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          for (let c = 0; c < 3; c += 1) {
            let suma = 0;
            let cuenta = 0;
            for (let dy = -1; dy <= 1; dy += 1) {
              for (let dx = -1; dx <= 1; dx += 1) {
                const ny = y + dy;
                const nx = x + dx;
                if (ny < 0 || ny >= h || nx < 0 || nx >= w) continue;
                suma += data[(ny * w + nx) * 4 + c];
                cuenta += 1;
              }
            }
            difuso[(y * w + x) * 4 + c] = suma / cuenta;
          }
        }
      }
      for (let i = 0; i < data.length; i += 4) {
        for (let c = 0; c < 3; c += 1) {
          const original = data[i + c];
          data[i + c] = original + (original - difuso[i + c]) * UNSHARP_CANTIDAD * UNSHARP_RADIO * 2;
        }
      }
      context.putImageData(imagen, 0, 0);
    }

    async function procesar(maxLado, calidad, conUnsharp) {
      const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * escala));
      const h = Math.max(1, Math.round(bitmap.height * escala));
      let cw;
      let ch;
      if (w / h > 4 / 5) { ch = h; cw = Math.round((h * 4) / 5); }
      else { cw = w; ch = Math.round((w * 5) / 4); }
      const canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bitmap, (cw - w) / 2, (ch - h) / 2, w, h);
      if (conUnsharp) unsharp(ctx, cw, ch);
      const blob = await new Promise((r) => canvas.toBlob(r, "image/webp", calidad));
      const buffer = new Uint8Array(await blob.arrayBuffer());
      // Métrica de nitidez: varianza del Laplaciano sobre la luminancia.
      const pixeles = ctx.getImageData(0, 0, cw, ch).data;
      let suma = 0;
      let suma2 = 0;
      let n = 0;
      for (let y = 1; y < ch - 1; y += 1) {
        for (let x = 1; x < cw - 1; x += 1) {
          const i = (y * cw + x) * 4;
          const g = pixeles[i] * 0.299 + pixeles[i + 1] * 0.587 + pixeles[i + 2] * 0.114;
          const arriba = pixeles[((y - 1) * cw + x) * 4] * 0.299;
          const abajo = pixeles[((y + 1) * cw + x) * 4] * 0.299;
          const izq = pixeles[(y * cw + x - 1) * 4] * 0.299;
          const der = pixeles[(y * cw + x + 1) * 4] * 0.299;
          const lap = 4 * g - arriba - abajo - izq - der;
          suma += lap;
          suma2 += lap * lap;
          n += 1;
        }
      }
      const media = suma / n;
      const nitidez = Math.sqrt(Math.max(0, suma2 / n - media * media));
      // Ruido estimado: desviación de la diferencia con la imagen suavizada.
      return {
        bytes: Array.from(buffer),
        ancho: cw,
        alto: ch,
        peso: blob.size,
        nitidez,
        mime: blob.type,
      };
    }

    const antes = await procesar(MAX_ANTES, CALIDAD_ANTES, false);
    const despues = await procesar(MAX_DESPUES, CALIDAD_DESPUES, true);
    const original = { ancho: bitmap.width, alto: bitmap.height };
    return { antes, despues, original };
  },
  { datos: Array.from(bytes), mimeOriginal: mime, nombre: basename(ENTRADA) },
);

console.log("[debug] claves:", Object.keys(resultado), "| antes:", resultado.antes && Object.keys(resultado.antes));
const guardar = (archivo) => writeFileSync(join(SALIDA, archivo), Buffer.from(archivo.bytes ?? []));
guardar(`antes.webp`);
guardar(`despues.webp`);

const pct = (a, b) => (((b - a) / a) * 100).toFixed(1);
console.log("=== Comparación con foto real de celular ===");
console.log(`Original      : ${resultado.original.ancho}x${resultado.original.alto} (${(bytes.length / 1024).toFixed(0)} KB)`);
console.log(`ANTES         : ${resultado.antes.ancho}x${resultado.antes.alto}  ${(resultado.antes.peso / 1024).toFixed(0)} KB  nitidez=${resultado.antes.nitidez.toFixed(2)}`);
console.log(`DESPUÉS       : ${resultado.despues.ancho}x${resultado.despues.alto}  ${(resultado.despues.peso / 1024).toFixed(0)} KB  nitidez=${resultado.despues.nitidez.toFixed(2)}`);
console.log(`\nNitidez: +${pct(resultado.antes.nitidez, resultado.despues.nitidez)}%  |  Peso: ${pct(resultado.antes.peso, resultado.despues.peso)}%`);
console.log(`Salidas: ${SALIDA}/antes.webp y ${SALIDA}/despues.webp`);

await navegador.close();
