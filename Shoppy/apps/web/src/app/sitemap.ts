import type { MetadataRoute } from "next";
import {
  ARCHIVE_KEY,
  isPublicProduct,
  parseArchive,
} from "@shopy/shared/editorial";
import { publicServerDb } from "../lib/editorial.server";
import { SITE_URL } from "../lib/site";

type Entry = MetadataRoute.Sitemap[number];

/** Rutas fijas indexables del sitio. */
const STATIC_ENTRIES: Entry[] = [
  { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
  { url: `${SITE_URL}/catalogo`, changeFrequency: "daily", priority: 0.9 },
  { url: `${SITE_URL}/coleccion/ofertas`, changeFrequency: "weekly", priority: 0.7 },
  { url: `${SITE_URL}/envios`, changeFrequency: "yearly", priority: 0.3 },
  { url: `${SITE_URL}/devoluciones`, changeFrequency: "yearly", priority: 0.3 },
  { url: `${SITE_URL}/legal/privacidad`, changeFrequency: "yearly", priority: 0.2 },
  { url: `${SITE_URL}/legal/terminos`, changeFrequency: "yearly", priority: 0.2 },
  { url: `${SITE_URL}/legal/cookies`, changeFrequency: "yearly", priority: 0.2 },
];

/**
 * Sitemap resiliente: si Supabase no responde, igual entrega las rutas fijas
 * para no romper la indexación del sitio.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = process.env;
  if (!NEXT_PUBLIC_SUPABASE_URL || !NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return STATIC_ENTRIES;
  }

  try {
    const db = publicServerDb();
    const [products, collections, archiveSection] = await Promise.all([
      db
        .from("products")
        .select("id,slug,published_at,metadata,availability")
        .not("published_at", "is", null)
        .neq("availability", "ARCHIVED"),
      db.from("collections").select("slug").eq("is_active", true),
      db
        .from("home_sections")
        .select("config")
        .eq("key", ARCHIVE_KEY)
        .eq("is_active", true)
        .maybeSingle(),
    ]);

    const dynamic: Entry[] = [];

    for (const row of (products.data ?? []) as {
      id: string;
      slug: string;
      published_at: string | null;
      metadata: Record<string, unknown> | null;
    }[]) {
      if (!isPublicProduct(row)) continue;
      dynamic.push({
        url: `${SITE_URL}/producto/${row.slug}`,
        lastModified: row.published_at ?? undefined,
        changeFrequency: "weekly",
        priority: 0.8,
      });
    }

    for (const row of (collections.data ?? []) as { slug: string }[]) {
      dynamic.push({
        url: `${SITE_URL}/coleccion/${row.slug}`,
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }

    const archive = parseArchive(
      (archiveSection.data as { config: unknown } | null)?.config,
    );
    for (const entry of archive.items) {
      if (!entry.visible) continue;
      dynamic.push({
        url: `${SITE_URL}/catalogo/archivo/${entry.slug}`,
        lastModified: entry.publishedAt ?? undefined,
        changeFrequency: "monthly",
        priority: 0.5,
      });
    }

    // Deduplica por URL (p. ej. /coleccion/ofertas puede venir de la tabla).
    const seen = new Set(STATIC_ENTRIES.map((entry) => entry.url));
    const extras = dynamic.filter((entry) => {
      if (seen.has(entry.url)) return false;
      seen.add(entry.url);
      return true;
    });

    return [...STATIC_ENTRIES, ...extras];
  } catch {
    return STATIC_ENTRIES;
  }
}
