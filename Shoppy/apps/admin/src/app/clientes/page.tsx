"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, useAdminSession } from "../../lib/supabase";

interface Row {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  created_at: string;
  orderCount: number;
}

async function fetchCustomers(): Promise<Row[]> {
  const [{ data: profiles, error }, { data: orders }] = await Promise.all([
    supabase.from("profiles").select("id,email,full_name,role,created_at").order("created_at", { ascending: false }).limit(200),
    supabase.from("orders").select("user_id"),
  ]);
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const o of (orders ?? []) as { user_id: string | null }[]) {
    if (o.user_id) counts.set(o.user_id, (counts.get(o.user_id) ?? 0) + 1);
  }
  return ((profiles ?? []) as Omit<Row, "orderCount">[]).map((p) => ({
    ...p,
    orderCount: counts.get(p.id) ?? 0,
  }));
}

export default function CustomersPage() {
  const { email: myEmail } = useAdminSession();
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { data: rows = [] } = useQuery({ queryKey: ["admin-customers"], queryFn: fetchCustomers });

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
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
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
