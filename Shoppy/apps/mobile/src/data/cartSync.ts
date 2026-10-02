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

async function serverCartId(userId: string): Promise<string> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("carts")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (data) return (data as { id: string }).id;
  const { data: created, error: insertError } = await supabase
    .from("carts")
    .insert({ user_id: userId })
    .select("id")
    .single();
  if (insertError) throw insertError;
  return (created as { id: string }).id;
}

/** Lee el carrito servidor como líneas {productId, qty}. */
export async function pullServerCart(userId: string): Promise<CartLine[]> {
  const supabase = getSupabase();
  const cartId = await serverCartId(userId);
  const { data, error } = await supabase
    .from("cart_items")
    .select("product_id,qty")
    .eq("cart_id", cartId);
  if (error) throw error;
  return ((data ?? []) as { product_id: string; qty: number }[]).map((r) => ({
    productId: r.product_id,
    qty: r.qty,
  }));
}

/** Escribe líneas al servidor (snapshot con precio vigente de backend). */
export async function pushCartToServer(userId: string, lines: CartLine[]): Promise<void> {
  const supabase = getSupabase();
  const cartId = await serverCartId(userId);
  const wanted = new Map(lines.map((l) => [l.productId, l.qty]));

  if (wanted.size > 0) {
    const prices = await fetchPriceMap([...wanted.keys()]);
    const rows = [...wanted.entries()]
      .map(([productId, qty]) => {
        const price = prices.get(productId);
        return price === undefined
          ? null
          : { cart_id: cartId, product_id: productId, qty, unit_price_clp: price };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (rows.length > 0) {
      const { error } = await supabase
        .from("cart_items")
        .upsert(rows, { onConflict: "cart_id,product_id" });
      if (error) throw error;
    }
  }
  // Borra lo que ya no está en el carrito local.
  const { data: current, error: listError } = await supabase
    .from("cart_items")
    .select("product_id")
    .eq("cart_id", cartId);
  if (listError) throw listError;
  const stale = ((current ?? []) as { product_id: string }[])
    .map((r) => r.product_id)
    .filter((id) => !wanted.has(id));
  if (stale.length > 0) {
    const { error } = await supabase
      .from("cart_items")
      .delete()
      .eq("cart_id", cartId)
      .in("product_id", stale);
    if (error) throw error;
  }
}

/** Fusiona invitado→cuenta (suma cantidades, tope 99) y retorna el resultado. */
export async function mergeLocalToServer(
  userId: string,
  local: CartLine[],
): Promise<CartLine[]> {
  const server = await pullServerCart(userId);
  const merged = new Map<string, number>();
  for (const l of [...server, ...local]) {
    merged.set(l.productId, Math.min(99, (merged.get(l.productId) ?? 0) + l.qty));
  }
  return [...merged.entries()].map(([productId, qty]) => ({ productId, qty }));
}

async function fetchPriceMap(ids: string[]): Promise<Map<string, number>> {
  const { data, error } = await getSupabase()
    .from("products")
    .select("id,price_clp")
    .in("id", ids);
  if (error) throw error;
  return new Map(((data ?? []) as { id: string; price_clp: number }[]).map((r) => [r.id, r.price_clp]));
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
