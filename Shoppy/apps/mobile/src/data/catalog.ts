/**
 * Catálogo mock (Fase 3): espejo 1:1 del seed SQL para que la UI se
 * desarrolle con datos realistas. En Fase 4 lo reemplaza Supabase
 * mapeando filas DB -> CatalogProduct (misma forma, cambio interno).
 */
import type { ProductCondition } from "@shopy/types";

export interface RemoteImage {
  url: string;
  isDefect: boolean;
}

export interface CatalogProduct {
  id: string;
  slug: string;
  name: string;
  description: string;
  brand: string;
  brandSlug: string;
  categorySlug: string;
  subcategorySlug: string | null;
  segment: string | null;
  priceClp: number;
  compareAtPriceClp: number | null;
  condition: ProductCondition;
  size: string;
  color: string;
  stock: number;
  publishedAt: string;
  tags: string[];
  viewCount: number;
  favoriteCount: number;
  trendingScore: number;
  isFeatured: boolean;
  /** Presente en modo Supabase (URLs de Storage); ausente en mock local. */
  remoteImages?: RemoteImage[];
}

export interface CatalogCategory {
  slug: string;
  name: string;
  parentSlug: string | null;
}

export interface CatalogCollection {
  slug: string;
  name: string;
  productIds: string[];
}

interface SeedRow extends Omit<CatalogProduct, "brand" | "brandSlug" | "publishedAt" | "trendingScore"> {
  brandSlug: string;
  daysAgo: number;
  trendingScore: number;
}

const BRANDS: Record<string, string> = {
  levis: "Levi's",
  nike: "Nike",
  wrangler: "Wrangler",
  adidas: "Adidas",
  zara: "Zara",
  hm: "H&M",
  mango: "Mango",
  lacoste: "Lacoste",
  puma: "Puma",
  tommy: "Tommy Hilfiger",
  gap: "Gap",
  vintage: "Vintage / Sin marca",
};

const DAY = 86_400_000;
const NOW = Date.now();

