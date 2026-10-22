/**
 * Verificacion final del pipeline con fotos REALES de 48 MP:
 *
 *  - nitidez: ratio Laplacian/Gradiente sobre el archivo final ya comprimido
 *  - ruido:   desviacion tipica en una zona PLANA de la foto (la saba, el
 *              fondo). El realce amplifica el ruido: hay que medirlo, no
 *              suponerlo.
 *
 * Compara el pipeline actual contra el candidato, sobre la MISMA zona plana.
 *
 *   node scripts/image-quality-ruido.mjs <foto> [salida]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { chromium } from "playwright";

const ENTRADA = process.argv[2];
const SALIDA = process.argv[3] ?? "/tmp/opencode/ruido";
if (!ENTRADA) {
  console.error("uso: node scripts/image-quality-ruido.mjs <foto> [salida]");
  process.exit(1);
}
mkdirSync(SALIDA, { recursive: true });
const bytes = readFileSync(ENTRADA);
const mime = extname(ENTRADA).toLowerCase() === ".png" ? "image/png" : "image/jpeg";

const VARIANTES = [
  { etiqueta: "actual-1800-q086", maxLado: 1800, calidad: 0.86, cantidad: 0 },
  { etiqueta: "candidato-1600-q080-realce", maxLado: 1600, calidad: 0.8, cantidad: 1.5 },
  { etiqueta: "candidato-1600-q083-realce", maxLado: 1600, calidad: 0.83, cantidad: 1.5 },
  { etiqueta: "sin-realce-1600-q080", maxLado: 1600, calidad: 0.8, cantidad: 0 },
];

const navegador = await chromium.launch();
const pagina = await navegador.newPage();

const salida = await pagina.evaluate(
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

    const resultados = [];
    for (const v of variantes) {
      const canvas = lienzo(v.maxLado);
      if (v.cantidad > 0) realzar(canvas.ctx, 2, v.cantidad);
      const blob = await new Promise((r) => canvas.toBlob(r, "image/webp", v.calidad));
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

      // Zona plana: el bloque mas uniforme (la sabana) del cuadrante
      // superior izquierdo. Ahi se mide el ruido: varianza local.
      const zonaW = Math.floor(W * 0.22);
      const zonaH = Math.floor(H * 0.16);
      const x0 = Math.floor(W * 0.03);
      const y0 = Math.floor(H * 0.03);
      let suma = 0;
      let cuenta = 0;
      for (let y = y0; y < y0 + zonaH; y += 1) {
        for (let x = x0; x < x0 + zonaW; x += 1) {
          suma += luma[y * W + x];
          cuenta += 1;
        }
      }
      const media = suma / cuenta;
      // El ruido real de una imagen con grano no es el sigma global: se mide
      // el sigma de la diferencia entre pixeles vecinos (algo de alta
      // frecuencia), que es justo lo que el realce amplifica.
      let dif2 = 0;
      let difN = 0;
      for (let y = y0; y < y0 + zonaH; y += 1) {
        for (let x = x0; x < x0 + zonaW - 1; x += 1) {
          const d2 = luma[y * W + x + 1] - luma[y * W + x];
          dif2 += d2 * d2;
          difN += 1;
        }
      }
      const ruido = Math.sqrt(dif2 / difN / 2);

      let bin = "";
      const buf = new Uint8Array(await blob.arrayBuffer());
      for (let i = 0; i < buf.length; i += 0x8000) {
        bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      }
      resultados.push({
        etiqueta: v.etiqueta,
        ancho: W,
        alto: H,
        peso: blob.size,
        nitidez: Math.sqrt(sumaL2 / n) / Math.sqrt(sumaG2 / n),
        ruido,
        brilloZona: media,
        datos: btoa(bin),
      });
      dec.close();
    }
    bitmap.close();
    return resultados;
  },
  { datos: Buffer.from(bytes).toString("base64"), mimeOriginal: mime, nombreArchivo: basename(ENTRADA), variantes: VARIANTES },
);

await navegador.close();

const base = basename(ENTRADA).replace(/\.[^.]+$/, "");
console.log(`\n=== ${base} ===`);
console.log("variante                        peso    nitidez   ruido(zona plana)");
for (const r of salida) {
  writeFileSync(join(SALIDA, `${base}-${r.etiqueta}.webp`), Buffer.from(r.datos, "base64"));
  console.log(
    `${r.etiqueta.padEnd(30)} ${(r.peso / 1024).toFixed(0).padStart(4)} KB  ${r.nitidez.toFixed(3)}   ${r.ruido.toFixed(3)}   (brillo ${r.brilloZona.toFixed(0)})`,
  );
}
console.log(`\nEn ${SALIDA}/`);
