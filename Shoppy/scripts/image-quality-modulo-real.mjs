/**
 * Verificacion del pipeline REAL (no una copia).
 *
 * Transpila apps/admin/src/lib/prepareImage.ts con el compilador de
 * TypeScript y ejecuta ESE modulo dentro de Chromium, con fotos reales. Asi
 * lo que se mide es exactamente el codigo que usa el admin, no una
 * reimplementacion que podria divergir.
 *
 * Para cada combinacion de parametros se parchean las constantes del modulo
 * y se mide el archivo resultante: peso, nitidez (sobre el archivo ya
 * comprimido) y ruido (en la zona plana).
 *
 *   node scripts/image-quality-modulo-real.mjs <carpeta-de-fotos> [salida]
 */
import { readdirSync, readFileSync, mkdirSync } from "node:fs";
import { extname, join } from "node:path";
import { chromium } from "playwright";
import ts from "typescript";

const ORIGEN = process.argv[2];
const SALIDA = process.argv[3] ?? "/tmp/opencode/modulo-real";
if (!ORIGEN) {
  console.error("uso: node scripts/image-quality-modulo-real.mjs <carpeta> [salida]");
  process.exit(1);
}
mkdirSync(SALIDA, { recursive: true });

const MODULO = join(process.cwd(), "apps/admin/src/lib/prepareImage.ts");
const fuente = readFileSync(MODULO, "utf8");

