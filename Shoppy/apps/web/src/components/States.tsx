"use client";

import type { ReactNode } from "react";

export function LoadingState({ message = "Cargando…" }: { message?: string }) {
  return <p className="py-10 text-center text-sm text-zinc-500">{message}</p>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-6 text-center">
      <p className="font-medium text-red-800">No se pudo cargar</p>
      <p className="text-sm text-red-600">{message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="rounded bg-red-700 px-4 py-2 text-sm text-white">
          Reintentar
        </button>
      ) : null}
    </div>
  );
}

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="text-lg font-bold tracking-tight">{title}</h2>
      {action}
    </div>
  );
}

export function backendErrorMessage(): string {
  return "Revisa tu conexión. Si el problema continúa, vuelve a intentarlo más tarde.";
}
