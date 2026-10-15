"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSession } from "./session";
import { addLine, mergeCarts, sanitizeLines, setLineQty, type CartLine } from "./cartStore";

export type { CartLine };

interface CartState {
  lines: CartLine[];
  count: number;
  ready: boolean;
  add: (productId: string, qty?: number) => void;
  setQty: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
}

const Ctx = createContext<CartState>({
  lines: [], count: 0, ready: false,
  add: () => {}, setQty: () => {}, remove: () => {}, clear: () => {},
});

export function useCart(): CartState {
  return useContext(Ctx);
}

const EMPTY_LINES: CartLine[] = [];

const keyFor = (owner: string) => `shopy-cart-${owner}`;

function readStored(owner: string): { lines?: CartLine[]; readable: boolean } {
  let raw: string | null;
  try {
    raw = localStorage.getItem(keyFor(owner));
  } catch {
    return { readable: false };
  }
  if (raw === null) return { readable: true };
  try {
    return { lines: sanitizeLines(JSON.parse(raw)), readable: true };
  } catch {
    return { lines: [], readable: true };
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useSession();
  const owner = user?.id ?? "guest";
  const memory = useRef(new Map<string, CartLine[]>());
  // Server and first browser render agree; storage is read only after mount.
  const [cart, setCart] = useState<{ owner: string | null; lines: CartLine[]; canPersist: boolean }>({ owner: null, lines: [], canPersist: false });
  const ready = !loading && cart.owner === owner;
  const lines = ready ? cart.lines : EMPTY_LINES;

  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const saved = readStored(owner);
      const savedGuest = owner === "guest" ? saved : readStored("guest");
      const mine = saved.lines ?? memory.current.get(owner) ?? [];
      const guest = savedGuest.lines ?? memory.current.get("guest") ?? [];
      const next = owner === "guest" ? mine : mergeCarts(mine, guest);
      if (owner !== "guest" && saved.readable) {
        // Remove the guest cart only after its destination was saved successfully.
        try {
          localStorage.setItem(keyFor(owner), JSON.stringify(next));
          if (savedGuest.readable) {
            localStorage.removeItem(keyFor("guest"));
            memory.current.delete("guest");
          }
        } catch {
          // Preserve the source when storage is unavailable; keep working in memory.
        }
      }
      setCart({ owner, lines: next, canPersist: saved.readable });
    });
    return () => { cancelled = true; };
  }, [owner, loading]);

  useEffect(() => {
    if (!ready) return;
    memory.current.set(owner, cart.lines);
    // Never overwrite data that could not be read, even if writing still works.
    if (!cart.canPersist) return;
    try {
      localStorage.setItem(keyFor(owner), JSON.stringify(cart.lines));
    } catch {
      // The current owner's cart remains usable in memory.
    }
  }, [cart, owner, ready]);

  const update = useCallback((change: (current: CartLine[]) => CartLine[]) => {
    setCart((current) => current.owner === owner && !loading
      ? { ...current, lines: change(current.lines) }
      : current);
  }, [owner, loading]);
  const add = useCallback((productId: string, qty = 1) => update((current) => addLine(current, productId, qty)), [update]);
  const setQty = useCallback((productId: string, qty: number) => update((current) => setLineQty(current, productId, qty)), [update]);
  const remove = useCallback((productId: string) => update((current) => current.filter((line) => line.productId !== productId)), [update]);
  const clear = useCallback(() => update(() => []), [update]);
  const value = useMemo<CartState>(() => ({ lines, count: lines.reduce((n, line) => n + line.qty, 0), ready, add, setQty, remove, clear }), [lines, ready, add, setQty, remove, clear]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
