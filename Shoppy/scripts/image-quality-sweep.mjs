/**
 * Barrido de parámetros del pipeline de imágenes sobre una FOTO REAL.
 * Mide peso, nitidez global y nitidez en las zonas con textura (bordes),
 * que es donde el unsharp mask realmente actúa.
 *
 *   node scripts/image-quality-sweep.mjs <imagen>
 */
import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { chromium } from "playwright";

const ENTRADA = process.argv[2];
if (!ENTRADA) {
  console.error("uso: node scripts/image-quality-sweep.mjs <imagen>");
  process.exit(1);
}
const bytes = readFileSync(ENTRADA);
const mime = extname(ENTRADA).toLowerCase() === ".png" ? "image/png" : "image/jpeg";

const navegador = await chromium.launch();
const pagina = await navegador.newPage();
await pagina.setContent("<body></body>");

const filas = await pagina.evaluate(
  async ({ datos, mimeOriginal, nombre }) => {
    const bitmap = await createImageBitmap(
      new File([new Uint8Array(datos)], nombre, { type: mimeOriginal }),
      { imageOrientation: "from-image" },
    );

    function unsharp(ctx, w, h, radio, cantidad) {
      const imagen = ctx.getImageData(0, 0, w, h);
      const { data } = imagen;
      const difuso = new Float32Array(data.length);
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          for (let c = 0; c < 3; c += 1) {
            let suma = 0;
            let cuenta = 0;
            for (let dy = -radio; dy <= radio; dy += 1) {
              for (let dx = -radio; dx <= radio; dx += 1) {
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
          const o = data[i + c];
          data[i + c] = o + (o - difuso[i + c]) * cantidad;
        }
      }
      ctx.putImageData(imagen, 0, 0);
    }

    /** Nitidez: percentil 95 de |Laplaciano| (se concentra en los bordes). */
    function medir(ctx, w, h) {
      const p = ctx.getImageData(0, 0, w, h).data;
      const magnitudes = [];
      for (let y = 1; y < h - 1; y += 1) {
        for (let x = 1; x < w - 1; x += 1) {
          const i = (y * w + x) * 4;
          const g = p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114;
          const lap =
            4 * g
            - (p[((y - 1) * w + x) * 4] * 0.299 + p[((y + 1) * w + x) * 4] * 0.299)
            - (p[(y * w + x - 1) * 4] * 0.299 + p[(y * w + x + 1) * 4] * 0.299);
          magnitudes.push(Math.abs(lap));
        }
      }
      magnitudes.sort((a, b) => a - b);
      const p95 = magnitudes[Math.floor(magnitudes.length * 0.95)];
      const p50 = magnitudes[Math.floor(magnitudes.length * 0.5)];
      return { p95, p50, media: magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length };
    }

    async function procesar(maxLado, calidad, radio, cantidad) {
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
      if (cantidad > 0) unsharp(ctx, cw, ch, radio, cantidad);
      const blob = await new Promise((r) => canvas.toBlob(r, "image/webp", calidad));
      const m = medir(ctx, cw, ch);
      return { ancho: cw, alto: ch, peso: blob.size, ...m };
    }

    const combinaciones = [
      { etiqueta: "ACTUAL 1800 q0.86", maxLado: 1800, calidad: 0.86, radio: 0, cantidad: 0 },
      { etiqueta: "2000 q0.90", maxLado: 2000, calidad: 0.90, radio: 0, cantidad: 0 },
      { etiqueta: "2000 q0.90 +unsharp r0.5 a0.4", maxLado: 2000, calidad: 0.90, radio: 0, cantidad: 0.4 },
      { etiqueta: "2000 q0.90 +unsharp r1.0 a0.6", maxLado: 2000, calidad: 0.90, radio: 1, cantidad: 0.6 },
      { etiqueta: "2000 q0.90 +unsharp r1.5 a0.8", maxLado: 2000, calidad: 0.90, radio: 1, cantidad: 0.8 },
      { etiqueta: "2000 q0.92 +unsharp r1.0 a0.6", maxLado: 2000, calidad: 0.92, radio: 1, cantidad: 0.6 },
      { etiqueta: "2200 q0.90 +unsharp r1.0 a0.6", maxLado: 2200, calidad: 0.90, radio: 1, cantidad: 0.6 },
    ];
    const resultados = [];
    for (const c of combinaciones) {
      const radio = c.radio || 1;
      resultados.push({ etiqueta: c.etiqueta, ...(await procesar(c.maxLado, c.calidad, radio, c.cantidad)) });
    }
    return { resultados, original: { ancho: bitmap.width, alto: bitmap.height } };
  },
  { datos: Array.from(bytes), mimeOriginal: mime, nombre: basename(ENTRADA) },
);

const base = filas.resultados[0];
console.log(`Original: ${filas.original.ancho}x${filas.original.alto}  (${(bytes.length / 1024).toFixed(0)} KB)\n`);
console.log("variante                          tamaño      peso    nitidez p95   p50    media   Δpeso");
for (const r of filas.resultados) {
  const dp = (((r.peso - base.peso) / base.peso) * 100).toFixed(1);
  const dn = (((r.p95 - base.p95) / base.p95) * 100).toFixed(1);
  console.log(
    `${r.etiqueta.padEnd(32)} ${String(r.ancho + "x" + r.alto).padEnd(11)} ${String((r.peso / 1024).toFixed(0) + " KB").padEnd(8)} ${r.p95.toFixed(1).padStart(8)}   ${r.p50.toFixed(1).padStart(6)}  ${r.media.toFixed(2).padStart(6)}  ${dp.padStart(6)}%  (nitidez ${dn}%)`,
  );
}

await navegador.close();
