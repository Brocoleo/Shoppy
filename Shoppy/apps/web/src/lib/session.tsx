"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { SupabaseClient, Session, User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { createSessionConnection } from "./sessionConnection";
import { purgeUserQueries } from "./privateData";

interface SessionState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SessionState>({
  session: null,
  user: null,
  loading: true,
  signIn: async () => ({ error: "Sin backend" }),
  signUp: async () => ({ error: "Sin backend" }),
  signOut: async () => {},
});

export function useSession(): SessionState {
  return useContext(Ctx);
}

// La carga del SDK se difiere hasta montar el proveedor o iniciar autenticación.
const sbConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
let supPromise: Promise<SupabaseClient> | null = null;
function sup(): Promise<SupabaseClient> {
  supPromise ??= import("./supabase").then((m) => m.getSupabase()).catch((error) => {
    supPromise = null;
    throw error;
  });
  return supPromise;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(sbConfigured);
  const queryClient = useQueryClient();

  const connection = useRef<ReturnType<typeof createSessionConnection> | null>(null);
  const lastUserId = useRef<string | null>(null);

  // Aislamiento entre cuentas: en cuanto cambia el usuario (login, logout,
  // cambio de cuenta, expiración de sesión en otra pestaña) se cancelan las
  // consultas privadas en vuelo de la cuenta ANTERIOR y se borra su caché.
  //
  // Solo se purga la cuenta anterior, nunca la actual: purgar en la primera
  // carga cancelaba la consulta que la página activa acababa de lanzar y la
  // dejaba colgada en "Cargando…". Además, la clave de cada consulta privada
  // incluye al usuario, así que la caché de una cuenta nunca se sirve a otra.
  const userId = session?.user.id ?? null;
  useEffect(() => {
    const previous = lastUserId.current;
    lastUserId.current = userId;
    if (!previous || previous === userId) return;
    purgeUserQueries(queryClient, previous);
  }, [userId, queryClient]);

  useEffect(() => {
    if (!sbConfigured) return;
    let active = true;
    const current = createSessionConnection(sup, (next) => {
      setSession(next);
      setLoading(false);
    });
    connection.current = current;
    void current.connect().catch(() => { if (active) setLoading(false); });
    return () => {
      active = false;
      current.dispose();
      if (connection.current === current) connection.current = null;
    };
  }, []);

  const clientForAuth = useCallback(() => {
    if (!connection.current) return Promise.reject(new Error("Autenticación no disponible"));
    return connection.current.connect();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const { error } = await (await clientForAuth()).auth.signInWithPassword({ email, password });
      return { error: error?.message ?? null };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [clientForAuth]);

  const signUp = useCallback(async (email: string, password: string) => {
    try {
      const { error } = await (await clientForAuth()).auth.signUp({ email, password });
      return { error: error?.message ?? null };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [clientForAuth]);

  const signOut = useCallback(async () => {
    try {
      await (await clientForAuth()).auth.signOut();
    } catch {
      // Sin conexión: igual limpiamos el estado local.
    }
    setSession(null);
  }, [clientForAuth]);

  const value = useMemo<SessionState>(
    () => ({ session, user: session?.user ?? null, loading, signIn, signUp, signOut }),
    [session, loading, signIn, signUp, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
