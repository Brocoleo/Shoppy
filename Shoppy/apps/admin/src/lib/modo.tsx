"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
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

export function ModoProvider({ children }: { children: ReactNode }) {
  const [modo, setModoState] = useState<AdminMode>("produccion");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "desarrollo" || stored === "produccion")
        setModoState(stored);
    } catch {
      // localStorage no disponible (modo privado estricto): se queda en producción.
    }
  }, []);

  const setModo = useCallback((m: AdminMode) => {
    setModoState(m);
    try {
      window.localStorage.setItem(STORAGE_KEY, m);
    } catch {
      // Ignorar: el modo vive en memoria mientras dure la sesión.
    }
  }, []);

  return (
    <Ctx.Provider value={{ modo, setModo, includeTest: modo === "desarrollo" }}>
      {children}
    </Ctx.Provider>
  );
}
