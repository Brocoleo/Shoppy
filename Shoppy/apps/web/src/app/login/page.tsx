"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "../../lib/session";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, signIn, signUp } = useSession();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <p className="py-10 text-center text-sm text-zinc-500">Cargando sesión…</p>;
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
      <h1 className="text-2xl font-bold tracking-tight">{mode === "in" ? "Entrar" : "Crear cuenta"}</h1>
      <p className="text-sm text-zinc-500">
        {mode === "in" ? "¿No tienes cuenta?" : "¿Ya tienes cuenta?"}{" "}
        <button type="button" onClick={() => setMode(mode === "in" ? "up" : "in")} className="underline">
          {mode === "in" ? "Regístrate" : "Entra"}
        </button>
      </p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-500">Email</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.cl" className="h-11 rounded border border-zinc-300 bg-white px-3" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-500">Contraseña</span>
          <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="h-11 rounded border border-zinc-300 bg-white px-3" />
        </label>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <button type="submit" disabled={busy} className="h-11 rounded bg-zinc-900 text-sm font-semibold text-white disabled:opacity-60">
          {busy ? "Cargando…" : mode === "in" ? "Entrar" : "Crear cuenta"}
        </button>
      </form>
      <Link href="/catalogo" className="text-center text-sm text-zinc-500 underline">
        Seguir comprando como visita
      </Link>
    </div>
  );
}
