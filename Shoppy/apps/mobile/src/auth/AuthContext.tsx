/**
 * Sesión Supabase (Fase 4): email/password + Google/Apple en Fase 6.
 * Sin backend configurado, session siempre null (modo mock).
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase, isSupabaseConfigured } from "../lib/supabase";
import { useShopStore } from "../stores/useShopStore";
import { mergeLocalToServer, pushCartToServer } from "../data/cartSync";
import { queryClient } from "../query/client";

interface AuthContextValue {
  isConfigured: boolean;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  isConfigured: false,
  session: null,
  loading: false,
  signIn: () => Promise.resolve({ error: "Sin backend" }),
  signUp: () => Promise.resolve({ error: "Sin backend" }),
  signOut: () => Promise.resolve(),
});

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

/** Migra favoritos locales a la cuenta al iniciar sesión. */
async function mergeLocalFavorites(userId: string): Promise<void> {
  const local = useShopStore.getState().favorites;
  if (local.length === 0) return;
  const supabase = getSupabase();
  const { error } = await supabase.from("favorites").upsert(
    local.map((product_id) => ({ user_id: userId, product_id })),
    { onConflict: "user_id,product_id", ignoreDuplicates: true },
  );
  if (!error) {
    useShopStore.setState({ favorites: [] });
    queryClient.invalidateQueries({ queryKey: ["favorites", userId] });
  }
}

/** Firma estable del carrito para evitar pushes redundantes. */
function signature(cart: { productId: string; qty: number }[]): string {
  return cart
    .map((l) => `${l.productId}:${l.qty}`)
    .sort()
    .join(",");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const supabase = getSupabase();
    let cancelled = false;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!cancelled) setSession(data.session);
      })
      .catch((e) => console.warn("getSession falló (¿sin red?):", e))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    const { data: listener } = supabase.auth.onAuthStateChange((event, next) => {
      if (cancelled) return;
      setSession(next);
      if (event === "SIGNED_IN" && next?.user) {
        mergeLocalFavorites(next.user.id).catch((e) =>
          console.warn("merge favoritos falló:", e),
        );
      }
      if (event === "SIGNED_OUT" || (event as string) === "TOKEN_EXPIRED" || (event as string) === "USER_DELETED") {
        // Sin sesión válida no hay datos privados: limpiar cachés del usuario.
        queryClient.removeQueries({ queryKey: ["favorites"] });
        queryClient.removeQueries({ queryKey: ["my-orders"] });
        queryClient.removeQueries({ queryKey: ["my-address"] });
      }
    });
    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  // Sync de carrito servidor mientras hay sesión (Fase 5).
  useEffect(() => {
    const userId = session?.user.id;
    if (!isSupabaseConfigured || !userId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastPushed = "";

    // Al entrar: fusiona invitado→cuenta y adopta el resultado.
    (async () => {
      try {
        const local = useShopStore.getState().cart;
        const merged = await mergeLocalToServer(userId, local);
        if (cancelled) return;
        lastPushed = signature(merged);
        useShopStore.getState().replaceCart(merged);
        await pushCartToServer(userId, merged);
      } catch (e) {
        console.warn("sync inicial carrito falló:", e);
      }
    })();

    const unsub = useShopStore.subscribe((s) => {
      const sig = signature(s.cart);
      if (sig === lastPushed) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          await pushCartToServer(userId, useShopStore.getState().cart);
          lastPushed = signature(useShopStore.getState().cart);
        } catch (e) {
          console.warn("push carrito falló:", e);
        }
      }, 800);
    });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      unsub();
    };
  }, [session?.user.id]);

  const value: AuthContextValue = {
    isConfigured: isSupabaseConfigured,
    session,
    loading,
    signIn: async (email, password) => {
      const { error } = await getSupabase().auth.signInWithPassword({ email, password });
      return { error: error?.message ?? null };
    },
    signUp: async (email, password) => {
      const { error } = await getSupabase().auth.signUp({ email, password });
      return { error: error?.message ?? null };
    },
    signOut: async () => {
      await getSupabase().auth.signOut();
      setSession(null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
