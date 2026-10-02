/**
 * Imágenes de producto unificadas: Storage remoto (Supabase) o
 * placeholders locales (mock). Los componentes solo usan estos helpers.
 */
import type { ImageSource } from "expo-image";
import type { CatalogProduct } from "./catalog";
import { PRODUCT_IMAGES } from "./productImages";

export function productCover(product: CatalogProduct): ImageSource | undefined {
  const remote = product.remoteImages?.[0];
  if (remote) return { uri: remote.url };
  return PRODUCT_IMAGES[product.slug]?.cover;
}

export function productGallery(product: CatalogProduct): {
  source: ImageSource;
  isDefect: boolean;
}[] {
  if (product.remoteImages && product.remoteImages.length > 0) {
    return product.remoteImages.map((i) => ({ source: { uri: i.url }, isDefect: i.isDefect }));
  }
  const local = PRODUCT_IMAGES[product.slug];
  if (!local) return [];
  return local.gallery.map((source, index) => ({
    source,
    isDefect: local.defectIndexes.includes(index),
  }));
}
