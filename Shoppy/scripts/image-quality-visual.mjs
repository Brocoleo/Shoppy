/**
 * Comparación visual del pipeline REAL de imágenes (mismo algoritmo que
 * apps/admin/src/lib/prepareImage.ts: realce sobre la luminancia con desenfoque
 * de caja separable en coma flotante).
 *
 *   node scripts/image-quality-visual.mjs <imagen> [salida]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { chromium } from "playwright";

const ENTRADA = process.argv[2];
const SALIDA = process.argv[3] ?? "/tmp/opencode/visual";
if (!ENTRADA) {
  console.error("uso: node scripts/image-quality-visual.mjs <imagen> [salida]");
  process.exit(1);
}
mkdirSync(SALIDA, { recursive: true });
const bytes = readFileSync(ENTRADA);
const mime = extname(ENTRADA).toLowerCase() === ".png" ? "image/png" : "image/jpeg";

const navegador = await chromium.launch();
const pagina = await navegador.newPage();
await pagina.setContent("<body></body>");

const salidas = await pagina.evaluate(
  async ({ datos, mimeOriginal, nombre }) => {
    const bitmap = await createImageBitmap(
      new File([new Uint8Array(datos)], nombre, { type: mimeOriginal }),
      { imageOrientation: "from-image" },
    );
    const escala = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * escala));
    const h = Math.max(1, Math.round(bitmap.height * escala));
    let cw;
    let ch;
    if (w / h > 4 / 5) { ch = h; cw = Math.round((h * 4) / 5); }
    else { cw = w; ch = Math.round((w * 5) / 4); }

    function lienzo() {
      const c = document.createElement("canvas");
      c.width = cw; c.height = ch;
      const ctx = c.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bitmap, (cw - w) / 2, (ch - h) / 2, w, h);
      c.ctx = ctx;
      return c;
    }

    /** Idéntico a realzarDetalle() de prepareImage.ts. */
    function realzar(ctx, radio, cantidad) {
      const imagen = ctx.getImageData(0, 0, cw, ch);
      const d = imagen.data;
      const px = cw * ch;
      const luma = new Float32Array(px);
      for (let i = 0; i < px; i += 1) {
        const p = i * 4;
        luma[i] = d[p] * 0.299 + d[p + 1] * 0.587 + d[p + 2] * 0.114;
      }
      const tmp = new Float32Array(px);
      const dif = new Float32Array(px);
      for (let y = 0; y < ch; y += 1) {
        for (let x = 0; x < cw; x += 1) {
          let s = 0; let k = 0;
          for (let dx = -radio; dx <= radio; dx += 1) {
            const nx = x + dx; if (nx < 0 || nx >= cw) continue;
            s += luma[y * cw + nx]; k += 1;
          }
          tmp[y * cw + x] = s / k;
        }
      }
      for (let y = 0; y < ch; y += 1) {
        for (let x = 0; x < cw; x += 1) {
          let s = 0; let k = 0;
          for (let dy = -radio; dy <= radio; dy += 1) {
            const ny = y + dy; if (ny < 0 || ny >= ch) continue;
            s += tmp[ny * cw + x]; k += 1;
          }
          dif[y * cw + x] = s / k;
        }
      }
      for (let i = 0; i < px; i += 1) {
        const delta = (luma[i] - dif[i]) * cantidad;
        if (delta === 0) continue;
        const p = i * 4;
        d[p] += delta; d[p + 1] += delta; d[p + 2] += delta;
      }
      ctx.putImageData(imagen, 0, 0);
    }

    async function guardar(nombreArchivo, radio, cantidad, calidad) {
      const canvas = lienzo();
      if (cantidad > 0) realzar(canvas.ctx, radio, cantidad);
      const blob = await new Promise((r) => canvas.toBlob(r, "image/webp", calidad));
      const buf = new Uint8Array(await blob.arrayBuffer());
      return { nombre: nombreArchivo, peso: blob.size, datos: Array.from(buf) };
    }

    return [
      await guardar("00-antes-1800-q086.webp", 0, 0, 0.86),
      await guardar("01-nuevo-2000-q090.webp", 0, 0, 0.9),
      await guardar("02-nuevo-realce.webp", 2, 1.5, 0.9),
    ];
  },
  { datos: Array.from(bytes), mimeOriginal: mime, nombre: basename(ENTRADA) },
);

for (const s of salidas) {
  writeFileSync(join(SALIDA, s.nombre), Buffer.from(s.datos));
  console.log(`${s.nombre}  ${(s.peso / 1024).toFixed(0)} KB`);
}
console.log(`\nEn ${SALIDA}/`);
await navegador.close();
