"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { usePathname } from "next/navigation";
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
  const menuButton = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  return (
    <header
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpen(false);
          menuButton.current?.focus();
        }
      }}
      className="sticky top-0 z-40 border-b border-line bg-ivory/95 backdrop-blur"
    >
      <div className="mx-auto flex w-full max-w-[1440px] items-center gap-3 px-5 py-3 sm:px-8 lg:px-14">
        <Link
          href="/"
          aria-label="vinta.zhe, inicio"
          className="inline-flex min-h-11 items-center font-display text-[2rem] tracking-[-0.07em] text-carbon"
        >
          vinta.zhe
        </Link>

        <nav
          aria-label="Principal"
          className="hidden flex-1 items-center justify-center gap-8 text-sm md:flex"
        >
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname === item.href ? "page" : undefined}
              className="inline-flex min-h-11 items-center border-b border-transparent font-medium text-muted transition-colors hover:text-carbon aria-[current=page]:border-carbon aria-[current=page]:text-carbon"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex-1 md:hidden" />

        <Link
          href="/carrito"
          aria-label={
            count > 0 ? `Carrito, ${count} prenda(s)` : "Carrito vacío"
          }
          aria-current={pathname === "/carrito" ? "page" : undefined}
          className="inline-flex min-h-11 items-center px-2 py-1 text-sm text-carbon transition-colors hover:border-carbon"
        >
          Carrito{count > 0 ? ` (${count})` : ""}
        </Link>

        {loading ? (
          // Espacio reservado del slot de sesión: evita CLS cuando la sesión
          // resuelve después de la hidratación (mismo alto que "Entrar"/"Salir").
          <span
            aria-hidden="true"
            className="hidden min-h-11 min-w-[4.5rem] sm:block"
          />
        ) : user ? (
          <button
            type="button"
            onClick={() => signOut()}
            className="hidden min-h-11 text-sm text-muted underline underline-offset-4 hover:text-carbon sm:block"
          >
            Salir
          </button>
        ) : (
          <Link
            href="/login"
            className="hidden min-h-11 items-center px-2 py-1.5 text-sm text-carbon underline-offset-4 hover:underline sm:inline-flex"
          >
            Entrar
          </Link>
        )}

        <button
          type="button"
          ref={menuButton}
          aria-expanded={open}
          aria-controls="menu-movil"
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          onClick={() => setOpen((v) => !v)}
          className="ml-1 flex h-11 w-11 shrink-0 items-center justify-center text-carbon md:ml-0 md:hidden"
        >
          <span aria-hidden="true" className="relative block h-3.5 w-4">
            <span
              className={`absolute left-0 top-0 h-px w-full bg-current transition-transform ${open ? "translate-y-[7px] rotate-45" : ""}`}
            />
            <span
              className={`absolute left-0 top-[7px] h-px w-full bg-current ${open ? "opacity-0" : ""}`}
            />
            <span
              className={`absolute bottom-0 left-0 h-px w-full bg-current transition-transform ${open ? "-translate-y-[6px] -rotate-45" : ""}`}
            />
          </span>
        </button>
      </div>

      <div className={`disclosure md:hidden ${open ? "disclosure-open" : ""}`}>
        <div>
          <nav
            id="menu-movil"
            aria-label="Móvil"
            inert={!open}
            className="border-t border-line bg-ivory px-4 py-3"
          >
            <ul className="flex flex-col gap-1">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={pathname === item.href ? "page" : undefined}
                    className="flex min-h-11 items-center py-2 text-sm font-medium text-carbon"
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
                    className="flex min-h-11 items-center py-2 text-sm font-medium text-muted"
                  >
                    Salir
                  </button>
                ) : (
                  <Link
                    href="/login"
                    onClick={() => setOpen(false)}
                    aria-current={pathname === "/login" ? "page" : undefined}
                    className="flex min-h-11 items-center py-2 text-sm font-medium text-carbon"
                  >
                    Entrar
                  </Link>
                )}
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </header>
  );
}
