import "server-only";
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  ARCHIVE_KEY,
  parseArchive,
  parseHero,
  isPublicProduct,
} from "@shopy/shared/editorial";
import {
  PRODUCT_COLUMNS,
  mapProduct,
  type DbProductRow,
} from "./catalogProduct";
import { publicImageUrl } from "./productImageUrl";
export function publicServerDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Backend no configurado");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          cache: "no-store",
          signal: AbortSignal.timeout(2500),
        }),
    },
  });
}
export const initialEditorial = cache(async function initialEditorial() {
  const { data, error } = await publicServerDb()
    .from("home_sections")
    .select("key,config")
    .in("key", ["hero", ARCHIVE_KEY])
    .eq("is_active", true);
  if (error) throw error;
  return {
    hero: parseHero(data?.find((r) => r.key === "hero")?.config),
    archive: parseArchive(
      data?.find((r) => r.key === ARCHIVE_KEY)?.config,
    ).items.filter((i) => i.visible),
  };
});
export async function initialProducts() {
  const { data, error } = await publicServerDb()
    .from("products")
    .select(PRODUCT_COLUMNS)
    .not("published_at", "is", null)
    .neq("availability", "ARCHIVED")
    .order("published_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as DbProductRow[])
    .filter(isPublicProduct)
    .map((r) => mapProduct(r, new Map(), publicImageUrl));
}
