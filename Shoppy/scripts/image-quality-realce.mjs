/**
 * Barrido del realce: nitidez frente a RUIDO.
 *
 * El realce (unsharp) no solo devuelve detalle: tambien amplifica el ruido
 * de la foto, sobre todo en las zonas planas (el fondo de la ropa, una saba
 * blanca). Medir las dos cosas a la vez es lo que permite elegir sin
 * adivinar.
 *
 *   node scripts/image-quality-realce.mjs <carpeta-de-fotos>
 */
import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { chromium } from "playwright";

const ORIGEN = process.argv[2];
if (!ORIGEN) {
  console.error("uso: node scripts/image-quality-realce.mjs <carpeta>");
  process.exit(1);
}
const archivos = readdirSync(ORIGEN)
  .filter((n) => /\.(jpe?g|png|webp)$/i.test(n))
  .sort();

const VARIANTES = [
  { etiqueta: "sin realce", radio: 0, cantidad: 0 },
  { etiqueta: "r1 a0.5", radio: 1, cantidad: 0.5 },
  { etiqueta: "r1 a0.8", radio: 1, cantidad: 0.8 },
  { etiqueta: "r2 a0.5", radio: 2, cantidad: 0.5 },
  { etiqueta: "r2 a0.8", radio: 2, cantidad: 0.8 },
  { etiqueta: "r2 a1.5", radio: 2, cantidad: 1.5 },
];

const navegador = await chromium.launch();
const pagina = await navegador.newPage();
const filas = [];

for (const nombre of archivos) {
  const bytes = readFileSync(join(ORIGEN, nombre));
  const mime = extname(nombre).toLowerCase() === ".png" ? "image/png" : "image/jpeg";
  const entrada = Buffer.from(bytes).toString("base64");

  const resultado = await pagina.evaluate(
    async ({ datos, mimeOriginal, nombreArchivo, variantes }) => {
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

      const salida = [];
      for (const v of variantes) {
        const canvas = lienzo(1600);
        if (v.cantidad > 0) realzar(canvas.ctx, v.radio, v.cantidad);
        const blob = await new Promise((r) => canvas.toBlob(r, "image/webp", 0.83));
        const dec = await createImageBitmap(blob);
        const c2 = document.createElement("canvas");
        c2.width = dec.width;
        c2.height = dec.height;
        const ctx2 = c2.getContext("2d");
        ctx2.drawImage(dec, 0, 0);
        const p = ctx2.getImageData(0, 0, c2.width, c2.height).data;
        const W = c2.width;
        const H = c2.height;
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
        // Ruido: sigma de la diferencia entre vecinos en la zona mas plana.
        const zonaW = Math.floor(W * 0.22);
        const zonaH = Math.floor(H * 0.16);
        const x0 = Math.floor(W * 0.03);
        const y0 = Math.floor(H * 0.03);
        let dif2 = 0;
        let difN = 0;
        for (let y = y0; y < y0 + zonaH; y += 1) {
          for (let x = x0; x < x0 + zonaW - 1; x += 1) {
            const d2 = luma[y * W + x + 1] - luma[y * W + x];
            dif2 += d2 * d2;
            difN += 1;
          }
        }
        salida.push({
          etiqueta: v.etiqueta,
          peso: blob.size,
          nitidez: Math.sqrt(sumaL2 / n) / Math.sqrt(sumaG2 / n),
          ruido: Math.sqrt(dif2 / difN / 2),
        });
        dec.close();
      }
      bitmap.close();
      return salida;
    },
    { datos: entrada, mimeOriginal: mime, nombreArchivo: nombre, variantes: VARIANTES },
  );

  filas.push({ nombre, versiones: resultado });
  console.log(
    `${nombre}  ` +
      resultado.map((v) => `${v.nitidez.toFixed(2)}/${v.ruido.toFixed(2)}`).join("  "),
  );
}

await navegador.close();

console.log(`\n=== ${filas.length} fotos, lado 1600 q0.83 (nitidez / ruido) ===`);
console.log("variante        nitidez   ruido   Δnitidez   Δruido   peso");
const base = filas[0].versiones[0];
for (let k = 0; k < VARIANTES.length; k += 1) {
  const nit = filas.reduce((a, f) => a + f.versiones[k].nitidez, 0) / filas.length;
  const rui = filas.reduce((a, f) => a + f.versiones[k].ruido, 0) / filas.length;
  const peso = filas.reduce((a, f) => a + f.versiones[k].peso, 0) / filas.length / 1024;
  console.log(
    `${VARIANTES[k].etiqueta.padEnd(14)} ${nit.toFixed(3)}   ${rui.toFixed(3)}   ${(((nit - base.nitidez) / base.nitidez) * 100).toFixed(1).padStart(6)}%   ${(((rui - base.ruido) / base.ruido) * 100).toFixed(1).padStart(6)}%   ${peso.toFixed(0)} KB`,
  );
}
