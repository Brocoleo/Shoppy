/** Public editorial content: never price, stock or private account data. */
export const INSTAGRAM_URL = "https://www.instagram.com/vinta.zhe/";
export const ARCHIVE_KEY = "vinta-archive";
export interface EditorialImage {
  storagePath: string;
  width: number;
  height: number;
  alt: string;
  position?: "center" | "top" | "bottom";
  fit?: "contain" | "cover";
}
export interface ArchiveEntry {
  id: string;
  slug: string;
  title: string;
  sourceUrl: string;
  publishedAt: string | null;
  visible: boolean;
  images: EditorialImage[];
}
export interface ArchiveConfig {
  version: 1;
  batch: string;
  items: ArchiveEntry[];
}
export interface HeroConfig {
  title: string;
  secondLine: string;
  ctaLabel: string;
  ctaHref: string;
  primary?: EditorialImage;
  secondary?: EditorialImage;
}
export const DEFAULT_HERO: HeroConfig = {
  title: "Prendas únicas,",
  secondLine: "otras historias.",
  ctaLabel: "Explorar prendas",
  ctaHref: "/catalogo",
};
const object = (x: unknown): Record<string, unknown> =>
  x !== null && typeof x === "object" && !Array.isArray(x)
    ? (x as Record<string, unknown>)
    : {};
export function parseEditorialImage(
  value: unknown,
): EditorialImage | undefined {
  const v = object(value);
  if (
    typeof v.storagePath !== "string" ||
    !/^vinta\/(archive|editorial)\/[a-zA-Z0-9/_\-.]+$/.test(v.storagePath) ||
    v.storagePath.includes("..") ||
    typeof v.width !== "number" ||
    v.width <= 0 ||
    typeof v.height !== "number" ||
    v.height <= 0 ||
    typeof v.alt !== "string"
  )
    return undefined;
  return {
    storagePath: v.storagePath,
    width: v.width,
    height: v.height,
    alt: v.alt.slice(0, 300),
    position:
      v.position === "top" || v.position === "bottom" ? v.position : "center",
    fit: v.fit === "cover" ? "cover" : "contain",
  };
}
export function parseArchive(value: unknown): ArchiveConfig {
  const v = object(value),
    seen = new Set<string>();
  const items: ArchiveEntry[] = [];
  for (const raw of Array.isArray(v.items) ? v.items : []) {
    const e = object(raw);
    if (
      typeof e.id !== "string" ||
      !/^[a-zA-Z0-9_-]+$/.test(e.id) ||
      seen.has(e.id) ||
      typeof e.slug !== "string" ||
      !/^[a-z0-9-]+$/.test(e.slug) ||
      typeof e.title !== "string" ||
      typeof e.sourceUrl !== "string" ||
      !/^https:\/\/www\.instagram\.com\/vinta\.zhe\/p\/[a-zA-Z0-9_-]+\/$/.test(
        e.sourceUrl,
      )
    )
      continue;
    const images = (Array.isArray(e.images) ? e.images : [])
      .map(parseEditorialImage)
      .filter((i): i is EditorialImage => Boolean(i));
    if (!images.length) continue;
    seen.add(e.id);
    items.push({
      id: e.id,
      slug: e.slug,
      title: e.title.slice(0, 180),
      sourceUrl: e.sourceUrl,
      publishedAt:
        typeof e.publishedAt === "string" &&
        Number.isFinite(Date.parse(e.publishedAt))
          ? e.publishedAt
          : null,
      visible: e.visible === true,
      images,
    });
  }
  return {
    version: 1,
    batch: typeof v.batch === "string" ? v.batch : "",
    items,
  };
}
export function parseHero(value: unknown): HeroConfig {
  const v = object(value);
  const text = (k: keyof HeroConfig, fallback: string) =>
    typeof v[k] === "string" && v[k].trim()
      ? v[k].trim().slice(0, 150)
      : fallback;
  return {
    title: text("title", DEFAULT_HERO.title),
    secondLine: text("secondLine", DEFAULT_HERO.secondLine),
    ctaLabel: text("ctaLabel", DEFAULT_HERO.ctaLabel),
    ctaHref:
      typeof v.ctaHref === "string" &&
      /^\/(?!\/)[a-zA-Z0-9/?=&%-]*$/.test(v.ctaHref)
        ? v.ctaHref
        : DEFAULT_HERO.ctaHref,
    primary: parseEditorialImage(v.primary),
    secondary: parseEditorialImage(v.secondary),
  };
}
/**
 * Productos visibles en la tienda pública.
 *
 * Oculta únicamente lo marcado de forma explícita como demostración
 * (`metadata.demo`). El inventario real promovido para el piloto permanece
 * público; su ocultamiento anterior dependía de una lista fija de IDs semilla
 * que ya no aplica.
 */
export function isPublicProduct(p: {
  id: string;
  metadata?: Record<string, unknown> | null;
  isDemo?: boolean;
}): boolean {
  return p.metadata?.demo !== true && p.isDemo !== true;
}
