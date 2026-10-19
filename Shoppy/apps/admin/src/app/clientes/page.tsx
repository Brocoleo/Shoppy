"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, useAdminSession } from "../../lib/supabase";
import { isTestOrder, useModo } from "../../lib/modo";
import { QueryState } from "../../components/QueryState";

interface Row {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  created_at: string;
  orderCount: number;
}

async function fetchCustomers(includeTest: boolean): Promise<Row[]> {
  const [{ data: profiles, error }, { data: orders, error: ordersError }] = await Promise.all([
    supabase.from("profiles").select("id,email,full_name,role,created_at").order("created_at", { ascending: false }).limit(200),
    supabase.from("orders").select("user_id,mode").limit(2000),
  ]);
  if (error ?? ordersError) throw error ?? ordersError;
  const counts = new Map<string, number>();
  for (const o of (orders ?? []) as { user_id: string | null; mode?: string | null }[]) {
    if (!o.user_id) continue;
    if (!includeTest && isTestOrder(o)) continue;
    counts.set(o.user_id, (counts.get(o.user_id) ?? 0) + 1);
  }
  return ((profiles ?? []) as Omit<Row, "orderCount">[]).map((p) => ({
    ...p,
    orderCount: counts.get(p.id) ?? 0,
  }));
}

export default function CustomersPage() {
  const { email: myEmail } = useAdminSession();
  const { includeTest } = useModo();
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { data: rows = [], isLoading, isError, refetch } = useQuery({ queryKey: ["admin-customers", includeTest], queryFn: () => fetchCustomers(includeTest) });

  const toggleRole = useMutation({
    mutationFn: async (r: Row) => {
      if (r.email === myEmail) throw new Error("No puedes cambiar tu propio rol.");
      const { error } = await supabase
        .from("profiles")
        .update({ role: r.role === "admin" ? "customer" : "admin" })
        .eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-customers"] }),
    onError: (e) => setError(e instanceof Error ? e.message : "Error"),
  });

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight">Clientes · {rows.length}</h1>
      <p className="text-sm text-zinc-600">
        {includeTest ? (
          <>
            <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">Desarrollo</span>{" "}
            · el contador de pedidos incluye pruebas
          </>
        ) : (
          <>
            <span className="inline-flex items-center rounded-full border border-green-300 bg-green-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-800">Producción</span>{" "}
            · el contador de pedidos excluye pruebas
          </>
        )}
      </p>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <QueryState isLoading={isLoading} isError={isError} isEmpty={!isLoading && !isError && rows.length === 0} emptyText="Sin clientes todavía." onRetry={() => refetch()} />
      <div className="rounded border border-zinc-200 bg-white divide-y divide-zinc-100 text-sm">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-3 p-3">
            <span className="flex-1">
              <strong>{r.full_name || r.email}</strong>
              <span className="text-zinc-500"> · {r.email} · {r.orderCount} pedidos · {r.role}</span>
            </span>
            <button
              className="text-xs underline"
              onClick={() => confirm(`Cambiar ${r.email} a ${r.role === "admin" ? "customer" : "admin"}?`) && toggleRole.mutate(r)}
            >
              {r.role === "admin" ? "Quitar admin" : "Hacer admin"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
