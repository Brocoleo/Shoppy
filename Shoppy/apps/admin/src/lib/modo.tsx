"use client";

import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export type AdminMode = "produccion" | "desarrollo";

const STORAGE_KEY = "vinta.admin.mode";

interface ModoCtx {
  /** Modo activo del panel: negocio real o con datos de prueba. */
  modo: AdminMode;
  setModo: (m: AdminMode) => void;
  /** true cuando el modo incluye datos de prueba (desarrollo). */
  includeTest: boolean;
}

const Ctx = createContext<ModoCtx>({
  modo: "produccion",
  setModo: () => {},
  includeTest: false,
});

export function useModo(): ModoCtx {
  return useContext(Ctx);
}

/** Un pedido o pago es de prueba cuando fue estampado con mode=test. */
export function isTestOrder(row: { mode?: string | null }): boolean {
  return row.mode === "test";
}

function readStored(): AdminMode {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "desarrollo" || stored === "produccion") return stored;
  } catch {
    // localStorage no disponible (modo privado estricto): se queda en producción.
  }
  return "produccion";
}

// localStorage es un store externo: useSyncExternalStore sincroniza sin
// provocar renders en cascada ni desajustes de hidratación (SSR = producción).
const listeners = new Set<() => void>();

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function getServerSnapshot(): AdminMode {
  return "produccion";
}

export function ModoProvider({ children }: { children: ReactNode }) {
  const modo = useSyncExternalStore(subscribe, readStored, getServerSnapshot);

  const setModo = useCallback((m: AdminMode) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, m);
    } catch {
      // Ignorar: el modo vive en memoria mientras dure la sesión.
    }
    listeners.forEach((notify) => notify());
  }, []);

  return (
    <Ctx.Provider value={{ modo, setModo, includeTest: modo === "desarrollo" }}>
      {children}
    </Ctx.Provider>
  );
}
