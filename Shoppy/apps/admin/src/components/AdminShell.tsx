"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminSessionProvider, useAdminSession } from "../lib/supabase";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/productos", label: "Productos" },
  { href: "/pedidos", label: "Pedidos" },
  { href: "/categorias", label: "Categorías" },
  { href: "/marcas", label: "Marcas" },
  { href: "/colecciones", label: "Colecciones" },
  { href: "/descuentos", label: "Descuentos" },
  { href: "/envios", label: "Envíos" },
  { href: "/home", label: "Home" },
  { href: "/clientes", label: "Clientes" },
];

function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const publicPage = pathname === "/login" || pathname === "/acceso";
  const { session, role, email, loading, signOut } = useAdminSession();

  useEffect(() => {
    if (!loading && !publicPage && (!session || role !== "admin")) {
      router.replace("/login");
    }
  }, [loading, session, role, publicPage, router]);

  if (publicPage) return <>{children}</>;
  if (loading)
    return <p className="p-8 text-sm text-zinc-500">Cargando sesión…</p>;
  if (!session || role !== "admin")
    return <p className="p-8 text-sm text-zinc-500">Redirigiendo…</p>;

  return (
    <div className="min-h-full flex flex-col md:flex-row">
      <aside className="w-full shrink-0 border-b border-zinc-200 bg-white p-4 md:w-52 md:border-r md:border-b-0">
        <p className="px-2 pb-3 font-serif text-3xl">vinta.zhe</p>
        <nav
          aria-label="Administración"
          className="flex gap-2 overflow-x-auto pb-2 md:flex-col md:overflow-visible"
        >
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`flex min-h-11 shrink-0 items-center rounded px-3 py-2 text-sm ${
                pathname === n.href
                  ? "bg-zinc-900 font-semibold text-white"
                  : "text-zinc-700 hover:bg-zinc-100"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto pt-4 border-t border-zinc-200">
          <p className="px-2 text-xs text-zinc-500 truncate">{email}</p>
          <button
            onClick={() => signOut().then(() => router.replace("/login"))}
            className="mt-1 w-full rounded px-2 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 sm:p-6 max-w-6xl">{children}</main>
    </div>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AdminSessionProvider>
        <Shell>{children}</Shell>
      </AdminSessionProvider>
    </QueryClientProvider>
  );
}
