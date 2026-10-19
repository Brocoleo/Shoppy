"use client";

import { useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

export function LoadingState({ message = "Cargando…" }: { message?: string }) {
  return (
    <p role="status" className="py-10 text-center font-display text-lg italic text-muted">
      {message}
    </p>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="mx-auto flex max-w-md flex-col items-center gap-3 border border-carbon/25 bg-ivory p-6 text-center"
    >
      <p className="font-display text-xl text-carbon">No se pudo cargar</p>
      <p className="text-sm text-muted">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="bg-carbon px-5 py-2 text-sm uppercase tracking-[0.12em] text-ivory transition-colors hover:bg-carbon-soft"
        >
          Reintentar
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <p aria-hidden="true" className="font-display text-4xl italic text-taupe">
        —
      </p>
      <p role="status" className="max-w-sm text-sm text-muted">
        {message}
      </p>
      {action}
    </div>
  );
}

export function SectionTitle({ title, action, id }: { title: string; action?: ReactNode; id?: string }) {
  return (
    <div className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
      <h2 id={id} className="font-display text-3xl tracking-tight text-carbon sm:text-4xl">{title}</h2>
      {action}
    </div>
  );
}

export function backendErrorMessage(): string {
  return "Revisa tu conexión. Si el problema continúa, vuelve a intentarlo más tarde.";
}

/** Retry a failed server read without discarding the surrounding client state. */
export function ServerReadError({ message }: { message: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div aria-busy={pending}>
      <ErrorState message={message} onRetry={() => startTransition(() => router.refresh())} />
      {pending ? <p role="status" className="mt-3 text-center text-sm">Reintentando…</p> : null}
    </div>
  );
}
