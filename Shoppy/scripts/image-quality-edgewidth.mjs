/**
 * Metrica de nitidez honesta: ancho de la transicion de borde.
 *
 * En un borde fuerte (una costura, el borde de una letra) se mide cuantos
 * pixeles tarda la imagen en pasar del 10% al 90% de la diferencia de luz.
 * Cuanto MAS ANCHO, mas borrosa. Un realce estrecho esa rampa.
 *
 * No la falsea el contenido de la foto: cada version se mide sobre SU
 * propio lienzo y se normaliza por el tamaño final, de modo que comparar
 * "antes" (1800) con "despues" (2000) es legitimo.
 *
 *   node scripts/image-quality-edgewidth.mjs <carpeta-de-fotos> [salida]
 */
import { readdirSync, readFileSync, mkdirSync } from "node:fs";
import { extname, join } from "node:path";
import { chromium } from "playwright";

const ORIGEN = process.argv[2];
const SALIDA = process.argv[3] ?? "/tmp/opencode/edgewidth";
if (!ORIGEN) {
  console.error("uso: node scripts/image-quality-edgewidth.mjs <carpeta> [salida]");
  process.exit(1);
}
mkdirSync(SALIDA, { recursive: true });

const archivos = readdirSync(ORIGEN)
  .filter((n) => /\.(jpe?g|png|webp)$/i.test(n))
  .sort();

const navegador = await chromium.launch();
const pagina = await navegador.newPage();

const VARIANTES = [
  { etiqueta: "A-antes-1800-q086", maxLado: 1800, calidad: 0.86, radio: 0, cantidad: 0 },
  { etiqueta: "B-nuevo-2000-q090", maxLado: 2000, calidad: 0.9, radio: 0, cantidad: 0 },
  { etiqueta: "C-nuevo-realce", maxLado: 2000, calidad: 0.9, radio: 2, cantidad: 1.5 },
  { etiqueta: "D-ligero-1600-q086-realce", maxLado: 1600, calidad: 0.86, radio: 2, cantidad: 1.5 },
];

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

      /**
       * Nitidez por ratio Laplacian/Gradiente (metodo estandar de deteccion
       * de desenfoque). El Laplacian y el gradiente escalan igual al
       * redimensionar, asi que el ratio es COMPARABLE entre versiones de
       * distinto tamaño: mas alto = mas nitido.
       *
       *   ratio = sqrt(E[L^2]) / sqrt(E[G^2])
       */
      function nitidezRatio(ctx) {
        const W = ctx.canvas.width;
        const H = ctx.canvas.height;
        const p = ctx.getImageData(0, 0, W, H).data;
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
            const c = luma[i];
            const der = luma[i + 1];
            const izq = luma[i - 1];
            const arr = luma[i - W];
            const abj = luma[i + W];
            const lap = 4 * c - der - izq - arr - abj;
            const gx = (der - izq) / 2;
            const gy = (arr - abj) / 2;
            sumaL2 += lap * lap;
            sumaG2 += gx * gx + gy * gy;
            n += 1;
          }
        }
        if (n === 0 || sumaG2 === 0) return null;
        return Math.sqrt(sumaL2 / n) / Math.sqrt(sumaG2 / n);
      }

      const salida = [];
      for (const v of variantes) {
        const canvas = lienzo(v.maxLado);
        if (v.cantidad > 0) realzar(canvas.ctx, v.radio, v.cantidad);
        const blob = await new Promise((r) => canvas.toBlob(r, "image/webp", v.calidad));
        salida.push({
          etiqueta: v.etiqueta,
          ancho: canvas.width,
          alto: canvas.height,
          peso: blob.size,
          nitidez: nitidezRatio(canvas.ctx),
        });
      }
      bitmap.close();
      return salida;
    },
    { datos: entrada, mimeOriginal: mime, nombreArchivo: nombre, variantes: VARIANTES },
  );

  filas.push({ nombre, versiones: resultado });
  console.log(
    `${nombre}  ` +
      resultado
        .map((v) => `${v.etiqueta.split("-")[0]}:${v.nitidez ? v.nitidez.toFixed(4) : "n/d"}/${(v.peso / 1024).toFixed(0)}KB`)
        .join("  "),
  );
}

await navegador.close();

console.log(`\n=== Nitidez media (mas alto = mas nitido) ===`);
for (let k = 0; k < VARIANTES.length; k += 1) {
  const v = VARIANTES[k];
  const valores = filas.map((f) => f.versiones[k].nitidez).filter((x) => x != null);
  const media = valores.reduce((a, b) => a + b, 0) / valores.length;
  const peso = filas.reduce((a, f) => a + f.versiones[k].peso, 0) / filas.length / 1024;
  console.log(
    `${v.etiqueta.padEnd(30)} ratio ${media.toFixed(4)}   ${peso.toFixed(0)} KB/foto`,
  );
}
