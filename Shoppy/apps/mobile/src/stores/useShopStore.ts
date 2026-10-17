import AsyncStorage from "@react-native-async-storage/async-storage";
import { randomUUID } from "expo-crypto";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

let lastWrite: Promise<void> = Promise.resolve();
const serializedStorage = {
  getItem: (key: string) => AsyncStorage.getItem(key),
  setItem: (key: string, value: string) => {
    lastWrite = lastWrite.catch(() => {}).then(() => AsyncStorage.setItem(key, value));
    return lastWrite;
  },
  removeItem: (key: string) => AsyncStorage.removeItem(key),
};
export function waitForShopPersistence() { return lastWrite; }

export interface CartLine { productId: string; qty: number }
interface Scope {
  cart: CartLine[];
  favorites: string[];
  revision: number;
  dirty: boolean;
  paidOrders?: string[];
  merge?: { id: string; lines: CartLine[]; base?: CartLine[] };
}
const empty = (): Scope => ({ cart: [], favorites: [], revision: 0, dirty: false });
interface ShopState {
  owner: string;
  scopes: Record<string, Scope>;
  cart: CartLine[];
  favorites: string[];
  legacyCart: CartLine[];
  legacyFavorites: string[];
  syncStatus: "ready" | "pending" | "syncing" | "error";
  activate: (owner: string) => void;
  acknowledge: (owner: string, revision: number, cart: CartLine[], merged?: boolean, sent?: CartLine[]) => void;
  consumePaidOrder: (orderId: string, lines: CartLine[]) => void;
  addToCart: (id: string, qty?: number) => void;
  removeFromCart: (id: string) => void;
  setQty: (id: string, qty: number) => void;
  clearCart: () => void;
  replaceCart: (cart: CartLine[]) => void;
  toggleFavorite: (id: string) => void;
  clearFavorites: () => void;
  isFavorite: (id: string) => boolean;
  cartCount: () => number;
  recoverLegacy: () => void;
  dismissLegacy: () => void;
}

