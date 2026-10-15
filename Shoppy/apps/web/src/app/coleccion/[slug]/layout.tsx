import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";

/**
 * Título específico por colección para crawlers y pestañas.
 * Solo metadatos: los datos visibles los sigue cargando la página cliente.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return { title: "Colección" };
    const db = createClient(url, key, { auth: { persistSession: false } });
    const { data } = await db
      .from("collections")
      .select("name")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();
    const row = data as unknown as { name: string } | null;
    if (!row) return { title: "Colección" };
    return { title: `${row.name}` };
  } catch {
    return { title: "Colección" };
  }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
