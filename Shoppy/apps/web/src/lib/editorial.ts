import {
  ARCHIVE_KEY,
  parseArchive,
  parseHero,
  type ArchiveEntry,
} from "@shopy/shared/editorial";
import { getSupabase } from "./supabase";
export async function loadEditorial() {
  const { data, error } = await getSupabase()
    .from("home_sections")
    .select("key,config")
    .in("key", ["hero", ARCHIVE_KEY])
    .eq("is_active", true);
  if (error) throw error;
  const archive = parseArchive(
    data?.find((r) => r.key === ARCHIVE_KEY)?.config,
  );
  return {
    hero: parseHero(data?.find((r) => r.key === "hero")?.config),
    archive: archive.items.filter((i) => i.visible),
  };
}
export const editorialQueryKey = ["web", "editorial"];
export function filterArchive(items: ArchiveEntry[], query: string) {
  const normalize = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  return items
    .filter((i) => normalize(i.title).includes(normalize(query)))
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}
