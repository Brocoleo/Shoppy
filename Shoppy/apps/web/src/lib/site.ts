/**
 * URL pública canónica del sitio.
 *
 * Se usa para `metadataBase`, canónicas, Open Graph, JSON-LD y sitemap.
 * En Vercel se puede fijar `NEXT_PUBLIC_SITE_URL` a un dominio propio; si no,
 * se asume el despliegue conocido para que las URLs nunca salgan relativas.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://shopy-web-six.vercel.app"
).replace(/\/+$/, "");

/** Convierte una ruta interna en URL absoluta (idempotente). */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
