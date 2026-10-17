"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { supabase, useAdminSession } from "../../lib/supabase";

/** La sesión de la invitación se verifica por Supabase; nunca se acepta un rol de la URL. */
export default function ConfigureAccessPage() {
  const { session, role, loading } = useAdminSession();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!loading && (window.location.hash || window.location.search)) {
      // Retirar tokens y errores del historial tras procesar el enlace; no registrarlos.
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [loading]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    if (password.length < 12) {
      setError("Usa una contraseña de al menos 12 caracteres.");
      return;
    }
    if (password !== confirmation) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    try {
      const verified = await supabase.auth.getUser();
      if (verified.error || !verified.data.user || verified.data.user.id !== session?.user.id || role !== "admin") {
        throw new Error("La sesión ya no es válida. Abre de nuevo la invitación o solicita otra.");
      }
      const result = await supabase.auth.updateUser({ password });
      if (result.error) throw new Error("No se pudo guardar la contraseña. Puede que el enlace haya vencido o que la contraseña no cumpla los requisitos del servicio. Inténtalo de nuevo.");
      setPassword("");
      setConfirmation("");
      setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo conectar. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center gap-5 p-5">
      <p className="font-serif text-3xl">vinta.zhe</p>
      <h1 className="text-2xl font-semibold">Configurar acceso al admin</h1>
      {saved ? (
        <div className="space-y-4">
          <p role="status">Tu contraseña está guardada. Ya puedes entrar al admin.</p>
          <Link href="/" className="inline-flex min-h-12 items-center rounded-full bg-zinc-900 px-5 text-white">Entrar al admin</Link>
        </div>
      ) : loading ? <p role="status">Comprobando invitación…</p> : !session || role !== "admin" ? (
        <div className="space-y-4">
          <p role="alert">Este enlace no contiene una sesión administradora válida. Puede haber vencido o haber sido utilizado. Solicita una nueva invitación si todavía no definiste tu contraseña.</p>
          <Link href="/login" className="inline-flex min-h-11 items-center underline">Ya tengo contraseña</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <p className="break-words text-sm text-zinc-600">Define tu contraseña para {session.user.email}. No necesitas compartirla con nadie.</p>
          <label className="flex flex-col gap-2 text-sm">
            Nueva contraseña
            <input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} aria-describedby="password-help" className="min-h-12 min-w-0 rounded border border-zinc-300 px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900" />
          </label>
          <p id="password-help" className="text-sm text-zinc-600">Al menos 12 caracteres. Puedes usar una frase larga y única.</p>
          <label className="flex flex-col gap-2 text-sm">
            Repite la contraseña
            <input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="min-h-12 min-w-0 rounded border border-zinc-300 px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900" />
          </label>
          {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
          <button type="submit" disabled={busy} className="min-h-12 rounded-full bg-zinc-900 px-5 text-white disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900">{busy ? "Guardando…" : "Guardar contraseña"}</button>
        </form>
      )}
    </main>
  );
}
