/**
 * Sesión Supabase (Fase 4): email/password + Google/Apple en Fase 6.
 * Sin backend configurado, session siempre null (modo mock).
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase, isSupabaseConfigured } from "../lib/supabase";
import { useShopStore, waitForShopPersistence } from "../stores/useShopStore";
import { syncMyCart } from "../data/cartSync";
import { onlineManager } from "@tanstack/react-query";
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
    if (useShopStore.getState().owner !== userId) return;
    useShopStore.getState().clearFavorites();
    queryClient.invalidateQueries({ queryKey: ["favorites", userId] });
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const storeOwner = useShopStore((s) => s.owner);
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

      if (event === "SIGNED_OUT" || (event as string) === "TOKEN_EXPIRED" || (event as string) === "USER_DELETED") {
        // Sin sesión válida no hay datos privados: limpiar cachés del usuario.
        queryClient.removeQueries({ queryKey: ["favorites"] });
        queryClient.removeQueries({ queryKey: ["my-orders"] });
        queryClient.removeQueries({ queryKey: ["my-order"] });
        queryClient.removeQueries({ queryKey: ["guest-order"] });
        queryClient.removeQueries({ queryKey: ["quote"] });
        queryClient.removeQueries({ queryKey: ["my-address"] });
      }
    });
    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    const owner = session?.user.id ?? "guest";
    for (const key of ["my-order", "my-orders", "my-address", "favorites", "quote"]) {
      void queryClient.cancelQueries({ queryKey: [key] });
      queryClient.removeQueries({ queryKey: [key] });
    }
    let cancelled = false;
    let running = false;
    let initialized = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe = () => {};
    let unsubscribeOnline = () => {};
    const flush = async () => {
      if (cancelled || running || owner === "guest" || !onlineManager.isOnline()) return;
      const state = useShopStore.getState();
      if (state.owner !== owner) return;
      const scope = state.scopes[owner];
      if (initialized && !scope.dirty && !scope.merge) return;
      running = true;
      useShopStore.setState({ syncStatus: "syncing" });
      try {
        await waitForShopPersistence();
        if (cancelled) return;
        const cart = scope.merge
          ? await syncMyCart(owner, scope.merge.lines, scope.merge.id, scope.merge.base)
          : await syncMyCart(owner, scope.dirty ? scope.cart : undefined);
        if (cancelled) return;
        initialized = true;
        useShopStore.getState().acknowledge(owner, scope.revision, cart, Boolean(scope.merge), scope.cart);
        await mergeLocalFavorites(owner);
      } catch {
        if (!cancelled) useShopStore.setState({ syncStatus: "error" });
      } finally {
        running = false;
        if (!cancelled && useShopStore.getState().syncStatus !== "ready") timer = setTimeout(() => { void flush(); }, 5000);
      }
    };
    const start = () => {
      if (cancelled) return;
      useShopStore.getState().activate(owner);
      unsubscribe = useShopStore.subscribe((s, previous) => {
        if (s.owner !== owner || s.cart === previous.cart) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { void flush(); }, 500);
      });
      unsubscribeOnline = onlineManager.subscribe((online) => { if (online) void flush(); });
      void flush();
    };
    const unsubscribeHydration = useShopStore.persist.onFinishHydration(start);
    if (useShopStore.persist.hasHydrated()) start();
    return () => { cancelled = true; if (timer) clearTimeout(timer); unsubscribe(); unsubscribeOnline(); unsubscribeHydration(); };
  }, [session?.user.id, loading]);

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
      const { error } = await getSupabase().auth.signOut();
      if (error) throw error;
      setSession(null);
    },
  };

  return <AuthContext.Provider value={value}>{loading || storeOwner !== (session?.user.id ?? "guest") ? null : children}</AuthContext.Provider>;
}
