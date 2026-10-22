/**
 * Comparativa por lotes del pipeline de imágenes sobre fotos REALES.
 *
 * Para cada foto genera versiones con el mismo código de canvas que usa el
 * admin (apps/admin/src/lib/prepareImage.ts):
 *
 *   A "antes"      : lado 1800, WebP 0.86, sin realce   (pipeline anterior)
 *   B "nuevo"      : lado 2000, WebP 0.90, sin realce
 *   C "nuevo+realce": lado 2000, WebP 0.90, realce de detalle sobre la
 *                     luminancia (radio 2, cantidad 1.5)
 *   D "ligero"     : lado 1600, WebP 0.86, con realce   (opción web ligera)
 *
 * Los originales NO se tocan: se leen, se procesan en memoria y se escriben
 * solo las versiones en la carpeta de salida.
 *
 *   node scripts/image-quality-batch.mjs <carpeta-de-fotos> [salida]
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { extname, join } from "node:path";
import { chromium } from "playwright";

const ORIGEN = process.argv[2];
const SALIDA = process.argv[3] ?? "/tmp/opencode/visual";
if (!ORIGEN) {
  console.error("uso: node scripts/image-quality-batch.mjs <carpeta> [salida]");
  process.exit(1);
}
mkdirSync(SALIDA, { recursive: true });

const archivos = readdirSync(ORIGEN)
  .filter((n) => /\.(jpe?g|png|webp)$/i.test(n))
  .sort();

if (!archivos.length) {
  console.error(`No hay fotos en ${ORIGEN}`);
  process.exit(1);
}

const navegador = await chromium.launch();
const filas = [];

for (const nombre of archivos) {
  const bytes = readFileSync(join(ORIGEN, nombre));
  const mime =
    extname(nombre).toLowerCase() === ".png" ? "image/png" : "image/jpeg";
  // base64 en vez de array de numeros: 1 byte -> 1,33 caracteres en vez de 8.
  const entrada = Buffer.from(bytes).toString("base64");

  // Pagina nueva por foto: se libera la memoria de la anterior.
  const pagina = await navegador.newPage();

  const resultado = await pagina.evaluate(
    async ({ datos, mimeOriginal, nombreArchivo }) => {
      const binario = atob(datos);
      const buffer = new Uint8Array(binario.length);
      for (let i = 0; i < binario.length; i += 1) buffer[i] = binario.charCodeAt(i);

      const bitmap = await createImageBitmap(
        new File([buffer], nombreArchivo, { type: mimeOriginal }),
        { imageOrientation: "from-image" },
      );

      /** Recorte 4:5 con cover + escala al lado máximo (igual que el admin). */
      function lienzo(maxLado) {
        const escala = Math.min(
          1,
          maxLado / Math.max(bitmap.width, bitmap.height),
        );
        const w = Math.max(1, Math.round(bitmap.width * escala));
        const h = Math.max(1, Math.round(bitmap.height * escala));
        let cw;
        let ch;
        if (w / h > 4 / 5) {
          ch = h;
          cw = Math.round((h * 4) / 5);
        } else {
          cw = w;
          ch = Math.round((w * 5) / 4);
        }
        const c = document.createElement("canvas");
        c.width = cw;
        c.height = ch;
        const ctx = c.getContext("2d");
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(bitmap, (cw - w) / 2, (ch - h) / 2, w, h);
        c.ctx = ctx;
        return c;
      }

      /**
       * Realce de detalle sobre la luminancia (unsharp mask).
       * El desenfoque de caja usa sumas corridas: O(1) por pixel en vez de
       * O(radio), que es lo que hace lento al admin con fotos de 48 MP.
       */
      function realzar(ctx, radio, cantidad) {
        const W = ctx.canvas.width;
        const H = ctx.canvas.height;
        const imagen = ctx.getImageData(0, 0, W, H);
        const d = imagen.data;
        const px = W * H;

        const luma = new Float32Array(px);
        for (let i = 0; i < px; i += 1) {
          const p = i * 4;
          luma[i] = d[p] * 0.299 + d[p + 1] * 0.587 + d[p + 2] * 0.114;
        }

        const ventana = radio * 2 + 1;
        const tmp = new Float32Array(px);
        const dif = new Float32Array(px);

        // Horizontal: suma corrida con bordes reflejados.
        for (let y = 0; y < H; y += 1) {
          const fila = y * W;
          let suma = 0;
          for (let k = -radio; k <= radio; k += 1) {
            suma += luma[fila + Math.min(W - 1, Math.max(0, k))];
          }
          for (let x = 0; x < W; x += 1) {
            tmp[fila + x] = suma / ventana;
            const sale = Math.min(W - 1, Math.max(0, x - radio));
            const entra = Math.min(W - 1, Math.max(0, x + radio + 1));
            suma += luma[fila + entra] - luma[fila + sale];
          }
        }

        // Vertical: idem.
        for (let x = 0; x < W; x += 1) {
          let suma = 0;
          for (let k = -radio; k <= radio; k += 1) {
            suma += tmp[Math.min(H - 1, Math.max(0, k)) * W + x];
          }
          for (let y = 0; y < H; y += 1) {
            dif[y * W + x] = suma / ventana;
            const sale = Math.min(H - 1, Math.max(0, y - radio));
            const entra = Math.min(H - 1, Math.max(0, y + radio + 1));
            suma += tmp[entra * W + x] - tmp[sale * W + x];
          }
        }

        for (let i = 0; i < px; i += 1) {
          const delta = (luma[i] - dif[i]) * cantidad;
          if (delta === 0) continue;
          const p = i * 4;
          d[p] += delta;
          d[p + 1] += delta;
          d[p + 2] += delta;
        }
        ctx.putImageData(imagen, 0, 0);
      }

      /** Brillo medio 0-255 de la imagen resultante. */
      function brillo(ctx) {
        const p = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height)
          .data;
        let s = 0;
        const n = p.length / 4;
        for (let i = 0; i < p.length; i += 4) {
          s += p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114;
        }
        return s / n;
      }

      async function version(etiqueta, maxLado, calidad, radio, cantidad) {
        const canvas = lienzo(maxLado);
        const t0 = performance.now();
        if (cantidad > 0) realzar(canvas.ctx, radio, cantidad);
        const tRealce = performance.now() - t0;
        const blob = await new Promise((r) => canvas.toBlob(r, "image/webp", calidad));
        const buf = new Uint8Array(await blob.arrayBuffer());
        let bin = "";
        const trozos = 0x8000;
        for (let i = 0; i < buf.length; i += trozos) {
          bin += String.fromCharCode.apply(null, buf.subarray(i, i + trozos));
        }
        return {
          etiqueta,
          ancho: canvas.width,
          alto: canvas.height,
          peso: blob.size,
          ms: Math.round(tRealce),
          brillo: brillo(canvas.ctx),
          datos: btoa(bin),
        };
      }

      const out = {
        original: { ancho: bitmap.width, alto: bitmap.height },
        versiones: [
          await version("A-antes-1800-q086", 1800, 0.86, 0, 0),
          await version("B-nuevo-2000-q090", 2000, 0.9, 0, 0),
          await version("C-nuevo-realce", 2000, 0.9, 2, 1.5),
          await version("D-ligero-1600-q086-realce", 1600, 0.86, 2, 1.5),
        ],
      };
      bitmap.close();
      return out;
    },
    { datos: entrada, mimeOriginal: mime, nombreArchivo: nombre },
  );

  await pagina.close();

  const base = nombre.replace(/\.[^.]+$/, "");
  for (const v of resultado.versiones) {
    writeFileSync(
      join(SALIDA, `${base}-${v.etiqueta}.webp`),
      Buffer.from(v.datos, "base64"),
    );
  }
  filas.push({ nombre, base, ...resultado });
  const [a, b, c, d] = resultado.versiones;
  console.log(
    `${nombre}  ${resultado.original.ancho}x${resultado.original.alto}  ` +
      `A:${(a.peso / 1024).toFixed(0)}KB B:${(b.peso / 1024).toFixed(0)}KB ` +
      `C:${(c.peso / 1024).toFixed(0)}KB D:${(d.peso / 1024).toFixed(0)}KB  ` +
      `realce:${c.ms}ms  brillo:${c.brillo.toFixed(0)}`,
  );
}

await navegador.close();

const total = (k) => filas.reduce((n, f) => n + f.versiones[k].peso, 0);
const media = (k) => total(k) / filas.length / 1024;
console.log(`\n=== Resumen de ${filas.length} fotos ===`);
console.log(`A antes       : ${media(0).toFixed(0)} KB/foto  (${(total(0) / 1024 / 1024).toFixed(2)} MB total)`);
console.log(`B nuevo       : ${media(1).toFixed(0)} KB/foto  (${(total(1) / 1024 / 1024).toFixed(2)} MB total)`);
console.log(`C nuevo+realce: ${media(2).toFixed(0)} KB/foto  (${(total(2) / 1024 / 1024).toFixed(2)} MB total)`);
console.log(`D ligero+realce:${media(3).toFixed(0)} KB/foto  (${(total(3) / 1024 / 1024).toFixed(2)} MB total)`);
console.log(
  `Original      : ${(filas.reduce((n, f) => n + f.original.ancho * f.original.alto, 0) / 1e6 / filas.length).toFixed(1)} MP/foto`,
);
console.log(`\nSalidas en ${SALIDA}/`);
