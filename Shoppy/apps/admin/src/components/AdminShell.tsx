"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminSessionProvider, useAdminSession } from "../lib/supabase";
import { ModoProvider } from "../lib/modo";
import { ModoSwitch } from "./ModoSwitch";

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
  { href: "/editorial", label: "Foto editorial" },
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
    return <p className="p-8 text-sm text-muted">Cargando sesión…</p>;
  if (!session || role !== "admin")
    return <p className="p-8 text-sm text-muted">Redirigiendo…</p>;

  return (
    <div className="min-h-full flex flex-col md:flex-row">
      <aside className="w-full shrink-0 border-b border-line bg-white p-4 md:w-52 md:border-r md:border-b-0">
        <p className="px-2 pb-3 font-display text-3xl">vinta.zhe</p>
        <ModoSwitch />
        <nav
          aria-label="Administración"
          className="flex gap-2 overflow-x-auto pb-2 md:flex-col md:overflow-visible"
        >
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={pathname === n.href ? "page" : undefined}
              className={`flex min-h-11 shrink-0 items-center rounded px-3 py-2 text-sm transition-colors ${
                pathname === n.href
                  ? "bg-carbon font-semibold text-ivory"
                  : "text-muted hover:bg-parchment hover:text-carbon"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto pt-4 border-t border-line">
          <p className="px-2 text-xs text-muted truncate">{email}</p>
          <button
            onClick={() => signOut().then(() => router.replace("/login"))}
            className="btn-press mt-1 w-full rounded px-2 py-2 text-left text-sm text-muted hover:bg-parchment hover:text-carbon"
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
        <ModoProvider>
          <Shell>{children}</Shell>
        </ModoProvider>
      </AdminSessionProvider>
    </QueryClientProvider>
  );
}
