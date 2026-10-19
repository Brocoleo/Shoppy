"use client";

import { useModo, type AdminMode } from "../lib/modo";

/**
 * Interruptor global del panel. Producción (default) muestra solo datos
 * reales; Desarrollo incluye productos y pedidos de prueba en todas las
 * páginas. Es una sola fuente de verdad persistida en localStorage.
 */
export function ModoSwitch() {
  const { modo, setModo } = useModo();
  const options: { value: AdminMode; label: string }[] = [
    { value: "produccion", label: "Producción" },
    { value: "desarrollo", label: "Desarrollo" },
  ];
  return (
    <div className="px-2 pb-3" role="group" aria-label="Modo de datos del panel">
      <p className="pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        Modo de datos
      </p>
      <div className="flex rounded-full border border-zinc-300 bg-zinc-100 p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={modo === o.value}
            onClick={() => setModo(o.value)}
            className={`flex-1 rounded-full px-2 py-1.5 text-xs font-medium transition-colors ${
              modo === o.value
                ? o.value === "desarrollo"
                  ? "bg-amber-500 text-white"
                  : "bg-zinc-900 text-white"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {modo === "desarrollo" ? (
        <p className="pt-1.5 text-[11px] text-amber-700">
          Incluye pruebas en todo el panel.
        </p>
      ) : (
        <p className="pt-1.5 text-[11px] text-zinc-500">
          Solo datos reales de negocio.
        </p>
      )}
    </div>
  );
}
