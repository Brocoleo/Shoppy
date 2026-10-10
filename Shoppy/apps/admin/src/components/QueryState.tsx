"use client";

/** Estado loading/error/vacío consistente para listas del admin. */
export function QueryState({
  isLoading,
  isError,
  isEmpty,
  emptyText = "Sin registros.",
  onRetry,
}: {
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
  emptyText?: string;
  onRetry: () => void;
}) {
  if (isLoading) return <p className="text-sm text-zinc-500">Cargando…</p>;
  if (isError) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-4 text-sm">
        <p className="font-medium text-red-800">No se pudo cargar</p>
        <p className="text-red-600">Revisa tu conexión y tu rol admin.</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded bg-red-700 px-3 h-9 text-white text-sm"
        >
          Reintentar
        </button>
      </div>
    );
  }
  if (isEmpty) return <p className="text-sm text-zinc-500">{emptyText}</p>;
  return null;
}

/** slug sin tildes: NFD + rango de marcas combinantes U+0300–U+036F. */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
