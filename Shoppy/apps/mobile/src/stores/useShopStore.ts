/**
 * Estado local de tienda (Fase 5): carrito + favoritos guest en memoria
 * con persistencia AsyncStorage (sobrevive cierre/reinicio).
 * Usuarios autenticados sincronizan contra servidor (ver cartSync);
 * invitados viven 100% en este store.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface CartLine {
  productId: string;
  qty: number;
}

interface ShopState {
  cart: CartLine[];
  favorites: string[];
  addToCart: (productId: string, qty?: number) => void;
  removeFromCart: (productId: string) => void;
  setQty: (productId: string, qty: number) => void;
  clearCart: () => void;
  replaceCart: (cart: CartLine[]) => void;
  toggleFavorite: (productId: string) => void;
  isFavorite: (productId: string) => boolean;
  cartCount: () => number;
}

export const useShopStore = create<ShopState>()(
  persist(
    (set, get) => ({
      cart: [],
      favorites: [],

      addToCart: (productId, qty = 1) =>
        set((s) => {
          const line = s.cart.find((l) => l.productId === productId);
          if (line) {
            return {
              cart: s.cart.map((l) =>
                l.productId === productId ? { ...l, qty: Math.min(99, l.qty + qty) } : l,
              ),
            };
          }
          return { cart: [...s.cart, { productId, qty }] };
        }),

      removeFromCart: (productId) =>
        set((s) => ({ cart: s.cart.filter((l) => l.productId !== productId) })),

      setQty: (productId, qty) =>
        set((s) =>
          qty <= 0
            ? { cart: s.cart.filter((l) => l.productId !== productId) }
            : {
                cart: s.cart.map((l) =>
                  l.productId === productId ? { ...l, qty: Math.min(99, qty) } : l,
                ),
              },
        ),

      clearCart: () => set({ cart: [] }),

      replaceCart: (cart) => set({ cart }),

      toggleFavorite: (productId) =>
        set((s) => ({
          favorites: s.favorites.includes(productId)
            ? s.favorites.filter((id) => id !== productId)
            : [...s.favorites, productId],
        })),

      isFavorite: (productId) => get().favorites.includes(productId),

      cartCount: () => get().cart.reduce((n, l) => n + l.qty, 0),
    }),
    {
      name: "shopy-store-v1",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ cart: s.cart, favorites: s.favorites }),
    },
  ),
);