const ROWS: SeedRow[] = [
  { id: "d0000000-0000-4000-8000-000000000001", slug: "chaqueta-trucker-levis", name: "Chaqueta trucker Levi's", description: "Chaqueta de denim clásica, sin desgastes. Cierre y botones originales.", brandSlug: "levis", categorySlug: "mujer", subcategorySlug: "chaquetas", segment: "mujer", priceClp: 34990, compareAtPriceClp: 44990, condition: "como_nuevo", size: "M", color: "Azul denim", stock: 1, tags: ["denim", "chaqueta", "otoño"], viewCount: 210, favoriteCount: 34, isFeatured: true, daysAgo: 20, trendingScore: 27.4 },
  { id: "d0000000-0000-4000-8000-000000000002", slug: "polera-nike-dryfit", name: "Polera Nike Dry-Fit", description: "Polera deportiva con tecnología de secado rápido. Estampado intacto.", brandSlug: "nike", categorySlug: "hombre", subcategorySlug: "poleras-hombre", segment: "hombre", priceClp: 12990, compareAtPriceClp: null, condition: "excelente", size: "L", color: "Negro", stock: 1, tags: ["deporte", "polera"], viewCount: 120, favoriteCount: 12, isFeatured: false, daysAgo: 18, trendingScore: 8.1 },
  { id: "d0000000-0000-4000-8000-000000000003", slug: "jeans-wrangler-rectos", name: "Jeans Wrangler rectos", description: "Jeans corte recto tiro medio. Pretina y basta en buen estado.", brandSlug: "wrangler", categorySlug: "hombre", subcategorySlug: "jeans-hombre", segment: "hombre", priceClp: 14990, compareAtPriceClp: null, condition: "bueno", size: "32", color: "Azul oscuro", stock: 1, tags: ["denim", "jeans"], viewCount: 88, favoriteCount: 7, isFeatured: false, daysAgo: 16, trendingScore: 5.4 },
  { id: "d0000000-0000-4000-8000-000000000004", slug: "sweater-lana-vintage", name: "Sweater de lana vintage", description: "Sweater tejido a mano años 90. Pequeño zurcido visible en el puño (ver foto detalle).", brandSlug: "vintage", categorySlug: "mujer", subcategorySlug: null, segment: "mujer", priceClp: 9990, compareAtPriceClp: null, condition: "con_detalles", size: "S", color: "Mostaza", stock: 1, tags: ["vintage", "lana", "invierno"], viewCount: 64, favoriteCount: 9, isFeatured: false, daysAgo: 15, trendingScore: 6.2 },
  { id: "d0000000-0000-4000-8000-000000000005", slug: "poleron-adidas-capucha", name: "Polerón Adidas con capucha", description: "Polerón con chiporro interior, puños firmes y cordones originales.", brandSlug: "adidas", categorySlug: "hombre", subcategorySlug: "polerones", segment: "hombre", priceClp: 19990, compareAtPriceClp: null, condition: "excelente", size: "M", color: "Gris", stock: 1, tags: ["poleron", "invierno"], viewCount: 175, favoriteCount: 28, isFeatured: true, daysAgo: 14, trendingScore: 21.7 },
  { id: "d0000000-0000-4000-8000-000000000006", slug: "vestido-zara-midi", name: "Vestido Zara midi", description: "Vestido midi con abertura lateral. Usado una vez, como nuevo.", brandSlug: "zara", categorySlug: "mujer", subcategorySlug: "vestidos", segment: "mujer", priceClp: 17990, compareAtPriceClp: 24990, condition: "como_nuevo", size: "S", color: "Negro", stock: 1, tags: ["vestido", "fiesta"], viewCount: 190, favoriteCount: 31, isFeatured: true, daysAgo: 12, trendingScore: 24.9 },
  { id: "d0000000-0000-4000-8000-000000000007", slug: "camisa-mango-lino", name: "Camisa Mango de lino", description: "Camisa oversize de lino, ideal para verano. Sin manchas.", brandSlug: "mango", categorySlug: "mujer", subcategorySlug: null, segment: "mujer", priceClp: 13990, compareAtPriceClp: null, condition: "excelente", size: "M", color: "Blanco", stock: 1, tags: ["lino", "verano"], viewCount: 72, favoriteCount: 6, isFeatured: false, daysAgo: 11, trendingScore: 4.8 },
  { id: "d0000000-0000-4000-8000-000000000008", slug: "jeans-levis-501", name: "Jeans Levi's 501", description: "El clásico 501 corte recto. Desgaste parejo propio del uso, sin roturas.", brandSlug: "levis", categorySlug: "mujer", subcategorySlug: "jeans-mujer", segment: "mujer", priceClp: 18990, compareAtPriceClp: null, condition: "bueno", size: "28", color: "Celeste", stock: 1, tags: ["denim", "jeans", "clasico"], viewCount: 143, favoriteCount: 19, isFeatured: false, daysAgo: 10, trendingScore: 12.3 },
  { id: "d0000000-0000-4000-8000-000000000009", slug: "cartera-cuero-genuino", name: "Cartera de cuero genuino", description: "Cartera bandolera de cuero, forro interior impecable y correa regulable.", brandSlug: "vintage", categorySlug: "accesorios", subcategorySlug: "carteras", segment: "unisex", priceClp: 24990, compareAtPriceClp: null, condition: "excelente", size: "Única", color: "Café", stock: 1, tags: ["cuero", "cartera"], viewCount: 158, favoriteCount: 25, isFeatured: true, daysAgo: 9, trendingScore: 18.6 },
  { id: "d0000000-0000-4000-8000-000000000010", slug: "cinturon-cuero-trenzado", name: "Cinturón de cuero trenzado", description: "Cinturón trenzado elástico con hebilla metálica.", brandSlug: "vintage", categorySlug: "accesorios", subcategorySlug: "cinturones", segment: "unisex", priceClp: 6990, compareAtPriceClp: null, condition: "bueno", size: "M", color: "Negro", stock: 1, tags: ["cuero", "cinturon"], viewCount: 41, favoriteCount: 3, isFeatured: false, daysAgo: 9, trendingScore: 2.8 },
  { id: "d0000000-0000-4000-8000-000000000011", slug: "vestido-hm-floral", name: "Vestido H&M floral", description: "Vestido corto con estampado floral, espalda con elástico en buen estado.", brandSlug: "hm", categorySlug: "mujer", subcategorySlug: "vestidos", segment: "mujer", priceClp: 8990, compareAtPriceClp: null, condition: "bueno", size: "XS", color: "Floreado", stock: 1, tags: ["vestido", "verano"], viewCount: 55, favoriteCount: 5, isFeatured: false, daysAgo: 8, trendingScore: 3.9 },
  { id: "d0000000-0000-4000-8000-000000000012", slug: "parka-gap-impermeable", name: "Parka Gap impermeable", description: "Parka con relleno térmico y capucha desmontable. Cierres perfectos.", brandSlug: "gap", categorySlug: "hombre", subcategorySlug: null, segment: "hombre", priceClp: 29990, compareAtPriceClp: 39990, condition: "excelente", size: "L", color: "Azul marino", stock: 1, tags: ["parka", "invierno"], viewCount: 132, favoriteCount: 17, isFeatured: false, daysAgo: 7, trendingScore: 11.2 },
  { id: "d0000000-0000-4000-8000-000000000013", slug: "blazer-zara-sastrero", name: "Blazer Zara sastrero", description: "Blazer entallado con forro completo. Solapas y botones originales.", brandSlug: "zara", categorySlug: "mujer", subcategorySlug: "chaquetas", segment: "mujer", priceClp: 22990, compareAtPriceClp: null, condition: "como_nuevo", size: "M", color: "Beige", stock: 1, tags: ["blazer", "oficina"], viewCount: 96, favoriteCount: 14, isFeatured: false, daysAgo: 5, trendingScore: 9.4 },
  { id: "d0000000-0000-4000-8000-000000000014", slug: "falda-denim-vintage", name: "Falda de denim vintage", description: "Falda midi de denim rígido. Botones con pátina y ruedo con leve desgaste (ver foto).", brandSlug: "vintage", categorySlug: "mujer", subcategorySlug: null, segment: "mujer", priceClp: 7990, compareAtPriceClp: null, condition: "con_detalles", size: "S", color: "Azul medio", stock: 1, tags: ["vintage", "denim", "falda"], viewCount: 48, favoriteCount: 4, isFeatured: false, daysAgo: 5, trendingScore: 3.1 },
  { id: "d0000000-0000-4000-8000-000000000015", slug: "panuelo-seda-estampado", name: "Pañuelo de seda estampado", description: "Pañuelos de seda con estampado geométrico. Stock de 3 unidades iguales.", brandSlug: "vintage", categorySlug: "accesorios", subcategorySlug: "panuelos", segment: "unisex", priceClp: 4990, compareAtPriceClp: null, condition: "excelente", size: "Única", color: "Multicolor", stock: 3, tags: ["seda", "panuelo"], viewCount: 37, favoriteCount: 2, isFeatured: false, daysAgo: 4, trendingScore: 2.2 },
  { id: "d0000000-0000-4000-8000-000000000016", slug: "polera-puma-esencial", name: "Polera Puma esencial", description: "Polera básica de algodón con logo bordado. Cuello firme.", brandSlug: "puma", categorySlug: "hombre", subcategorySlug: "poleras-hombre", segment: "hombre", priceClp: 7990, compareAtPriceClp: null, condition: "bueno", size: "XL", color: "Blanco", stock: 1, tags: ["polera", "basico"], viewCount: 44, favoriteCount: 3, isFeatured: false, daysAgo: 4, trendingScore: 2.6 },
  { id: "d0000000-0000-4000-8000-000000000017", slug: "camisa-lacoste-oxford", name: "Camisa Lacoste oxford", description: "Camisa oxford con logo bordado, planchado impecable y puños firmes.", brandSlug: "lacoste", categorySlug: "hombre", subcategorySlug: "camisas", segment: "hombre", priceClp: 21990, compareAtPriceClp: null, condition: "excelente", size: "M", color: "Celeste", stock: 1, tags: ["camisa", "oficina"], viewCount: 81, favoriteCount: 11, isFeatured: false, daysAgo: 3, trendingScore: 7.7 },
  { id: "d0000000-0000-4000-8000-000000000018", slug: "chaqueta-cuero-vintage", name: "Chaqueta de cuero vintage", description: "Chaqueta de cuero genuino años 80. Forro con pequeña reparación (ver foto detalle).", brandSlug: "vintage", categorySlug: "mujer", subcategorySlug: "chaquetas", segment: "mujer", priceClp: 39990, compareAtPriceClp: null, condition: "con_detalles", size: "M", color: "Negro", stock: 1, tags: ["cuero", "vintage", "chaqueta"], viewCount: 167, favoriteCount: 29, isFeatured: true, daysAgo: 2, trendingScore: 23.1 },
  { id: "d0000000-0000-4000-8000-000000000019", slug: "shorts-jean-levis", name: "Shorts de jean Levi's", description: "Shorts tiro alto con basta desflecada de fábrica.", brandSlug: "levis", categorySlug: "mujer", subcategorySlug: "jeans-mujer", segment: "mujer", priceClp: 10990, compareAtPriceClp: null, condition: "bueno", size: "S", color: "Celeste", stock: 1, tags: ["denim", "verano", "shorts"], viewCount: 59, favoriteCount: 8, isFeatured: false, daysAgo: 1, trendingScore: 5.9 },
  { id: "d0000000-0000-4000-8000-000000000020", slug: "chaleco-tommy-hilfiger", name: "Chaleco Tommy Hilfiger", description: "Chaleco de punto con cuello en V. Sin motas, elástico firme.", brandSlug: "tommy", categorySlug: "hombre", subcategorySlug: null, segment: "hombre", priceClp: 16990, compareAtPriceClp: 22990, condition: "como_nuevo", size: "L", color: "Burdeo", stock: 1, tags: ["chaleco", "otono"], viewCount: 73, favoriteCount: 13, isFeatured: false, daysAgo: 0, trendingScore: 10.6 },
];