/** Transpila el modulo real a JS y parchea los parametros. */
function compilarCon({ maxLado, calidad, radio, cantidad, umbral }) {
  const js = ts.transpileModule(fuente, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  const parcheado = js
    .replace(/const MAX_LADO = \d+;/, `const MAX_LADO = ${maxLado};`)
    .replace(/const WEBP_QUALITY = [\d.]+;/, `const WEBP_QUALITY = ${calidad};`)
    .replace(/const DETALLE_RADIO = [\d.]+;/, `const DETALLE_RADIO = ${radio};`)
    .replace(/const DETALLE_CANTIDAD = [\d.]+;/, `const DETALLE_CANTIDAD = ${cantidad};`)
    .replace(/const DETALLE_UMBRAL = [\d.]+;/, `const DETALLE_UMBRAL = ${umbral};`);
  return parcheado;
}

const COMBINACIONES = [
  { etiqueta: "repo antes 2000 q0.90 r2 a1.5", maxLado: 2000, calidad: 0.9, radio: 2, cantidad: 1.5, umbral: 0 },
  { etiqueta: "version previa 1800 q0.86 s/u", maxLado: 1800, calidad: 0.86, radio: 0, cantidad: 0, umbral: 0 },
  { etiqueta: "NUEVO 1700 q0.86 r1 a0.5 u3", maxLado: 1700, calidad: 0.86, radio: 1, cantidad: 0.5, umbral: 3 },
  { etiqueta: "1700 q0.86 r1 a0.5 s/u", maxLado: 1700, calidad: 0.86, radio: 1, cantidad: 0.5, umbral: 0 },
  { etiqueta: "1700 q0.86 r1 a0.8 u4", maxLado: 1700, calidad: 0.86, radio: 1, cantidad: 0.8, umbral: 4 },
  { etiqueta: "1700 q0.86 s/u", maxLado: 1700, calidad: 0.86, radio: 0, cantidad: 0, umbral: 0 },
];

const modulos = new Map();
for (const c of COMBINACIONES) {
  modulos.set(c.etiqueta, compilarCon(c));
}

const archivos = readdirSync(ORIGEN)
  .filter((n) => /\.(jpe?g|png|webp)$/i.test(n))
  .sort();

const navegador = await chromium.launch();
const pagina = await navegador.newPage();
const filas = [];

for (const nombre of archivos) {
  const bytes = readFileSync(join(ORIGEN, nombre));
  const mime = extname(nombre).toLowerCase() === ".png" ? "image/png" : "image/jpeg";
  const entrada = Buffer.from(bytes).toString("base64");

  const resultado = await pagina.evaluate(
    async ({ datos, mimeOriginal, nombreArchivo, fuentes }) => {
      const binario = atob(datos);
      const buffer = new Uint8Array(binario.length);
      for (let i = 0; i < binario.length; i += 1) buffer[i] = binario.charCodeAt(i);
      const archivo = new File([buffer], nombreArchivo, { type: mimeOriginal });

      const salida = [];
      for (const [etiqueta, codigo] of fuentes) {
        // El modulo real usa document/window: se evalua en el contexto de la
        // pagina (Chromium), no en Node.
        const modulo = await import(
          `data:text/javascript;base64,${btoa(unescape(encodeURIComponent(codigo)))}`
        );
        const t0 = performance.now();
        const optimizada = await modulo.prepareImage(archivo);
        const ms = Math.round(performance.now() - t0);

        // Decodificar el resultado: lo que midamos es lo que se guarda.
        const dec = await createImageBitmap(optimizada);
        const c = document.createElement("canvas");
        c.width = dec.width;
        c.height = dec.height;
        const ctx = c.getContext("2d");
        ctx.drawImage(dec, 0, 0);
        const p = ctx.getImageData(0, 0, c.width, c.height).data;
        const W = c.width;
        const H = c.height;
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
        // Ruido en la zona plana (fondo de la foto).
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
        let bin = "";
        const buf = new Uint8Array(await optimizada.arrayBuffer());
        for (let i = 0; i < buf.length; i += 0x8000) {
          bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
        }
        salida.push({
          etiqueta,
          ancho: W,
          alto: H,
          peso: optimizada.size,
          ms,
          nitidez: Math.sqrt(sumaL2 / n) / Math.sqrt(sumaG2 / n),
          ruido: Math.sqrt(dif2 / difN / 2),
          datos: btoa(bin),
        });
        dec.close();
      }
      return salida;
    },
    {
      datos: entrada,
      mimeOriginal: mime,
      nombreArchivo: nombre,
      fuentes: [...modulos.entries()],
    },
  );

  filas.push({ nombre, versiones: resultado });
  console.log(
    `${nombre}  ` +
      resultado.map((v) => `${(v.peso / 1024).toFixed(0)}KB/${v.nitidez.toFixed(2)}/${v.ruido.toFixed(2)}/${v.ms}ms`).join("  "),
  );
}

await navegador.close();

console.log(`\n=== MODULO REAL prepareImage.ts sobre ${filas.length} fotos de 48 MP ===`);
console.log("combinación                     KB/foto  nitidez  ruido   tiempo  Δnitidez  Δruido");
const nitRef = filas.reduce((a, f) => a + f.versiones[0].nitidez, 0) / filas.length;
const ruiRef = filas.reduce((a, f) => a + f.versiones[0].ruido, 0) / filas.length;
for (let k = 0; k < COMBINACIONES.length; k += 1) {
  const c = COMBINACIONES[k];
  const peso = filas.reduce((a, f) => a + f.versiones[k].peso, 0) / filas.length / 1024;
  const nit = filas.reduce((a, f) => a + f.versiones[k].nitidez, 0) / filas.length;
  const rui = filas.reduce((a, f) => a + f.versiones[k].ruido, 0) / filas.length;
  const ms = filas.reduce((a, f) => a + f.versiones[k].ms, 0) / filas.length;
  console.log(
    `${c.etiqueta.padEnd(30)} ${peso.toFixed(0).padStart(5)} KB  ${nit.toFixed(3)}  ${rui.toFixed(2)}  ${ms.toFixed(0).padStart(4)}ms  ${(((nit - nitRef) / nitRef) * 100).toFixed(1).padStart(6)}%  ${(((rui - ruiRef) / ruiRef) * 100).toFixed(1).padStart(6)}%`,
  );
}
console.log(`\n(referencia: ${COMBINACIONES[0].etiqueta})`);
