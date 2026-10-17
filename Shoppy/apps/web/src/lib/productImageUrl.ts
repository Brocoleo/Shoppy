/** URL pública de un path del bucket product-images. `?v=` invalida caché tras regenerar. */
const STORAGE_IMG_VERSION = "v=3";

export function publicImageUrl(storagePath: string): string {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  return `${base}/storage/v1/object/public/product-images/${storagePath}?${STORAGE_IMG_VERSION}`;
}