export const PRODUCTS: CatalogProduct[] = ROWS.map((r) => ({
  ...r,
  brand: BRANDS[r.brandSlug] ?? r.brandSlug,
  publishedAt: new Date(NOW - r.daysAgo * DAY).toISOString(),
}));

export const PRODUCT_MAP: Record<string, CatalogProduct> = Object.fromEntries(
  PRODUCTS.map((p) => [p.id, p]),
);

export const CATEGORIES: CatalogCategory[] = [
  { slug: "mujer", name: "Mujer", parentSlug: null },
  { slug: "hombre", name: "Hombre", parentSlug: null },
  { slug: "accesorios", name: "Accesorios", parentSlug: null },
  { slug: "ofertas", name: "Ofertas", parentSlug: null },
  { slug: "novedades", name: "Novedades", parentSlug: null },
  { slug: "vestidos", name: "Vestidos", parentSlug: "mujer" },
  { slug: "chaquetas", name: "Chaquetas", parentSlug: "mujer" },
  { slug: "jeans-mujer", name: "Jeans", parentSlug: "mujer" },
  { slug: "polerones", name: "Polerones", parentSlug: "hombre" },
  { slug: "camisas", name: "Camisas", parentSlug: "hombre" },
  { slug: "jeans-hombre", name: "Jeans", parentSlug: "hombre" },
  { slug: "poleras-hombre", name: "Poleras", parentSlug: "hombre" },
  { slug: "carteras", name: "Carteras", parentSlug: "accesorios" },
  { slug: "cinturones", name: "Cinturones", parentSlug: "accesorios" },
  { slug: "panuelos", name: "Pañuelos", parentSlug: "accesorios" },
];

