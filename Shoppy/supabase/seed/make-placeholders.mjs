/**
 * Genera placeholders PNG con diseño (duotono + monograma), sin dependencias.
 * Mismos paths que referencia 20260928000002_seed.sql (upsert seguro).
 * Uso: node supabase/seed/make-placeholders.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { Buffer } from "node:buffer";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "placeholders");

const slugs = [
  "chaqueta-trucker-levis",
  "polera-nike-dryfit",
  "jeans-wrangler-rectos",
  "sweater-lana-vintage",
  "poleron-adidas-capucha",
  "vestido-zara-midi",
  "camisa-mango-lino",
  "jeans-levis-501",
  "cartera-cuero-genuino",
  "cinturon-cuero-trenzado",
  "vestido-hm-floral",
  "parka-gap-impermeable",
  "blazer-zara-sastrero",
  "falda-denim-vintage",
  "panuelo-seda-estampado",
  "polera-puma-esencial",
  "camisa-lacoste-oxford",
  "chaqueta-cuero-vintage",
  "shorts-jean-levis",
  "chaleco-tommy-hilfiger",
];
// Nº de fotos por índice de producto (debe coincidir con 20260928000002_seed.sql):
// 3 fotos (portada+detalle+defecto): idx 3, 13, 17 · 1 foto: idx 9, 14, 15 · resto: 2.
const shots = { 3: 3, 13: 3, 17: 3, 9: 1, 14: 1, 15: 1 };
// Duotonos (claro -> oscuro) por producto.
const duos = [
  [[238, 234, 226], [176, 170, 158]],
  [[228, 232, 235], [158, 172, 182]],
  [[232, 226, 222], [168, 150, 142]],
  [[226, 232, 226], [156, 172, 156]],
  [[235, 228, 232], [178, 156, 166]],
  [[228, 230, 238], [160, 166, 186]],
  [[238, 232, 224], [184, 164, 140]],
  [[224, 228, 234], [150, 160, 178]],
  [[236, 230, 222], [172, 148, 128]],
  [[230, 230, 230], [160, 160, 160]],
  [[238, 230, 234], [182, 158, 172]],
  [[226, 230, 228], [154, 168, 158]],
  [[230, 228, 236], [162, 158, 180]],
  [[234, 228, 224], [174, 152, 136]],
  [[236, 232, 238], [176, 162, 184]],
  [[228, 234, 230], [158, 176, 158]],
  [[234, 230, 226], [176, 154, 134]],
  [[226, 226, 230], [152, 152, 166]],
  [[232, 234, 236], [164, 174, 184]],
  [[236, 234, 228], [178, 170, 150]],
];

// Fuente 5x7 (filas como bitmask de 5 bits) A-Z, 0-9, espacio, guion.
const FONT = {
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  D: [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
  H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
  N: [0x11, 0x19, 0x19, 0x15, 0x13, 0x13, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  0: [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  1: [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  2: [0x0e, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1f],
  3: [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e],
  4: [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  5: [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  6: [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  7: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  8: [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  9: [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  " ": [0, 0, 0, 0, 0, 0, 0],
  "-": [0, 0, 0, 0x1f, 0, 0, 0],
};

function crc32(buf) {
  let table = crc32.t;
  if (!table) {
    table = crc32.t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const W = 600, H = 800;

function drawText(px, text, x0, y0, scale, color) {
  for (let li = 0; li < text.length; li++) {
    const glyph = FONT[text[li]] ?? FONT[" "];
    for (let gy = 0; gy < 7; gy++) {
      for (let gx = 0; gx < 5; gx++) {
        if (glyph[gy] & (0x10 >> gx)) {
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) {
              const x = x0 + li * 6 * scale + gx * scale + sx;
              const y = y0 + gy * scale + sy;
              if (x >= 0 && x < W && y >= 0 && y < H) {
                const o = (y * W + x) * 3;
                px[o] = color[0]; px[o + 1] = color[1]; px[o + 2] = color[2];
              }
            }
          }
        }
      }
    }
  }
}

/** Iniciales del slug: primeras letras de las 2 primeras palabras. */
function initials(slug) {
  const words = slug.split("-").filter(Boolean);
  return ((words[0]?.[0] ?? "S") + (words[1]?.[0] ?? "H")).toUpperCase();
}

function designPng([top, bottom], mono, variant) {
  const px = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1);
    for (let x = 0; x < W; x++) {
      // Degradado vertical + franja diagonal sutil.
      const stripe = ((x + y + variant * 60) % 48 < 3) ? -10 : 0;
      const o = (y * W + x) * 3;
      px[o] = Math.max(0, Math.min(255, Math.round(top[0] + (bottom[0] - top[0]) * t + stripe)));
      px[o + 1] = Math.max(0, Math.min(255, Math.round(top[1] + (bottom[1] - top[1]) * t + stripe)));
      px[o + 2] = Math.max(0, Math.min(255, Math.round(top[2] + (bottom[2] - top[2]) * t + stripe)));
    }
  }
  const cx = W / 2, cy = H / 2 - 40, R = 150;
  // Círculo: anillo blanco de 6px.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (Math.abs(d - R) < 3) {
        const o = (y * W + x) * 3;
        px[o] = 255; px[o + 1] = 255; px[o + 2] = 255;
      }
    }
  }
  // Monograma centrado (2 letras 5x7 a escala 11).
  const scale = 11;
  const textW = mono.length * 6 * scale - scale;
  drawText(px, mono, Math.round(cx - textW / 2), Math.round(cy - (7 * scale) / 2), scale, [255, 255, 255]);
  // Banda inferior con número de toma.
  for (let y = H - 90; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 3;
      px[o] = Math.max(0, px[o] - 22); px[o + 1] = Math.max(0, px[o + 1] - 22); px[o + 2] = Math.max(0, px[o + 2] - 22);
    }
  }
  drawText(px, `0${variant}`, 28, H - 68, 5, [255, 255, 255]);
  drawText(px, "SHOPY", W - 28 - 5 * 6 * 5 + 5, H - 62, 5, [255, 255, 255]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  const rows = [];
  for (let y = 0; y < H; y++) {
    rows.push(Buffer.concat([Buffer.from([0]), px.subarray(y * W * 3, (y + 1) * W * 3)]));
  }
  const idat = deflateSync(Buffer.concat(rows));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0)),
  ]);
}

let n = 0;
slugs.forEach((slug, i) => {
  const count = shots[i] ?? 2;
  const mono = initials(slug);
  for (let s = 1; s <= count; s++) {
    const file = join(root, "products", slug, `0${s}.png`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, designPng(duos[i % duos.length], mono, s));
    n++;
  }
});
console.log(`OK: ${n} placeholders con diseño en ${root}/products/<slug>/0N.png`);
