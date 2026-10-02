/**
 * Mapa estático slug -> placeholders locales (Fase 3, sin backend).
 *
 * Metro SOLO empaqueta require() con string literal inline: por eso cada
 * imagen se declara con su require directo (sin helpers ni variables).
 * Este archivo es el único lugar que referencia assets.
 * En Fase 4 se reemplaza por URLs de Supabase Storage.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- assets estáticos de Metro */
import type { ImageSource } from "expo-image";

export interface ProductGallery {
  cover: ImageSource;
  gallery: ImageSource[];
  /** Índices dentro de `gallery` que muestran defectos/detalles. */
  defectIndexes: number[];
}

function entry(images: ImageSource[], defects: number[] = []): ProductGallery {
  const first = images[0];
  if (first === undefined) throw new Error("gallery vacía");
  return { cover: first, gallery: images, defectIndexes: defects };
}

export const PRODUCT_IMAGES: Record<string, ProductGallery> = {
  "chaqueta-trucker-levis": entry([
    require("../../assets/placeholders/products/chaqueta-trucker-levis/01.png"),
    require("../../assets/placeholders/products/chaqueta-trucker-levis/02.png"),
  ]),
  "polera-nike-dryfit": entry([
    require("../../assets/placeholders/products/polera-nike-dryfit/01.png"),
    require("../../assets/placeholders/products/polera-nike-dryfit/02.png"),
  ]),
  "jeans-wrangler-rectos": entry([
    require("../../assets/placeholders/products/jeans-wrangler-rectos/01.png"),
    require("../../assets/placeholders/products/jeans-wrangler-rectos/02.png"),
  ]),
  "sweater-lana-vintage": entry(
    [
      require("../../assets/placeholders/products/sweater-lana-vintage/01.png"),
      require("../../assets/placeholders/products/sweater-lana-vintage/02.png"),
      require("../../assets/placeholders/products/sweater-lana-vintage/03.png"),
    ],
    [2],
  ),
  "poleron-adidas-capucha": entry([
    require("../../assets/placeholders/products/poleron-adidas-capucha/01.png"),
    require("../../assets/placeholders/products/poleron-adidas-capucha/02.png"),
  ]),
  "vestido-zara-midi": entry([
    require("../../assets/placeholders/products/vestido-zara-midi/01.png"),
    require("../../assets/placeholders/products/vestido-zara-midi/02.png"),
  ]),
  "camisa-mango-lino": entry([
    require("../../assets/placeholders/products/camisa-mango-lino/01.png"),
    require("../../assets/placeholders/products/camisa-mango-lino/02.png"),
  ]),
  "jeans-levis-501": entry([
    require("../../assets/placeholders/products/jeans-levis-501/01.png"),
    require("../../assets/placeholders/products/jeans-levis-501/02.png"),
  ]),
  "cartera-cuero-genuino": entry([
    require("../../assets/placeholders/products/cartera-cuero-genuino/01.png"),
    require("../../assets/placeholders/products/cartera-cuero-genuino/02.png"),
  ]),
  "cinturon-cuero-trenzado": entry([
    require("../../assets/placeholders/products/cinturon-cuero-trenzado/01.png"),
  ]),
  "vestido-hm-floral": entry([
    require("../../assets/placeholders/products/vestido-hm-floral/01.png"),
    require("../../assets/placeholders/products/vestido-hm-floral/02.png"),
  ]),
  "parka-gap-impermeable": entry([
    require("../../assets/placeholders/products/parka-gap-impermeable/01.png"),
    require("../../assets/placeholders/products/parka-gap-impermeable/02.png"),
  ]),
  "blazer-zara-sastrero": entry([
    require("../../assets/placeholders/products/blazer-zara-sastrero/01.png"),
    require("../../assets/placeholders/products/blazer-zara-sastrero/02.png"),
  ]),
  "falda-denim-vintage": entry(
    [
      require("../../assets/placeholders/products/falda-denim-vintage/01.png"),
      require("../../assets/placeholders/products/falda-denim-vintage/02.png"),
      require("../../assets/placeholders/products/falda-denim-vintage/03.png"),
    ],
    [2],
  ),
  "panuelo-seda-estampado": entry([
    require("../../assets/placeholders/products/panuelo-seda-estampado/01.png"),
  ]),
  "polera-puma-esencial": entry([
    require("../../assets/placeholders/products/polera-puma-esencial/01.png"),
  ]),
  "camisa-lacoste-oxford": entry([
    require("../../assets/placeholders/products/camisa-lacoste-oxford/01.png"),
    require("../../assets/placeholders/products/camisa-lacoste-oxford/02.png"),
  ]),
  "chaqueta-cuero-vintage": entry(
    [
      require("../../assets/placeholders/products/chaqueta-cuero-vintage/01.png"),
      require("../../assets/placeholders/products/chaqueta-cuero-vintage/02.png"),
      require("../../assets/placeholders/products/chaqueta-cuero-vintage/03.png"),
    ],
    [2],
  ),
  "shorts-jean-levis": entry([
    require("../../assets/placeholders/products/shorts-jean-levis/01.png"),
    require("../../assets/placeholders/products/shorts-jean-levis/02.png"),
  ]),
  "chaleco-tommy-hilfiger": entry([
    require("../../assets/placeholders/products/chaleco-tommy-hilfiger/01.png"),
    require("../../assets/placeholders/products/chaleco-tommy-hilfiger/02.png"),
  ]),
};
