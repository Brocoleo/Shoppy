/**
 * Genera placeholders PNG locales para el seed (sin dependencias externas).
 * Un PNG válido por cada imagen referenciada en 20260928000002_seed.sql.
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
const palette = [
  [232, 232, 230], [214, 214, 210], [240, 238, 234],
  [222, 226, 228], [235, 230, 224], [226, 222, 228],
];

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

/** PNG sólido de W×H con banda inferior sutil (placeholder editorial neutro). */
function placeholderPng([r, g, b], seed) {
  const W = 600, H = 800;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit truecolor
  const rows = [];
  for (let y = 0; y < H; y++) {
    const row = Buffer.alloc(1 + W * 3);
    row[0] = 0;
    const band = y > H - 90; // banda inferior
    const j = ((seed * 37 + y * 11) % 7) - 3;
    for (let x = 0; x < W; x++) {
      const o = 1 + x * 3;
      row[o] = Math.max(0, Math.min(255, r + j - (band ? 14 : 0)));
      row[o + 1] = Math.max(0, Math.min(255, g + j - (band ? 14 : 0)));
      row[o + 2] = Math.max(0, Math.min(255, b + j - (band ? 14 : 0)));
    }
    rows.push(row);
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
  const color = palette[i % palette.length];
  for (let s = 1; s <= count; s++) {
    const file = join(root, "products", slug, `0${s}.png`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, placeholderPng(color, i + s));
    n++;
  }
});
console.log(`OK: ${n} placeholders en ${root}/products/<slug>/0N.png`);
