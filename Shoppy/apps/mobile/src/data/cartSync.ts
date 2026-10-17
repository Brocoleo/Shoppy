/**
 * Carrito servidor + revalidación (Fase 5).
 * - Autenticados: el servidor es la fuente; local hace write-through con debounce.
 * - Invitados: 100% local (persistido). Al login se fusiona (suma, tope 99).
 * - Precios/stock/disponibilidad SIEMPRE se revalidan contra backend
 *   antes de mostrar totales finales y de pagar (Fase 6).
 */
import { getSupabase, isSupabaseConfigured } from "../lib/supabase";
import type { CartLine } from "../stores/useShopStore";

export type LineStatus = "ok" | "unavailable" | "out_of_stock" | "adjusted";

export interface ValidatedLine {
  productId: string;
  qty: number;
  unitPriceClp: number;
  stock: number;
  status: LineStatus;
}

export interface CartValidation {
  lines: ValidatedLine[];
  subtotalClp: number;
  hasIssues: boolean;
}

/** La identidad proviene de auth.uid() en SQL, nunca del parámetro del cliente. */
export async function syncMyCart(owner: string, lines?: CartLine[], mergeId?: string, base?: CartLine[]): Promise<CartLine[]> {
  const { data, error } = await getSupabase().auth.getSession();
  if (error || data.session?.user.id !== owner) throw new Error("La sesión cambió durante la sincronización.");
  // Capturar el JWT evita escribir una instantánea antigua con una cuenta nueva.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
  const response = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/rest/v1/rpc/sync_my_cart`, {
    method: "POST",
    signal: controller.signal,
    headers: { "Content-Type": "application/json", apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "", Authorization: `Bearer ${data.session.access_token}` },
    body: JSON.stringify({ p_items: lines ?? null, p_merge_id: mergeId ?? null, p_base: base ?? null }),
  });
  if (!response.ok) throw new Error("No se pudo sincronizar el carrito.");
  return await response.json() as CartLine[];
  } finally { clearTimeout(timeout); }
}

/**
 * Revalida líneas contra backend: precio vigente, stock y disponibilidad.
 * Lo usa el carrito (avisos) y lo exigirá el checkout (Fase 6).
 */
export async function validateCart(lines: CartLine[]): Promise<CartValidation> {
  if (!isSupabaseConfigured || lines.length === 0) {
    return { lines: [], subtotalClp: 0, hasIssues: false };
  }
  const supabase = getSupabase();
  const ids = lines.map((l) => l.productId);
  const { data, error } = await supabase
    .from("products")
    .select("id,price_clp,stock,availability,published_at")
    .in("id", ids);
  if (error) throw error;
  const rows = new Map(
    ((data ?? []) as {
      id: string;
      price_clp: number;
      stock: number;
      availability: string;
      published_at: string | null;
    }[]).map((r) => [r.id, r]),
  );

  let hasIssues = false;
  const validated: ValidatedLine[] = [];
  for (const line of lines) {
    const row = rows.get(line.productId);
    if (!row || !row.published_at || row.availability === "ARCHIVED" || row.availability === "SOLD") {
      hasIssues = true;
      validated.push({ productId: line.productId, qty: 0, unitPriceClp: 0, stock: 0, status: "unavailable" });
      continue;
    }
    if (row.stock <= 0) {
      hasIssues = true;
      validated.push({ productId: line.productId, qty: 0, unitPriceClp: row.price_clp, stock: 0, status: "out_of_stock" });
      continue;
    }
    if (line.qty > row.stock) {
      hasIssues = true;
      validated.push({ productId: line.productId, qty: row.stock, unitPriceClp: row.price_clp, stock: row.stock, status: "adjusted" });
      continue;
    }
    validated.push({ productId: line.productId, qty: line.qty, unitPriceClp: row.price_clp, stock: row.stock, status: "ok" });
  }
  const subtotalClp = validated.reduce((n, l) => n + l.unitPriceClp * l.qty, 0);
  return { lines: validated, subtotalClp, hasIssues };
}