export const BRAND_LIST = Object.entries(BRANDS).map(([slug, name]) => ({ slug, name }));

export const COLLECTIONS: CatalogCollection[] = [
  {
    slug: "ofertas",
    name: "Ofertas",
    productIds: [
      "d0000000-0000-4000-8000-000000000001",
      "d0000000-0000-4000-8000-000000000006",
      "d0000000-0000-4000-8000-000000000012",
      "d0000000-0000-4000-8000-000000000020",
    ],
  },
  {
    slug: "novedades",
    name: "Novedades",
    productIds: [
      "d0000000-0000-4000-8000-000000000020",
      "d0000000-0000-4000-8000-000000000019",
      "d0000000-0000-4000-8000-000000000018",
      "d0000000-0000-4000-8000-000000000017",
    ],
  },
];

export interface MockOrder {
  id: string;
  orderNumber: string;
  status: "SHIPPED" | "DELIVERED" | "PREPARING" | "PAID";
  subtotalClp: number;
  shippingClp: number;
  totalClp: number;
  createdAt: string;
  carrier: string | null;
  trackingNumber: string | null;
  items: { productId: string; qty: number; unitPriceClp: number }[];
  history: { status: string; at: string }[];
}

export const MOCK_ORDERS: MockOrder[] = [
  {
    id: "o0000000-0000-4000-8000-000000000001",
    orderNumber: "SHO-8F3K2QXA",
    status: "SHIPPED",
    subtotalClp: 34990,
    shippingClp: 3990,
    totalClp: 38980,
    createdAt: new Date(NOW - 3 * DAY).toISOString(),
    carrier: "Chilexpress",
    trackingNumber: "987654321",
    items: [{ productId: "d0000000-0000-4000-8000-000000000001", qty: 1, unitPriceClp: 34990 }],
    history: [
      { status: "PENDING_PAYMENT", at: new Date(NOW - 3 * DAY).toISOString() },
      { status: "PAID", at: new Date(NOW - 3 * DAY + 3_600_000).toISOString() },
      { status: "PREPARING", at: new Date(NOW - 2 * DAY).toISOString() },
      { status: "SHIPPED", at: new Date(NOW - 1 * DAY).toISOString() },
    ],
  },
  {
    id: "o0000000-0000-4000-8000-000000000002",
    orderNumber: "SHO-2B7M9PQT",
    status: "DELIVERED",
    subtotalClp: 27980,
    shippingClp: 2990,
    totalClp: 30970,
    createdAt: new Date(NOW - 12 * DAY).toISOString(),
    carrier: "Starken",
    trackingNumber: "123456789",
    items: [
      { productId: "d0000000-0000-4000-8000-000000000006", qty: 1, unitPriceClp: 17990 },
      { productId: "d0000000-0000-4000-8000-000000000011", qty: 1, unitPriceClp: 8990 },
    ],
    history: [
      { status: "PENDING_PAYMENT", at: new Date(NOW - 12 * DAY).toISOString() },
      { status: "PAID", at: new Date(NOW - 12 * DAY + 3_600_000).toISOString() },
      { status: "PREPARING", at: new Date(NOW - 11 * DAY).toISOString() },
      { status: "SHIPPED", at: new Date(NOW - 10 * DAY).toISOString() },
      { status: "DELIVERED", at: new Date(NOW - 8 * DAY).toISOString() },
    ],
  },
];
