/**
 * Preparación editorial de fotos de producto: recorte centrado a 4:5 (la
 * proporción del grid del sitio) + compresión WebP. Así toda foto subida —
 * aunque sea 1:1 o panorámica — queda en el mismo canvas y las tarjetas de
 * catálogo se ven sin marcos ni bandas.
 *
 * Recorta tipo "cover": si la fuente es más ancha que 4:5 se recorta a los
 * lados; si es más larga, se recorta arriba/abajo. Nunca agranda la foto.
 */

const MAX_LADO = 1800;
const RATIO_W = 4;
const RATIO_H = 5;

export async function prepareImage(file: File): Promise<File> {
  if (file.size === 0 || file.size > 30 * 1024 * 1024)
    throw new Error(`${file.name}: elige una foto de hasta 30 MB.`);
  if (!file.type.startsWith("image/"))
    throw new Error(`${file.name}: elige una fotografía.`);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(
      `${file.name}: este navegador no puede abrir ese formato. Exporta la foto como JPG, PNG o WebP.`,
    );
  }
  try {
    // 1) Escala lineal que respeta el lado máximo sin agrandar.
    const scale = Math.min(
      1,
      MAX_LADO / Math.max(bitmap.width, bitmap.height),
    );
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    // 2) Canvas 4:5 cubierto por la imagen escalada (recorte centrado).
    let canvasW: number;
    let canvasH: number;
    if (w / h > RATIO_W / RATIO_H) {
      canvasH = h;
      canvasW = Math.round((h * RATIO_W) / RATIO_H);
    } else {
      canvasW = w;
      canvasH = Math.round((w * RATIO_H) / RATIO_W);
    }

    const canvas = document.createElement("canvas");
    canvas.width = canvasW;
    canvas.height = canvasH;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No se pudo preparar la fotografía.");
    context.drawImage(
      bitmap,
      (canvasW - w) / 2,
      (canvasH - h) / 2,
      w,
      h,
    );
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) =>
          b
            ? resolve(b)
            : reject(new Error("No se pudo optimizar la fotografía.")),
        "image/webp",
        0.86,
      ),
    );
    if (blob.size > 5 * 1024 * 1024)
      throw new Error(`${file.name}: la foto optimizada supera 5 MB.`);
    const extension = blob.type === "image/webp" ? "webp" : "png";
    return new File(
      [blob],
      file.name.replace(/\.[^.]+$/, "") + "." + extension,
      { type: blob.type, lastModified: file.lastModified },
    );
  } finally {
    bitmap.close();
  }
}

/** Prueba del recorte centrado sin navegador (misma matemática en Node). */
export function corteCentrado4x5(width: number, height: number): {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
} {
  const scale = Math.min(1, MAX_LADO / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  let canvasW: number;
  let canvasH: number;
  if (w / h > RATIO_W / RATIO_H) {
    canvasH = h;
    canvasW = Math.round((h * RATIO_W) / RATIO_H);
  } else {
    canvasW = w;
    canvasH = Math.round((w * RATIO_H) / RATIO_W);
  }
  return {
    width: canvasW,
    height: canvasH,
    offsetX: Math.round((canvasW - w) / 2),
    offsetY: Math.round((canvasH - h) / 2),
  };
}
