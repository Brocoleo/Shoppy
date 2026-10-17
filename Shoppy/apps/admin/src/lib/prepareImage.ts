/** Use native decoding; unsupported HEIC is reported without pretending to convert it. */
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
    const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No se pudo preparar la fotografía.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
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
