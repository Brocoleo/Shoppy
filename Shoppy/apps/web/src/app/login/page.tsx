"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "../../lib/session";
import { LoadingState } from "../../components/States";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, signIn, signUp } = useSession();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <LoadingState message="Cargando sesión…" />;
  if (user) {
    router.replace("/");
    return null;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = mode === "in" ? await signIn(email.trim(), password) : await signUp(email.trim(), password);
    setBusy(false);
    if (res.error) setError(res.error);
    else router.replace("/");
  };

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4">
      <div className="border-b border-carbon/20 pb-3">
        <p className="text-[11px] uppercase tracking-[0.28em] text-taupe-deep">Tu cuenta</p>
        <h1 className="mt-1 font-display text-3xl tracking-tight text-carbon">{mode === "in" ? "Entrar" : "Crear cuenta"}</h1>
      </div>
      <p className="text-sm text-muted">
        {mode === "in" ? "¿No tienes cuenta?" : "¿Ya tienes cuenta?"}{" "}
        <button type="button" onClick={() => setMode(mode === "in" ? "up" : "in")} className="underline underline-offset-4 hover:text-carbon">
          {mode === "in" ? "Regístrate" : "Entra"}
        </button>
      </p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">Email</span>
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.cl" className="h-11 border border-carbon/30 bg-ivory px-3 text-carbon placeholder:text-muted focus:border-carbon" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">Contraseña</span>
          <input type="password" required minLength={6} autoComplete={mode === "in" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="h-11 border border-carbon/30 bg-ivory px-3 text-carbon placeholder:text-muted focus:border-carbon" />
        </label>
        {error ? <p role="alert" className="border border-red-700/30 bg-red-700/5 p-3 text-sm text-red-700">{error}</p> : null}
        <button type="submit" disabled={busy} className="h-11 bg-carbon text-sm uppercase tracking-[0.12em] text-ivory transition-colors hover:bg-carbon-soft disabled:opacity-60">
          {busy ? "Cargando…" : mode === "in" ? "Entrar" : "Crear cuenta"}
        </button>
      </form>
      <Link href="/catalogo" className="text-center text-sm text-muted underline underline-offset-4 hover:text-carbon">
        Seguir comprando como visita
      </Link>
    </div>
  );
}
