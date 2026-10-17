import { isPublicProduct } from "@shopy/shared/editorial";
import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";

/**
 * Título específico por prenda para crawlers y pestañas.
 * Solo metadatos: los datos visibles los sigue cargando la página cliente.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return { title: "Prenda" };
    const db = createClient(url, key, { auth: { persistSession: false } });
    const { data } = await db
      .from("products")
      .select("id,metadata,name,brand:brands(name)")
      .eq("slug", slug)
      .maybeSingle();
    const row = data as unknown as {
      id: string;
      metadata: Record<string, unknown>;
      name: string;
      brand: { name: string } | null;
    } | null;
    if (!row || !isPublicProduct(row)) return { title: "Prenda no disponible" };
    const brand = row.brand?.name;
    const suffix =
      brand && !row.name.toLowerCase().includes(brand.toLowerCase())
        ? ` · ${brand}`
        : "";
    return { title: `${row.name}${suffix}` };
  } catch {
    return { title: "Prenda" };
  }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
