"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabase = createClient(url, anon);

interface AdminSession {
  session: Session | null;
  role: string | null;
  email: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AdminSession>({
  session: null,
  role: null,
  email: null,
  loading: true,
  signOut: async () => {},
});

export function useAdminSession(): AdminSession {
  return useContext(Ctx);
}

const hasEnv = Boolean(url && anon);

export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(hasEnv);

  useEffect(() => {
    if (!hasEnv) return;
    let active = true,
      generation = 0;
    let resolvedIdentity: string | null | undefined;
    const resolveSession = async (next: Session | null) => {
      if (!active) return;
      const request = ++generation;
      const identity = next?.user.id ?? null;
      const switchingIdentity = identity !== resolvedIdentity;
      resolvedIdentity = identity;
      setSession(next);
      // A refresh for the same user must not unmount an unsaved editor.
      if (switchingIdentity) {
        setRole(null);
        setLoading(true);
      }
      try {
        if (next) {
          const { data, error } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", next.user.id)
            .maybeSingle();
          if (active && request === generation)
            setRole(
              error ? null : ((data as { role: string } | null)?.role ?? null),
            );
        }
      } finally {
        if (active && request === generation) setLoading(false);
      }
    };
    supabase.auth
      .getSession()
      .then(({ data }) => resolveSession(data.session))
      .catch(() => resolveSession(null));
    // Defer the profile query until the auth callback releases its session lock.
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, next) => {
        setTimeout(() => {
          void resolveSession(next);
        }, 0);
      },
    );
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return (
    <Ctx.Provider
      value={{
        session,
        role,
        email: session?.user.email ?? null,
        loading,
        signOut: async () => {
          await supabase.auth.signOut();
          setSession(null);
          setRole(null);
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function formatCLP(n: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(Math.round(n));
}
