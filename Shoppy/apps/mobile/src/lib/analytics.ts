/**
 * Eventos de analytics propios (Fase 4: solo product_view; el resto en Fase 5/6).
 * Inserción anónima permitida por RLS. No-op sin backend o ante error.
 */
import { getSupabase, isSupabaseConfigured } from "./supabase";

const seen = new Set<string>();

export function trackProductView(productId: string): void {
  if (!isSupabaseConfigured) return;
  // Una vez por producto y sesión de app: evita ráfagas en remontajes.
  if (seen.has(productId)) return;
  seen.add(productId);
  getSupabase()
    .from("analytics_events")
    .insert({ event_type: "product_view", product_id: productId })
    .then(({ error }) => {
      if (error) console.warn("analytics product_view falló:", error.message);
    });
}
