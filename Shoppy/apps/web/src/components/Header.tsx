"use client";

import Link from "next/link";
import { useState } from "react";
import { useCart } from "../lib/cart";
import { useSession } from "../lib/session";

const NAV = [
  { href: "/catalogo", label: "Catálogo" },
  { href: "/coleccion/ofertas", label: "Ofertas" },
  { href: "/pedidos", label: "Mis pedidos" },
];

export function Header() {
  const { count } = useCart();
  const { user, loading, signOut } = useSession();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ivory/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3">
        <Link
          href="/"
          aria-label="Shopy, inicio"
          className="font-display text-2xl tracking-[0.18em] text-carbon"
        >
          SHOPY
        </Link>

        <nav aria-label="Principal" className="hidden flex-1 items-center gap-6 text-sm md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="uppercase tracking-[0.12em] text-muted transition-colors hover:text-carbon"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex-1 md:hidden" />

        <Link
          href="/carrito"
          aria-label={count > 0 ? `Carrito, ${count} prenda(s)` : "Carrito vacío"}
          className="rounded-full border border-carbon/30 px-3 py-1 text-sm text-carbon transition-colors hover:border-carbon"
        >
          Carrito{count > 0 ? ` (${count})` : ""}
        </Link>

        {loading ? null : user ? (
          <button
            type="button"
            onClick={() => signOut()}
            className="hidden text-sm text-muted underline underline-offset-4 hover:text-carbon sm:block"
          >
            Salir
          </button>
        ) : (
          <Link
            href="/login"
            className="hidden bg-carbon px-4 py-1.5 text-sm uppercase tracking-[0.12em] text-ivory transition-colors hover:bg-carbon-soft sm:block"
          >
            Entrar
          </Link>
        )}

        <button
          type="button"
          aria-expanded={open}
          aria-controls="menu-movil"
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          onClick={() => setOpen((v) => !v)}
          className="flex h-9 w-9 items-center justify-center rounded border border-carbon/30 text-carbon md:hidden"
        >
          <span aria-hidden="true" className="relative block h-3.5 w-4">
            <span
              className={`absolute left-0 top-0 h-px w-full bg-current transition-transform ${open ? "translate-y-[7px] rotate-45" : ""}`}
            />
            <span className={`absolute left-0 top-[7px] h-px w-full bg-current ${open ? "opacity-0" : ""}`} />
            <span
              className={`absolute bottom-0 left-0 h-px w-full bg-current transition-transform ${open ? "-translate-y-[6px] -rotate-45" : ""}`}
            />
          </span>
        </button>
      </div>

      {open ? (
        <nav
          id="menu-movil"
          aria-label="Móvil"
          className="border-t border-line bg-ivory px-4 py-3 md:hidden"
        >
          <ul className="flex flex-col gap-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="block py-2 text-sm uppercase tracking-[0.12em] text-carbon"
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              {loading ? null : user ? (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    signOut();
                  }}
                  className="block py-2 text-sm uppercase tracking-[0.12em] text-muted"
                >
                  Salir
                </button>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="block py-2 text-sm uppercase tracking-[0.12em] text-carbon"
                >
                  Entrar
                </Link>
              )}
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
