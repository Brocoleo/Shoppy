"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "../../lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    setBusy(true);
    const { data, error: signError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signError || !data.session) {
      setError(signError?.message ?? "No se pudo iniciar sesión.");
      setBusy(false);
      return;
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.session.user.id)
      .maybeSingle();
    if ((profile as { role: string } | null)?.role !== "admin") {
      await supabase.auth.signOut();
      setError("Esta cuenta no es administradora.");
      setBusy(false);
      return;
    }
    router.replace("/");
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="w-full max-w-sm flex flex-col gap-3">
        <h1 className="text-2xl font-bold tracking-tight">vinta.zhe Admin</h1>
        <p className="text-sm text-zinc-500">Solo administradores.</p>
        <label className="text-xs text-zinc-500">Email</label>
        <input
          aria-label="Email"
          type="email"
          autoComplete="username"
          className="rounded border border-zinc-300 px-3 h-12 text-sm"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoCapitalize="none"
        />
        <label className="text-xs text-zinc-500">Contraseña</label>
        <input
          aria-label="Contraseña"
          type="password"
          autoComplete="current-password"
          className="rounded border border-zinc-300 px-3 h-12 text-sm"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        {error ? (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <button
          onClick={submit}
          disabled={busy}
          className="rounded-full bg-zinc-900 text-white h-12 text-sm font-semibold disabled:opacity-60"
        >
          {busy ? "Entrando…" : "Entrar"}
        </button>
      </div>
    </div>
  );
}
