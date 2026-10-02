"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatCLP, supabase } from "../../lib/supabase";

interface Row {
  id: string;
  order_number: string;
  status: string;
  total_clp: number;
  created_at: string;
}

const FILTERS = ["all", "PENDING_PAYMENT", "PAID", "PREPARING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"];

async function fetchOrders(): Promise<Row[]> {
  const { data, error } = await supabase
    .from("orders")
    .select("id,order_number,status,total_clp,created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as Row[];
}

export default function OrdersPage() {
  const [filter, setFilter] = useState("all");
  const { data: rows = [], isLoading } = useQuery({ queryKey: ["admin-orders"], queryFn: fetchOrders });
  const filtered = filter === "all" ? rows : rows.filter((r) => r.status === filter);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight">Pedidos · {filtered.length}</h1>
      <select aria-label="Filtro estado" className="rounded border border-zinc-300 px-3 h-11 text-sm w-56" value={filter} onChange={(e) => setFilter(e.target.value)}>
        <option value="all">Todos</option>
        {FILTERS.slice(1).map((f) => (
          <option key={f} value={f}>{f}</option>
        ))}
      </select>
      {isLoading ? <p className="text-sm text-zinc-500">Cargando…</p> : null}
      <div className="rounded border border-zinc-200 bg-white divide-y divide-zinc-100">
        {filtered.map((r) => (
          <Link key={r.id} href={`/pedidos/${r.id}`} className="flex items-center gap-3 p-3 text-sm hover:bg-zinc-50">
            <div className="flex-1">
              <p className="font-medium">{r.order_number}</p>
              <p className="text-xs text-zinc-500">
                {new Date(r.created_at).toLocaleDateString("es-CL")} · {r.status}
              </p>
            </div>
            <span className="font-semibold">{formatCLP(r.total_clp)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
