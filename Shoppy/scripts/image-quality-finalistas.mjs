/**
 * Comparativa visual FINAL: guarda los finalistas como archivos para
 * mirarlos con el ojo y decidir los parametros del pipeline.
 *
 *   node scripts/image-quality-finalistas.mjs <foto> [salida]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { chromium } from "playwright";

const ENTRADA = process.argv[2];
const SALIDA = process.argv[3] ?? "/tmp/opencode/finalistas";
if (!ENTRADA) {
  console.error("uso: node scripts/image-quality-finalistas.mjs <foto> [salida]");
  process.exit(1);
}
mkdirSync(SALIDA, { recursive: true });

const bytes = readFileSync(ENTRADA);
const mime = extname(ENTRADA).toLowerCase() === ".png" ? "image/png" : "image/jpeg";

const VARIANTES = [
  { etiqueta: "1-actual-1800-q086", maxLado: 1800, calidad: 0.86, cantidad: 0 },
  { etiqueta: "2-1600-q086-realce", maxLado: 1600, calidad: 0.86, cantidad: 1.5 },
  { etiqueta: "3-1600-q083-realce", maxLado: 1600, calidad: 0.83, cantidad: 1.5 },
  { etiqueta: "4-1500-q082-realce", maxLado: 1500, calidad: 0.82, cantidad: 1.5 },
];

const navegador = await chromium.launch();
const pagina = await navegador.newPage();

const salidas = await pagina.evaluate(
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
      const canvas = lienzo(v.maxLado);
      if (v.cantidad > 0) realzar(canvas.ctx, 2, v.cantidad);
      const blob = await new Promise((r) => canvas.toBlob(r, "image/webp", v.calidad));
      const buf = new Uint8Array(await blob.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 0x8000) {
        bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      }
      salida.push({
        etiqueta: v.etiqueta,
        ancho: canvas.width,
        alto: canvas.height,
        peso: blob.size,
        datos: btoa(bin),
      });
    }
    bitmap.close();
    return salida;
  },
  { datos: Buffer.from(bytes).toString("base64"), mimeOriginal: mime, nombreArchivo: basename(ENTRADA), variantes: VARIANTES },
);

await navegador.close();

const base = basename(ENTRADA).replace(/\.[^.]+$/, "");
for (const s of salidas) {
  writeFileSync(join(SALIDA, `${base}-${s.etiqueta}.webp`), Buffer.from(s.datos, "base64"));
  console.log(`${s.etiqueta.padEnd(24)} ${s.ancho}x${s.alto}  ${(s.peso / 1024).toFixed(0)} KB`);
}
console.log(`\nEn ${SALIDA}/`);
