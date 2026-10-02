"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

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
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", data.session.user.id)
          .maybeSingle();
        setRole((profile as { role: string } | null)?.role ?? null);
      }
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, next) => {
      setSession(next);
      if (next) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", next.user.id)
          .maybeSingle();
        setRole((profile as { role: string } | null)?.role ?? null);
      } else {
        setRole(null);
      }
    });
    return () => listener.subscription.unsubscribe();
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
