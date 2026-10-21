/**
 * Compara el pipeline de imágenes antes/después con una foto sintética que
 * imita una de celular: mucho megapíxel, detalle fino de "tela" y ruido que
 * el downscale destruye.
 *
 * uso: node scripts/image-quality-bench.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { PNG } from "pngjs";
import { encode } from "jpeg-js";

const OUT = "/tmp/opencode/imgbench";
mkdirSync(OUT, { recursive: true });

// --- Genera una foto de "celular": 4000x3000 con patrón fino + ruido ---
function generarFotoCelular(w, h) {
  const data = Buffer.alloc(w * h * 4);
  let seed = 42;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      // Textura de tela: rayas finas + trama diagonal
      const trama = (Math.sin(x * 0.9) + Math.sin(y * 0.85) + Math.sin((x + y) * 0.4)) * 18;
      const rayas = Math.sin(x * 1.7) * 12;
      const gradiente = (y / h) * 40 - 20;
      const ruido = (rand() - 0.5) * 14;
      data[i] = Math.max(0, Math.min(255, 150 + trama + rayas + gradiente + ruido));
      data[i + 1] = Math.max(0, Math.min(255, 130 + trama * 0.8 + gradiente + ruido));
      data[i + 2] = Math.max(0, Math.min(255, 120 + trama * 0.6 + ruido));
      data[i + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}

const foto = generarFotoCelular(4000, 3000);
const png = new PNG({ width: foto.width, height: foto.height });
foto.data.copy(png.data);
const pngBuffer = PNG.sync.write(png);
writeFileSync(`${OUT}/celular-4000x3000.png`, pngBuffer);
console.log(`Foto de celular generada: 4000x3000 PNG (${(pngBuffer.length / 1e6).toFixed(1)} MB)`);

// --- Pipeline "antes" (1800, 0.86, sin unsharp) ---
function pipeline(bitmap, { maxLado, unsharp }) {
  const scale = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  let cw, ch;
  if (w / h > 4 / 5) { ch = h; cw = Math.round((h * 4) / 5); }
  else { cw = w; ch = Math.round((w * 5) / 4); }
  const canvas = { width: cw, height: ch, data: new Uint8ClampedArray(cw * ch * 4) };
  // Escalado bilineal simple
  for (let y = 0; y < ch; y += 1) {
    const sy = Math.min(bitmap.height - 1, Math.floor((y + (h - ch) / 2) / scale));
    for (let x = 0; x < cw; x += 1) {
      const sx = Math.min(bitmap.width - 1, Math.floor((x + (w - cw) / 2) / scale));
      const si = (sy * bitmap.width + sx) * 4;
      const di = (y * cw + x) * 4;
      canvas.data[di] = bitmap.data[si];
      canvas.data[di + 1] = bitmap.data[si + 1];
      canvas.data[di + 2] = bitmap.data[si + 2];
      canvas.data[di + 3] = 255;
    }
  }
  if (unsharp) {
    const { data, width: ww, height: hh } = { data: canvas.data, width: cw, height: ch };
    const difuso = new Uint8ClampedArray(data.length);
    for (let y = 0; y < hh; y += 1) {
      for (let x = 0; x < ww; x += 1) {
        for (let c = 0; c < 3; c += 1) {
          let s = 0, n = 0;
          for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              const ny = y + dy, nx = x + dx;
              if (ny < 0 || ny >= hh || nx < 0 || nx >= ww) continue;
              s += data[(ny * ww + nx) * 4 + c]; n += 1;
            }
          }
          difuso[(y * ww + x) * 4 + c] = s / n;
        }
      }
    }
    for (let i = 0; i < data.length; i += 4) {
      for (let c = 0; c < 3; c += 1) {
        const o = data[i + c], su = difuso[i + c];
        data[i + c] = o + (o - su) * unsharp * 0.5 * 2;
      }
    }
  }
  return canvas;
}

// --- Métricas: nitidez (varianza de Laplacian) y tamaño ---
function nitidez(canvas) {
  const { data, width: w, height: h } = canvas;
  let suma = 0, suma2 = 0, n = 0;
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = (y * w + x) * 4;
      const g = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
      const lap = 4 * g
        - data[((y - 1) * w + x) * 4] * 0.299 - data[((y + 1) * w + x) * 4] * 0.299
        - data[(y * w + x - 1) * 4] * 0.299 - data[(y * w + x + 1) * 4] * 0.299
        - data[((y - 1) * w + x - 1) * 4] * 0.299 - data[((y - 1) * w + x + 1) * 4] * 0.299
        - data[((y + 1) * w + x - 1) * 4] * 0.299 - data[((y + 1) * w + x + 1) * 4] * 0.299;
      suma += lap; suma2 += lap * lap; n += 1;
    }
  }
  const media = suma / n;
  return Math.sqrt(Math.max(0, suma2 / n - media * media));
}

const antes = pipeline(foto, { maxLado: 1800, unsharp: 0 });
const despues = pipeline(foto, { maxLado: 2000, unsharp: 0.4 });

// WebP no está en node: medimos con JPEG a la misma calidad como proxy de peso.
const jpgAntes = encode({ data: Buffer.from(antes.data), width: antes.width, height: antes.height }, 86).data;
const jpgDespues = encode({ data: Buffer.from(despues.data), width: despues.width, height: despues.height }, 90).data;

const nAntes = nitidez(antes);
const nDespues = nitidez(despues);

console.log("\n=== Comparación (proxy JPEG, misma calidad que el WebP real) ===");
console.log(`ANTES  1800px q0.86 sin unsharp: ${antes.width}x${antes.height}  peso≈${(jpgAntes.length / 1024).toFixed(0)} KB  nitidez=${nAntes.toFixed(2)}`);
console.log(`DESPUÉS 2000px q0.90 con unsharp : ${despues.width}x${despues.height}  peso≈${(jpgDespues.length / 1024).toFixed(0)} KB  nitidez=${nDespues.toFixed(2)}`);
console.log(`\nNitidez: ${(((nDespues - nAntes) / nAntes) * 100).toFixed(1)}%  |  Peso: +${(((jpgDespues.length - jpgAntes.length) / jpgAntes.length) * 100).toFixed(1)}%`);

// Guarda las dos salidas para inspección visual.
for (const [nombre, c] of [["antes", antes], ["despues", despues]]) {
  const p = new PNG({ width: c.width, height: c.height });
  c.data.forEach((v, i) => { p.data[i] = v; });
  writeFileSync(`${OUT}/${nombre}.png`, PNG.sync.write(p));
}
console.log(`\nSalidas en ${OUT}/ (antes.png, despues.png, celular-4000x3000.png)`);
