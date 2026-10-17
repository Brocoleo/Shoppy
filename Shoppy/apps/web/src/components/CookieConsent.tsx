"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const KEY = "vinta.consent.v1";
const EVENT = "vinta:cookie-preferences";

type Choice = "all" | "necessary";

/** Banner de consentimiento. Sin dependencias, solo CSS, respeta prefers-reduced-motion. */
export function CookieConsent() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setOpen(true);
    } catch {
      setOpen(true);
    }
    const reopen = () => setOpen(true);
    window.addEventListener(EVENT, reopen);
    return () => window.removeEventListener(EVENT, reopen);
  }, []);

  const decide = (choice: Choice) => {
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({ choice, at: new Date().toISOString() }),
      );
    } catch {
      /* almacenamiento no disponible: se oculta solo en esta sesión */
    }
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Consentimiento de cookies"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ivory/95 backdrop-blur motion-safe:animate-fade-up"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-5 py-4 text-sm text-carbon sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p className="max-w-2xl text-muted">
          Usamos almacenamiento necesario para tu sesión y tu carrito. No usamos
          cookies publicitarias ni de terceros.{" "}
          <Link
            href="/legal/cookies"
            className="text-carbon underline underline-offset-4"
          >
            Más información
          </Link>
          .
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => decide("necessary")}
            className="inline-flex min-h-11 items-center border border-carbon/30 px-4 text-xs uppercase tracking-[0.12em] text-carbon transition-colors hover:border-carbon"
          >
            Solo necesarias
          </button>
          <button
            type="button"
            onClick={() => decide("all")}
            className="inline-flex min-h-11 items-center bg-carbon px-4 text-xs uppercase tracking-[0.12em] text-ivory transition-colors hover:bg-carbon-soft"
          >
            Aceptar
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
      Preferencias de cookies
    </button>
  );
}
