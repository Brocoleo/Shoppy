/**
 * Preparación editorial de fotos de producto: recorte centrado a 4:5 (la
 * proporción del grid del sitio) + compresión WebP + realce de detalle.
 * Así toda foto subida — aunque sea 1:1 o panorámica — queda en el mismo
 * canvas y las tarjetas de catálogo se ven sin marcos ni bandas.
 *
 * Recorta tipo "cover": si la fuente es más ancha que 4:5 se recorta a los
 * lados; si es más larga, se recorta arriba/abajo. Nunca agranda la foto.
 *
 * Las fotos de celular llegan con mucho megapíxel y, tras el downscale, con
 * poco detalle apparent: por eso se sube el lado máximo, la calidad de WebP y
 * se realza el detalle fino.
 */

const MAX_LADO = 2000;      // máx lado largo (antes 1800)
const RATIO_W = 4;
const RATIO_H = 5;
const WEBP_QUALITY = 0.9;   // calidad WebP (antes 0.86)
/** Radio del desenfoque usado para detectar el detalle fino (px). */
const DETALLE_RADIO = 2;
/**
 * Intensidad del realce. Medido sobre fotos reales de celular: con 0.4-0.8 el
 * cambio es imperceptible; 1.5 es lo que se nota como nitidez real sin
 * empezar a amplificar el ruido de las zonas oscuras.
 */
const DETALLE_CANTIDAD = 1.5;

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
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(
      bitmap,
      (canvasW - w) / 2,
      (canvasH - h) / 2,
      w,
      h,
    );
    realzarDetalle(context, canvasW, canvasH);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) =>
          b
            ? resolve(b)
            : reject(new Error("No se pudo optimizar la fotografía.")),
        "image/webp",
        WEBP_QUALITY,
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

/**
 * Realza el detalle fino (unsharp mask) trabajando SOLO sobre la luminancia.
 *
 * El downscale de una foto de celular borra el detalle de la tela. Restar una
 * versión desenfocada y devolver esa diferencia devuelve el detalle. Se hace
 * sobre la luminancia y se aplica la misma corrección a los tres canales: así
 * no aparecen halos de color y cuesta un tercio que trabajar en RGB.
 *
 * El búfer es flotante a propósito: con enteros de 8 bits el redondeo anula
 * el efecto en las zonas de bajo contraste (sombras), que es justo donde más
 * se nota la falta de nitidez.
 */
function realzarDetalle(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  if (DETALLE_CANTIDAD <= 0 || width < 5 || height < 5) return;
  try {
    const imagen = context.getImageData(0, 0, width, height);
    const { data } = imagen;
    const pixeles = width * height;

    // 1) Luminancia en coma flotante.
    const luma = new Float32Array(pixeles);
    for (let i = 0; i < pixeles; i += 1) {
      const p = i * 4;
      luma[i] = data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114;
    }

    // 2) Desenfoque de caja separable (dos pasadas: horizontal y vertical).
    const temporal = new Float32Array(pixeles);
    const difuso = new Float32Array(pixeles);
    const r = DETALLE_RADIO;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let suma = 0;
        let cuenta = 0;
        for (let dx = -r; dx <= r; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          suma += luma[y * width + nx];
          cuenta += 1;
        }
        temporal[y * width + x] = suma / cuenta;
      }
    }
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let suma = 0;
        let cuenta = 0;
        for (let dy = -r; dy <= r; dy += 1) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          suma += temporal[ny * width + x];
          cuenta += 1;
        }
        difuso[y * width + x] = suma / cuenta;
      }
    }

    // 3) Se devuelve la diferencia a los tres canales por igual.
    for (let i = 0; i < pixeles; i += 1) {
      const diferencia = (luma[i] - difuso[i]) * DETALLE_CANTIDAD;
      if (diferencia === 0) continue;
      const p = i * 4;
      data[p] += diferencia;
      data[p + 1] += diferencia;
      data[p + 2] += diferencia;
    }
    context.putImageData(imagen, 0, 0);
  } catch {
    // Si el navegador no permite leer el canvas, se deja la foto tal cual: el
    // recorte y la compresión ya están aplicados.
  }
}

/**
 * Variante para el análisis con IA: reduce la foto a un lado máximo sin
 * recortar (conserva toda la etiqueta y el encuadre) y la deja en WebP para
 * enviarla al edge function. No sube nada al almacenamiento.
 */
export async function prepareImageParaIA(
  file: File,
  maxLado = 1400,
): Promise<File> {
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
    const scale = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No se pudo preparar la fotografía.");
    context.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) =>
          b
            ? resolve(b)
            : reject(new Error("No se pudo optimizar la fotografía.")),
        "image/webp",
        0.85,
      ),
    );
    return new File([blob], "analisis.webp", {
      type: blob.type || "image/webp",
      lastModified: file.lastModified,
    });
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
