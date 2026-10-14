"use client";

import Link from "next/link";
import { useCart } from "../lib/cart";
import { useSession } from "../lib/session";

export function Header() {
  const { count } = useCart();
  const { user, loading, signOut } = useSession();
  return (
    <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-3">
        <Link href="/" className="text-xl font-bold tracking-tight">
          Shopy
        </Link>
        <nav className="flex flex-1 items-center gap-4 text-sm">
          <Link href="/catalogo" className="text-zinc-600 hover:text-zinc-900">
            Catálogo
          </Link>
          <Link href="/coleccion/ofertas" className="text-zinc-600 hover:text-zinc-900">
            Ofertas
          </Link>
          <Link href="/pedidos" className="text-zinc-600 hover:text-zinc-900">
            Mis pedidos
          </Link>
        </nav>
        <Link href="/carrito" className="relative rounded-full border border-zinc-300 px-3 py-1 text-sm">
          Carrito{count > 0 ? ` (${count})` : ""}
        </Link>
        {loading ? null : user ? (
          <button type="button" onClick={() => signOut()} className="text-sm text-zinc-500 underline">
            Salir
          </button>
        ) : (
          <Link href="/login" className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white">
            Entrar
          </Link>
        )}
      </div>
    </header>
  );
}
