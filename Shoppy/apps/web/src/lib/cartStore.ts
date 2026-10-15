/**
 * Lógica pura del carrito (sin React ni localStorage): fusión guest/usuario,
 * saneo de datos persistidos y operaciones sobre líneas. Testeable en Node.
 */
export interface CartLine {
  productId: string;
  qty: number;
}

const MAX_QTY = 99;

/** Filtra entradas inválidas de un valor persistido (JSON corrupto, tipos malos, qty<=0). */
export function sanitizeLines(value: unknown): CartLine[] {
  if (!Array.isArray(value)) return [];
  const out: CartLine[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const { productId, qty } = item as { productId?: unknown; qty?: unknown };
    if (typeof productId !== "string" || productId.length === 0) continue;
    if (typeof qty !== "number" || !Number.isInteger(qty) || qty <= 0) continue;
    out.push({ productId, qty: Math.min(MAX_QTY, qty) });
  }
  return out;
}

/**
 * Fusión al iniciar sesión: unión sin duplicados, cantidad máxima por prenda.
 * No muta las entradas.
 */
export function mergeCarts(mine: CartLine[], guest: CartLine[]): CartLine[] {
  const merged = new Map<string, number>();
  for (const l of mine) merged.set(l.productId, l.qty);
  for (const l of guest) merged.set(l.productId, Math.max(merged.get(l.productId) ?? 0, l.qty));
  return [...merged.entries()].map(([productId, qty]) => ({ productId, qty }));
}

/** Agrega qty (tope 99); sin mutación. */
export function addLine(lines: CartLine[], productId: string, qty = 1): CartLine[] {
  const found = lines.find((l) => l.productId === productId);
  if (found) {
    return lines.map((l) =>
      l.productId === productId ? { ...l, qty: Math.min(MAX_QTY, l.qty + qty) } : l,
    );
  }
  return [...lines, { productId, qty: Math.min(MAX_QTY, Math.max(1, qty)) }];
}

/** Fija cantidad (tope 99); qty<=0 elimina la línea. Sin mutación. */
export function setLineQty(lines: CartLine[], productId: string, qty: number): CartLine[] {
  if (qty <= 0) return lines.filter((l) => l.productId !== productId);
  return lines.map((l) =>
    l.productId === productId ? { ...l, qty: Math.min(MAX_QTY, qty) } : l,
  );
}
