"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatCLP, supabase } from "../../lib/supabase";
import { isTestOrder, useModo } from "../../lib/modo";

interface Row {
  id: string;
  order_number: string;
  status: string;
  total_clp: number;
  created_at: string;
  mode?: string | null;
}

const FILTERS = ["all", "PENDING_PAYMENT", "PAID", "PREPARING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"];

async function fetchOrders(): Promise<Row[]> {
  const { data, error } = await supabase
    .from("orders")
    .select("id,order_number,status,total_clp,created_at,mode")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as Row[];
}

export default function OrdersPage() {
  const [filter, setFilter] = useState("all");
  const { includeTest } = useModo();
  const { data: rows = [], isLoading, isError, refetch } = useQuery({ queryKey: ["admin-orders"], queryFn: fetchOrders });

  const modeFiltered = includeTest ? rows : rows.filter((r) => !isTestOrder(r));
  const statusFiltered = filter === "all" ? modeFiltered : modeFiltered.filter((r) => r.status === filter);
  const filtered = statusFiltered;
  const reales = rows.filter((r) => !isTestOrder(r)).length;
  const tests = rows.length - reales;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-serif text-3xl tracking-tight">Pedidos</h1>

      <p className="text-sm text-zinc-600">
        {includeTest ? (
          <>
            <Chip tone="test">Desarrollo</Chip> · reales + de prueba (
            {rows.length})
          </>
        ) : (
          <>
            <Chip tone="live">Producción</Chip> · solo reales ({reales})
            {tests > 0 ? (
              <span className="text-zinc-500">
                {" "}
                · {tests} de prueba oculto{tests === 1 ? "" : "s"} (cambia a
                Desarrollo arriba)
              </span>
            ) : null}
          </>
        )}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <select aria-label="Filtro estado" className="rounded border border-zinc-300 px-3 h-10 text-sm" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">Todos los estados</option>
          {FILTERS.slice(1).map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
        <span className="text-sm text-zinc-500">{filtered.length} pedido{filtered.length === 1 ? "" : "s"}</span>
      </div>

      {isLoading ? <p className="text-sm text-zinc-500">Cargando…</p> : null}
      {isError ? (
        <div className="rounded border border-red-200 bg-red-50 p-4 text-sm">
          <p className="font-medium text-red-800">No se pudieron cargar los pedidos</p>
          <p className="text-red-600">Si tu usuario no es admin, RLS los oculta: revisa tu rol en profiles.</p>
          <button type="button" onClick={() => refetch()} className="mt-2 rounded bg-red-700 px-3 h-9 text-white text-sm">
            Reintentar
          </button>
        </div>
      ) : null}

      <div className="overflow-hidden rounded border border-zinc-200 bg-white">
        {filtered.length === 0 && !isLoading && !isError ? (
          <p className="p-6 text-sm text-zinc-500">Sin pedidos para este filtro.</p>
        ) : null}
        <ul className="divide-y divide-zinc-100">
          {filtered.map((r) => (
            <li key={r.id}>
              <Link href={`/pedidos/${r.id}`} className="flex items-center gap-3 p-3 text-sm hover:bg-zinc-50">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-medium">
                    {r.order_number}
                    {isTestOrder(r) ? (
                      <span className="inline-flex shrink-0 items-center rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">Prueba</span>
                    ) : null}
                  </p>
                  <p className="flex items-center gap-1.5 text-xs text-zinc-500">
                    <StatusDot status={r.status} />
                    {new Date(r.created_at).toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} · {r.status}
                  </p>
                </div>
                <span className="tnum shrink-0 font-semibold">{formatCLP(r.total_clp)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Chip({ tone, children }: { tone: "test" | "live"; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        tone === "test"
          ? "border-amber-300 bg-amber-100 text-amber-800"
          : "border-green-300 bg-green-50 text-green-800"
      }`}
    >
      {children}
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  const color: Record<string, string> = {
    PAID: "bg-green-600", PREPARING: "bg-blue-600", SHIPPED: "bg-sky-500",
    DELIVERED: "bg-green-700", PENDING_PAYMENT: "bg-amber-500",
    REFUNDED: "bg-yellow-500", CANCELLED: "bg-zinc-400",
  };
  return <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${color[status] ?? "bg-zinc-300"}`} />;
}