export const useShopStore = create<ShopState>()(persist((set, get) => {
  const updateCart = (cart: CartLine[]) => set((s) => {
    const scope = s.scopes[s.owner] ?? empty();
    const next = { ...scope, cart, revision: scope.revision + 1, dirty: true };
    return { cart, scopes: { ...s.scopes, [s.owner]: next }, syncStatus: "pending" };
  });
  const updateFavorites = (favorites: string[]) => set((s) => ({ favorites, scopes: { ...s.scopes, [s.owner]: { ...(s.scopes[s.owner] ?? empty()), favorites } } }));
  return {
    owner: "guest", scopes: {}, cart: [], favorites: [], legacyCart: [], legacyFavorites: [], syncStatus: "ready",
    activate: (owner) => set((s) => {
      const scopes = { ...s.scopes };
      let next = scopes[owner] ?? empty();
      const guest = scopes.guest;
      if (owner !== "guest" && guest && (guest.cart.length || guest.favorites.length)) {
        // Una sola transferencia local; el recibo UUID hace idempotente la fusión remota.
        if (!next.merge && guest.cart.length) {
          const combined = new Map(next.cart.map((l) => [l.productId, l.qty]));
          for (const line of guest.cart) combined.set(line.productId, Math.min(99, (combined.get(line.productId) ?? 0) + line.qty));
          next = { ...next, merge: { id: randomUUID(), lines: guest.cart, base: next.dirty ? next.cart : undefined }, cart: [...combined].map(([productId, qty]) => ({ productId, qty })) };
        }
        if (!guest.cart.length || (next.merge && !scopes[owner]?.merge)) {
          next = { ...next, favorites: [...new Set([...next.favorites, ...guest.favorites])] };
          scopes.guest = empty();
        }
      }
      scopes[owner] = next;
      return { owner, scopes, cart: next.cart, favorites: next.favorites, syncStatus: next.dirty || next.merge ? "pending" : "ready" };
    }),
    acknowledge: (owner, revision, cart, merged = false, sent) => set((s) => {
      if (s.owner !== owner) return s;
      const scope = s.scopes[owner] ?? empty();
      const same = scope.revision === revision;
      if (!same && sent) {
        const before = new Map(sent.map((line) => [line.productId, line.qty]));
        const current = new Map(scope.cart.map((line) => [line.productId, line.qty]));
        const reconciled = new Map(cart.map((line) => [line.productId, line.qty]));
        for (const id of new Set([...before.keys(), ...current.keys()])) {
          const delta = (current.get(id) ?? 0) - (before.get(id) ?? 0);
          if (delta) reconciled.set(id, Math.max(0, Math.min(99, (reconciled.get(id) ?? 0) + delta)));
        }
        cart = [...reconciled].filter(([, qty]) => qty > 0).map(([productId, qty]) => ({ productId, qty }));
      }
      const next = { ...scope, ...(merged ? { merge: undefined } : {}), ...(same ? { cart, dirty: false } : sent ? { cart, dirty: true } : {}) };
      return { scopes: { ...s.scopes, [owner]: next }, cart: next.cart, syncStatus: same ? "ready" : "pending" };
    }),
    addToCart: (id, qty = 1) => {
      if (!Number.isInteger(qty) || qty < 1) return;
      const cart = get().cart;
      updateCart(cart.some((l) => l.productId === id) ? cart.map((l) => l.productId === id ? { ...l, qty: Math.min(99, l.qty + qty) } : l) : [...cart, { productId: id, qty: Math.min(99, qty) }]);
    },
    removeFromCart: (id) => updateCart(get().cart.filter((l) => l.productId !== id)),
    setQty: (id, qty) => { if (Number.isInteger(qty)) updateCart(qty <= 0 ? get().cart.filter((l) => l.productId !== id) : get().cart.map((l) => l.productId === id ? { ...l, qty: Math.min(99, qty) } : l)); },
    consumePaidOrder: (orderId, lines) => set((s) => {
      const scope = s.scopes[s.owner] ?? empty();
      if (scope.paidOrders?.includes(orderId)) return s;
      const bought = new Map(lines.map((line) => [line.productId, line.qty]));
      const cart = scope.cart.map((line) => ({ ...line, qty: Math.max(0, line.qty - (bought.get(line.productId) ?? 0)) })).filter((line) => line.qty > 0);
      const next = { ...scope, cart, revision: scope.revision + 1, dirty: true, paidOrders: [...(scope.paidOrders ?? []), orderId] };
      return { cart, scopes: { ...s.scopes, [s.owner]: next }, syncStatus: "pending" };
    }),
    clearCart: () => updateCart([]),
    replaceCart: updateCart,
    toggleFavorite: (id) => updateFavorites(get().favorites.includes(id) ? get().favorites.filter((v) => v !== id) : [...get().favorites, id]),
    clearFavorites: () => updateFavorites([]),
    isFavorite: (id) => get().favorites.includes(id),
    cartCount: () => get().cart.reduce((n, l) => n + l.qty, 0),
    recoverLegacy: () => { const cart = new Map(get().cart.map((l) => [l.productId, l])); for (const l of get().legacyCart) if (!cart.has(l.productId)) cart.set(l.productId, l); updateCart([...cart.values()]); updateFavorites([...new Set([...get().favorites, ...get().legacyFavorites])]); set({ legacyCart: [], legacyFavorites: [] }); },
    dismissLegacy: () => set({ legacyCart: [], legacyFavorites: [] }),
  };
}, {
  name: "shopy-store-v1", version: 2,
  storage: createJSONStorage(() => serializedStorage),
  partialize: (s) => ({ scopes: s.scopes, legacyCart: s.legacyCart, legacyFavorites: s.legacyFavorites }),
  migrate: (persisted) => ({ scopes: {}, legacyCart: (persisted as { cart?: CartLine[] })?.cart ?? [], legacyFavorites: (persisted as { favorites?: string[] })?.favorites ?? [] }),
}));
