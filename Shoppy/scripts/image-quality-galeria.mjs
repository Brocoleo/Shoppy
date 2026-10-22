/**
 * Galería comparativa: antes vs. ahora, sobre las fotos reales.
 *
 * Usa el módulo real del repo (prepareImage.ts) transpilado con TypeScript,
 * de modo que lo que se ve es exactamente lo que se sube al almacén.
 *
 * Para cada foto genera:
 *   - la versión ANTERIOR (1800 px, WebP 0.86, sin realce)
 *   - la versión NUEVA (lo que hay hoy en el repo)
 *   - un recorte ampliado x2 de una zona con detalle y de otra plana (fondo)
 *
 * Escribe un index.html con todo ordenado y listo para abrir en el iPhone.
 *
 *   node scripts/image-quality-galeria.mjs [carpeta-de-fotos] [salida]
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import { chromium } from "playwright";
import ts from "typescript";

const ORIGEN = process.argv[2] ?? "apps/admin/tests/fixtures/local";
const SALIDA = process.argv[3] ?? "/tmp/opencode/galeria";
mkdirSync(SALIDA, { recursive: true });

const MODULO = join(process.cwd(), "apps/admin/src/lib/prepareImage.ts");
const fuenteModulo = readFileSync(MODULO, "utf8");

/** Compila el módulo real con los parámetros indicados. */
function compilarCon({ maxLado, calidad, radio, cantidad, umbral }) {
  const js = ts.transpileModule(fuenteModulo, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  return js
    .replace(/const MAX_LADO = \d+;/, `const MAX_LADO = ${maxLado};`)
    .replace(/const WEBP_QUALITY = [\d.]+;/, `const WEBP_QUALITY = ${calidad};`)
    .replace(/const DETALLE_RADIO = [\d.]+;/, `const DETALLE_RADIO = ${radio};`)
    .replace(/const DETALLE_CANTIDAD = [\d.]+;/, `const DETALLE_CANTIDAD = ${cantidad};`)
    .replace(/const DETALLE_UMBRAL = [\d.]+;/, `const DETALLE_UMBRAL = ${umbral};`);
}

const VARIANTES = [
  {
    clave: "antes",
    titulo: "ANTES",
    nota: "1800 px · WebP 0.86 · sin realce",
    maxLado: 1800,
    calidad: 0.86,
    radio: 0,
    cantidad: 0,
    umbral: 0,
  },
  {
    clave: "ahora",
    titulo: "AHORA",
    nota: "1700 px · WebP 0.86 · realce r1 ×0.5 con umbral",
    maxLado: 1700,
    calidad: 0.86,
    radio: 1,
    cantidad: 0.5,
    umbral: 3,
  },
];

// Zonas de recorte en coordenadas relativas (misma región en cada versión).
const ZONAS = [
  { clave: "detalle", titulo: "Detalle (×2)", x: 0.37, y: 0.42, w: 0.26, h: 0.13 },
  { clave: "plano", titulo: "Fondo plano (×2)", x: 0.03, y: 0.03, w: 0.22, h: 0.16 },
];

const archivos = readdirSync(ORIGEN)
  .filter((n) => /^IMG_\d+\.jpe?g$/i.test(n))
  .sort();

if (!archivos.length) {
  console.error(`No hay fotos en ${ORIGEN}`);
  process.exit(1);
}

const navegador = await chromium.launch();
const pagina = await navegador.newPage();
const fichas = [];

for (const nombre of archivos) {
  const bytes = readFileSync(join(ORIGEN, nombre));
  const mime = "image/jpeg";
  const codigos = VARIANTES.map((v) => [
    v.clave,
    compilarCon(v),
  ]);

  const resultado = await pagina.evaluate(
    async ({ datos, mimeOriginal, nombreArchivo, fuentes, zonas }) => {
      const binario = atob(datos);
      const buffer = new Uint8Array(binario.length);
      for (let i = 0; i < binario.length; i += 1) buffer[i] = binario.charCodeAt(i);
      const archivo = new File([buffer], nombreArchivo, { type: mimeOriginal });

      const aB64 = (u8) => {
        let bin = "";
        for (let i = 0; i < u8.length; i += 0x8000) {
          bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
        }
        return btoa(bin);
      };

      const salida = [];
      for (const [clave, codigo] of fuentes) {
        const modulo = await import(
          `data:text/javascript;base64,${btoa(unescape(encodeURIComponent(codigo)))}`
        );
        const optimizada = await modulo.prepareImage(archivo);
        const dec = await createImageBitmap(optimizada);

        // Lienzo con la imagen completa.
        const full = document.createElement("canvas");
        full.width = dec.width;
        full.height = dec.height;
        const ctxFull = full.getContext("2d");
        ctxFull.drawImage(dec, 0, 0);
        const fullBlob = await new Promise((r) => full.toBlob(r, "image/png"));

        // Recortes ampliados x2.
        const recortes = [];
        for (const z of zonas) {
          const sx = Math.round(z.x * dec.width);
          const sy = Math.round(z.y * dec.height);
          const sw = Math.round(z.w * dec.width);
          const sh = Math.round(z.h * dec.height);
          const c = document.createElement("canvas");
          c.width = sw * 2;
          c.height = sh * 2;
          const ctx = c.getContext("2d");
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(dec, sx, sy, sw, sh, 0, 0, sw * 2, sh * 2);
          const blob = await new Promise((r) => c.toBlob(r, "image/png"));
          recortes.push({
            clave: z.clave,
            titulo: z.titulo,
            datos: aB64(new Uint8Array(await blob.arrayBuffer())),
          });
        }

        salida.push({
          clave,
          peso: optimizada.size,
          ancho: dec.width,
          alto: dec.height,
          full: aB64(new Uint8Array(await fullBlob.arrayBuffer())),
          recortes,
        });
        dec.close();
      }
      return salida;
    },
    {
      datos: Buffer.from(bytes).toString("base64"),
      mimeOriginal: mime,
      nombreArchivo: nombre,
      fuentes: codigos,
      zonas: ZONAS,
    },
  );

  const base = basename(nombre).replace(/\.[^.]+$/, "");
  const porClave = new Map(resultado.map((r) => [r.clave, r]));
  for (const v of VARIANTES) {
    const r = porClave.get(v.clave);
    writeFileSync(join(SALIDA, `${base}-${v.clave}.png`), Buffer.from(r.full, "base64"));
    for (const rec of r.recortes) {
      writeFileSync(
        join(SALIDA, `${base}-${v.clave}-${rec.clave}.png`),
        Buffer.from(rec.datos, "base64"),
      );
    }
  }
  fichas.push({ base, nombre, porClave });
  console.log(
    `${nombre}  antes ${(porClave.get("antes").peso / 1024).toFixed(0)} KB  ·  ahora ${(porClave.get("ahora").peso / 1024).toFixed(0)} KB`,
  );
}

await navegador.close();

// ---------------------------------------------------------------------------
// index.html
// ---------------------------------------------------------------------------
const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Comparativa de fotos · antes vs ahora</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; font: 16px/1.5 -apple-system, system-ui, "Segoe UI", sans-serif;
         background: #f4f1ea; color: #1c1a17; }
  header { padding: 24px 16px 8px; }
  h1 { font-size: 22px; margin: 0 0 6px; }
  p.sub { margin: 0; color: #6b6459; font-size: 15px; }
  section { padding: 16px; border-bottom: 1px solid #ddd6c8; }
  h2 { font-size: 17px; margin: 0 0 10px; font-variant-numeric: tabular-nums; }
  .par { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  figure { margin: 0; }
  figcaption { font-size: 13px; color: #6b6459; margin-top: 4px; text-align: center; }
  figcaption b { display: block; color: #1c1a17; font-size: 14px; }
  img { width: 100%; border-radius: 8px; background: #e7e1d5; display: block; }
  .zoom { margin-top: 12px; }
  .zoom .par { gap: 6px; }
  .zoom img { image-rendering: auto; }
  a { color: #7a5c2e; }
</style>
</head>
<body>
<header>
  <h1>Fotos del iPhone: antes vs. ahora</h1>
  <p class="sub">Izquierda: pipeline anterior (1800 px, WebP 0.86, sin realce).
     Derecha: el nuevo (1700 px, WebP 0.86, realce de radio 1 ×0.5 con umbral de ruido).
     Las imágenes son las que se suben al almacén.</p>
</header>
${fichas
  .map(
    (f) => `<section>
  <h2>${f.nombre}</h2>
  <div class="par">
    ${VARIANTES.map((v) => {
      const r = f.porClave.get(v.clave);
      return `<figure>
      <img src="${f.base}-${v.clave}.png" alt="${f.nombre} ${v.titulo}" loading="lazy" />
      <figcaption><b>${v.titulo}</b>${v.nota} · ${(r.peso / 1024).toFixed(0)} KB · ${r.ancho}×${r.alto}</figcaption>
    </figure>`;
    }).join("\n    ")}
  </div>
  <div class="zoom">
    ${ZONAS.map(
      (z) => `<div class="par" style="margin-bottom:10px">
      ${VARIANTES.map((v) => `<figure>
        <img src="${f.base}-${v.clave}-${z.clave}.png" alt="${z.titulo} ${v.titulo}" loading="lazy" />
        <figcaption><b>${v.titulo}</b>${z.titulo}</figcaption>
      </figure>`).join("\n      ")}
    </div>`,
    ).join("\n    ")}
  </div>
</section>`,
  )
  .join("\n")}
</body>
</html>
`;

writeFileSync(join(SALIDA, "index.html"), html);
console.log(`\nGalería lista en ${SALIDA}/index.html`);
