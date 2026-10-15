import { createClient } from "@supabase/supabase-js";
import HomeContent from "../components/HomeContent";
import { mapProduct, PRODUCT_COLUMNS, type DbProductRow, type CatalogProduct } from "../lib/catalogProduct";
import { publicImageUrl } from "../lib/productImageUrl";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let initialProducts: CatalogProduct[] | undefined;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) {
    try {
      const db = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
      });
      const { data, error } = await db.from("products")
        .select(PRODUCT_COLUMNS)
        .not("published_at", "is", null)
        .neq("availability", "ARCHIVED")
        .order("published_at", { ascending: false })
        .limit(8)
        .abortSignal(AbortSignal.timeout(2500));
      if (!error && data) {
        initialProducts = (data as unknown as DbProductRow[]).map((row) => mapProduct(row, new Map(), publicImageUrl));
      }
    } catch {
      // A failed initial read remains undefined so React Query can retry in the browser.
    }
  }
  return <HomeContent initialProducts={initialProducts} />;
}
