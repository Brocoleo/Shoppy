"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSession } from "./session";

export interface CartLine {
  productId: string;
  qty: number;
}

interface CartState {
  lines: CartLine[];
  count: number;
  add: (productId: string, qty?: number) => void;
  setQty: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
}

const Ctx = createContext<CartState>({
  lines: [],
  count: 0,
  add: () => {},
  setQty: () => {},
  remove: () => {},
  clear: () => {},
});

export function useCart(): CartState {
  return useContext(Ctx);
}

const keyFor = (owner: string) => `shopy-cart-${owner}`;

function readStored(owner: string): CartLine[] {
  try {
    const raw = localStorage.getItem(keyFor(owner));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CartLine[];
    return Array.isArray(parsed) ? parsed.filter((l) => typeof l.productId === "string" && l.qty > 0) : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useSession();
  const owner = user?.id ?? "guest";
  const [lines, setLines] = useState<CartLine[]>([]);

  // Cargar al cambiar de dueño; al loguearse se fusiona el carrito guest (unión, qty máxima).
  useEffect(() => {
    if (loading) return;
    if (owner === "guest") {
      setLines(readStored("guest"));
      return;
    }
    const guest = readStored("guest");
    const mine = readStored(owner);
    const merged = new Map<string, number>();
    for (const l of mine) merged.set(l.productId, l.qty);
    for (const l of guest) merged.set(l.productId, Math.max(merged.get(l.productId) ?? 0, l.qty));
    const next = [...merged.entries()].map(([productId, qty]) => ({ productId, qty }));
    setLines(next);
    try {
      localStorage.setItem(keyFor(owner), JSON.stringify(next));
      localStorage.removeItem(keyFor("guest"));
    } catch {
      // Almacenamiento no disponible: el carrito vive solo en memoria.
    }
  }, [owner, loading]);

  useEffect(() => {
    if (loading) return;
    try {
      localStorage.setItem(keyFor(owner), JSON.stringify(lines));
    } catch {
      // Ignorar: modo memoria.
    }
  }, [lines, owner, loading]);

  const add = useCallback((productId: string, qty = 1) => {
    setLines((prev) => {
      const found = prev.find((l) => l.productId === productId);
      if (found) return prev.map((l) => (l.productId === productId ? { ...l, qty: Math.min(99, l.qty + qty) } : l));
      return [...prev, { productId, qty }];
    });
  }, []);

  const setQty = useCallback((productId: string, qty: number) => {
    setLines((prev) =>
      qty <= 0 ? prev.filter((l) => l.productId !== productId) : prev.map((l) => (l.productId === productId ? { ...l, qty: Math.min(99, qty) } : l)),
    );
  }, []);

  const remove = useCallback((productId: string) => {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const value = useMemo<CartState>(
    () => ({ lines, count: lines.reduce((n, l) => n + l.qty, 0), add, setQty, remove, clear }),
    [lines, add, setQty, remove, clear],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
