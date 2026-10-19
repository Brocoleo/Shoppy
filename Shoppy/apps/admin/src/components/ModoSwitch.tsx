"use client";

import { useModo, type AdminMode } from "../lib/modo";

/**
 * Interruptor global del panel. Producción (default) muestra solo datos
 * reales; Desarrollo incluye productos y pedidos de prueba en todas las
 * páginas. Es una sola fuente de verdad persistida en localStorage.
 */
export function ModoSwitch() {
  const { modo, setModo } = useModo();
  const options: { value: AdminMode; label: string; hint: string }[] = [
    { value: "produccion", label: "Producción", hint: "Solo datos reales del negocio" },
    { value: "desarrollo", label: "Desarrollo", hint: "Incluye productos y pedidos de prueba" },
  ];
  const desarrollando = modo === "desarrollo";
  return (
    <div
      role="group"
      aria-label="Modo de datos del panel"
      aria-describedby="modo-datos-ayuda"
      className="px-2 pb-3"
    >
      <p className="pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
        Modo de datos
      </p>
      <div className="flex rounded-full border border-line bg-parchment p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={modo === o.value}
            title={o.hint}
            onClick={() => setModo(o.value)}
            className={`btn-press flex-1 rounded-full px-2 py-1.5 text-xs font-medium transition-colors ${
              modo === o.value
                ? o.value === "desarrollo"
                  ? "bg-amber-500 text-white"
                  : "bg-carbon text-ivory"
                : "text-muted hover:text-carbon"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p
        id="modo-datos-ayuda"
        role="status"
        className={`pt-1.5 text-[11px] ${desarrollando ? "text-amber-700" : "text-muted"}`}
      >
        {desarrollando
          ? "Incluye pruebas en todo el panel."
          : "Solo datos reales de negocio."}
      </p>
    </div>
  );
}
