/**
 * Medicion HONESTA de nitidez: se mide DESPUES de codificar.
 *
 * Medir el lienzo antes de comprimir no vale: el dano del WebP solo aparece
 * cuando el archivo se vuelve a decodificar. Aqui se codifica, se decodifica
 * el resultado y se mide ahi, que es exactamente lo que ve el visitante.
 *
 *   node scripts/image-quality-final.mjs <carpeta-de-fotos> [salida]
 */
import { readdirSync, readFileSync, mkdirSync } from "node:fs";
import { extname, join } from "node:path";
import { chromium } from "playwright";

const ORIGEN = process.argv[2];
const SALIDA = process.argv[3] ?? "/tmp/opencode/final";
if (!ORIGEN) {
  console.error("uso: node scripts/image-quality-final.mjs <carpeta> [salida]");
  process.exit(1);
}
mkdirSync(SALIDA, { recursive: true });

const archivos = readdirSync(ORIGEN)
  .filter((n) => /\.(jpe?g|png|webp)$/i.test(n))
  .sort();

const COMBINACIONES = [
  { etiqueta: "actual 1800 q0.86", maxLado: 1800, calidad: 0.86, cantidad: 0 },
  { etiqueta: "1600 q0.86 +realce", maxLado: 1600, calidad: 0.86, cantidad: 1.5 },
  { etiqueta: "1600 q0.83 +realce", maxLado: 1600, calidad: 0.83, cantidad: 1.5 },
  { etiqueta: "1600 q0.80 +realce", maxLado: 1600, calidad: 0.8, cantidad: 1.5 },
  { etiqueta: "1500 q0.82 +realce", maxLado: 1500, calidad: 0.82, cantidad: 1.5 },
];

const navegador = await chromium.launch();
const pagina = await navegador.newPage();
const filas = [];

for (const nombre of archivos) {
  const bytes = readFileSync(join(ORIGEN, nombre));
  const mime = extname(nombre).toLowerCase() === ".png" ? "image/png" : "image/jpeg";
  const entrada = Buffer.from(bytes).toString("base64");

  const resultado = await pagina.evaluate(
    async ({ datos, mimeOriginal, nombreArchivo, combinaciones }) => {
      const binario = atob(datos);
      const buffer = new Uint8Array(binario.length);
      for (let i = 0; i < binario.length; i += 1) buffer[i] = binario.charCodeAt(i);
      const bitmap = await createImageBitmap(
        new File([buffer], nombreArchivo, { type: mimeOriginal }),
        { imageOrientation: "from-image" },
      );

      function lienzo(maxLado) {
        const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height));
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
        for (let y = 0; y < H; y += 1) {
          const fila = y * W;
          let suma = 0;
          for (let k = -radio; k <= radio; k += 1) suma += luma[fila + Math.min(W - 1, Math.max(0, k))];
          for (let x = 0; x < W; x += 1) {
            tmp[fila + x] = suma / ventana;
            suma += luma[fila + Math.min(W - 1, Math.max(0, x + radio + 1))] - luma[fila + Math.min(W - 1, Math.max(0, x - radio))];
          }
        }
        for (let x = 0; x < W; x += 1) {
          let suma = 0;
          for (let k = -radio; k <= radio; k += 1) suma += tmp[Math.min(H - 1, Math.max(0, k)) * W + x];
          for (let y = 0; y < H; y += 1) {
            dif[y * W + x] = suma / ventana;
            suma += tmp[Math.min(H - 1, Math.max(0, y + radio + 1)) * W + x] - tmp[Math.min(H - 1, Math.max(0, y - radio)) * W + x];
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

      /** Ratio Laplacian/Gradiente sobre pixeles ya decodificados. */
      function nitidezDe(p, W, H) {
        const luma = new Float32Array(W * H);
        for (let i = 0; i < W * H; i += 1) {
          const q = i * 4;
          luma[i] = p[q] * 0.299 + p[q + 1] * 0.587 + p[q + 2] * 0.114;
        }
        let sumaL2 = 0;
        let sumaG2 = 0;
        let n = 0;
        for (let y = 1; y < H - 1; y += 1) {
          for (let x = 1; x < W - 1; x += 1) {
            const i = y * W + x;
            const lap = 4 * luma[i] - luma[i + 1] - luma[i - 1] - luma[i - W] - luma[i + W];
            const gx = (luma[i + 1] - luma[i - 1]) / 2;
            const gy = (luma[i - W] - luma[i + W]) / 2;
            sumaL2 += lap * lap;
            sumaG2 += gx * gx + gy * gy;
            n += 1;
          }
        }
        if (n === 0 || sumaG2 === 0) return null;
        return Math.sqrt(sumaL2 / n) / Math.sqrt(sumaG2 / n);
      }

      const salida = [];
      for (const c of combinaciones) {
        const canvas = lienzo(c.maxLado);
        if (c.cantidad > 0) realzar(canvas.ctx, 2, c.cantidad);
        const blob = await new Promise((r) => canvas.toBlob(r, "image/webp", c.calidad));
        // Decodificar el archivo final: aqui se ve el dano de la compresion.
        const decodificada = await createImageBitmap(blob);
        const c2 = document.createElement("canvas");
        c2.width = decodificada.width;
        c2.height = decodificada.height;
        const ctx2 = c2.getContext("2d");
        ctx2.drawImage(decodificada, 0, 0);
        const pixeles = ctx2.getImageData(0, 0, c2.width, c2.height).data;
        salida.push({
          etiqueta: c.etiqueta,
          ancho: c2.width,
          alto: c2.height,
          peso: blob.size,
          nitidez: nitidezDe(pixeles, c2.width, c2.height),
        });
        decodificada.close();
      }
      bitmap.close();
      return salida;
    },
    { datos: entrada, mimeOriginal: mime, nombreArchivo: nombre, combinaciones: COMBINACIONES },
  );

  filas.push({ nombre, versiones: resultado });
  console.log(
    `${nombre}  ` +
      resultado.map((v) => `${(v.peso / 1024).toFixed(0)}KB/${v.nitidez.toFixed(3)}`).join("  "),
  );
}

await navegador.close();

console.log(`\n=== Nitidez medida sobre el archivo final ya comprimido (${filas.length} fotos) ===`);
console.log("combinación              KB/foto   nitidez    vs actual");
const nitBase = filas.reduce((a, f) => a + f.versiones[0].nitidez, 0) / filas.length;
for (let k = 0; k < COMBINACIONES.length; k += 1) {
  const c = COMBINACIONES[k];
  const peso = filas.reduce((a, f) => a + f.versiones[k].peso, 0) / filas.length / 1024;
  const nit = filas.reduce((a, f) => a + f.versiones[k].nitidez, 0) / filas.length;
  console.log(
    `${c.etiqueta.padEnd(24)} ${peso.toFixed(0).padStart(5)} KB   ${nit.toFixed(3)}   ${(((nit - nitBase) / nitBase) * 100).toFixed(1).padStart(6)}%`,
  );
}
