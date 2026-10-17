"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";

const KEY = "vinta.consent.v1";
/** Reapertura pedida desde el pie de página. */
const EVENT = "vinta:cookie-preferences";
/** El evento storage solo avisa a otras pestañas. */
const CHANGE = "vinta:cookie-change";

function subscribe(callback: () => void) {
  window.addEventListener(CHANGE, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHANGE, callback);
    window.removeEventListener("storage", callback);
  };
}

function hasStoredConsent(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

/** El servidor no muestra el aviso antes de leer el almacenamiento local. */
function serverConsent(): boolean {
  return true;
}

/** Aviso informativo: solo se almacena que ya se ha leído. */
export function CookieConsent() {
  const stored = useSyncExternalStore(subscribe, hasStoredConsent, serverConsent);
  const [requested, setRequested] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const acknowledgeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const reopen = () => {
      openerRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      setRequested(true);
    };
    window.addEventListener(EVENT, reopen);
    return () => window.removeEventListener(EVENT, reopen);
  }, []);

  useEffect(() => {
    if (requested) acknowledgeRef.current?.focus();
  }, [requested]);

  const acknowledge = () => {
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({ acknowledged: true, at: new Date().toISOString() }),
      );
    } catch {
      /* almacenamiento no disponible: se oculta solo en esta sesión */
    }
    setDismissed(true);
    setRequested(false);
    if (requested && openerRef.current?.isConnected) openerRef.current.focus();
    window.dispatchEvent(new Event(CHANGE));
  };

  const open = requested || (!stored && !dismissed);
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-labelledby="storage-notice-title"
      aria-describedby="storage-notice-description"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          acknowledge();
        }
      }}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ivory/95 backdrop-blur motion-safe:animate-fade-up"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-5 py-4 text-sm text-carbon sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div className="max-w-2xl">
          <p id="storage-notice-title" className="mb-1 font-medium">
            Información de almacenamiento
          </p>
          <p id="storage-notice-description" className="text-muted">
            Usamos almacenamiento local necesario para tu sesión y tu carrito.
            No usamos analítica ni publicidad.{" "}
            <Link
              href="/legal/cookies"
              className="text-carbon underline underline-offset-4"
            >
              Más información
            </Link>
            .
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            ref={acknowledgeRef}
            onClick={acknowledge}
            className="inline-flex min-h-11 items-center bg-carbon px-4 text-xs uppercase tracking-[0.12em] text-ivory transition-colors hover:bg-carbon-soft focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-carbon"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}

/** Botón del footer para reabrir el banner. */
export function CookiePreferencesButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(EVENT))}
      className="inline-flex min-h-11 w-fit items-center text-sm underline underline-offset-4"
    >
      Información de almacenamiento
    </button>
  );
}
