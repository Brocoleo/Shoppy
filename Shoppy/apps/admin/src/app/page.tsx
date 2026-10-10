"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { formatCLP, supabase } from "../lib/supabase";

interface Order {
  id: string;
  order_number: string;
  status: string;
  total_clp: number;
  created_at: string;
}

interface Product {
  id: string;
  name: string;
  price_clp: number;
  stock: number;
  availability: string;
  view_count: number;
  favorite_count: number;
}

const PAIDISH = new Set(["PAID", "PREPARING", "SHIPPED", "DELIVERED"]);

async function fetchDashboard() {
  const [oRes, pRes, iRes] = await Promise.all([
    supabase.from("orders").select("id,order_number,status,total_clp,created_at").order("created_at", { ascending: false }).limit(400),
    supabase.from("products").select("id,name,price_clp,stock,availability,view_count,favorite_count").order("trending_score", { ascending: false }).limit(200),
    supabase.from("order_items").select("qty"),
  ]);
  const firstError = oRes.error ?? pRes.error ?? iRes.error;
  if (firstError) throw firstError;
  const { data: o } = oRes;
  const { data: p } = pRes;
  const { data: items } = iRes;
  const orders = ((o ?? []) as Order[]).map((r) => ({ ...r, day: r.created_at.slice(0, 10), ts: Date.parse(r.created_at) }));
  const now = Date.now();
  const dayMs = 86_400_000;
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const key = new Date(now - (6 - i) * dayMs).toISOString().slice(0, 10);
    const total = orders
      .filter((oo) => PAIDISH.has(oo.status) && oo.day === key)
      .reduce((n, oo) => n + oo.total_clp, 0);
    return { key: key.slice(5), total };
  });
  return {
    now,
    orders,
    last7,
    products: (p ?? []) as Product[],
    soldQty: ((items ?? []) as { qty: number }[]).reduce((n, i) => n + i.qty, 0),
  };
}

export default function DashboardPage() {
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["dashboard"], queryFn: fetchDashboard });
  if (isLoading || !data) {
    if (isError) {
      return (
        <div className="rounded border border-red-200 bg-red-50 p-4 text-sm">
          <p className="font-medium text-red-800">No se pudo cargar el dashboard</p>
          <p className="text-red-600">Revisa tu conexión y tu rol admin (RLS oculta los datos).</p>
          <button type="button" onClick={() => refetch()} className="mt-2 rounded bg-red-700 px-3 h-9 text-white text-sm">
            Reintentar
          </button>
        </div>
      );
    }
    return <p className="text-sm text-zinc-500">Cargando dashboard…</p>;
  }

  const { orders, products, soldQty, last7, now } = data;
  const day = 86_400_000;
  const inRange = (ms: number) => orders.filter((o) => PAIDISH.has(o.status) && now - o.ts <= ms);
  const sum = (list: { total_clp: number }[]) => list.reduce((n, o) => n + o.total_clp, 0);
  const today = inRange(day);
  const week = inRange(7 * day);
  const month = inRange(30 * day);
  const ticket = week.length > 0 ? Math.round(sum(week) / week.length) : 0;
  const maxBar = Math.max(1, ...last7.map((b) => b.total));

  const topViewed = [...products].sort((a, b) => b.view_count - a.view_count).slice(0, 5);
  const topFav = [...products].sort((a, b) => b.favorite_count - a.favorite_count).slice(0, 5);
  const lowStock = products.filter((p) => p.availability !== "SOLD" && p.stock <= 2).slice(0, 8);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Ventas hoy" value={formatCLP(sum(today))} sub={`${today.length} pedidos`} />
        <Kpi label="Ventas 7 días" value={formatCLP(sum(week))} sub={`${week.length} pedidos`} />
        <Kpi label="Ventas 30 días" value={formatCLP(sum(month))} sub={`${month.length} pedidos`} />
        <Kpi label="Ticket promedio" value={formatCLP(ticket)} sub={`${soldQty} prendas vendidas`} />
      </div>

      <section className="rounded border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold mb-3">Ventas últimos 7 días</h2>
        <div className="flex items-end gap-2 h-32">
          {last7.map((b) => (
            <div key={b.key} className="flex-1 flex flex-col items-center gap-1" title={`${b.key}: ${formatCLP(b.total)}`}>
              <div className="w-full bg-zinc-900 rounded-sm" style={{ height: `${Math.max(4, (b.total / maxBar) * 100)}%` }} />
              <span className="text-[10px] text-zinc-500">{b.key}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="grid md:grid-cols-2 gap-3">
        <section className="rounded border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold mb-2">Más vistos</h2>
          {topViewed.map((p) => (
            <Row key={p.id} left={p.name} right={`${p.view_count} vistas`} />
          ))}
        </section>
        <section className="rounded border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold mb-2">Más guardados</h2>
          {topFav.map((p) => (
            <Row key={p.id} left={p.name} right={`${p.favorite_count} favs`} />
          ))}
        </section>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <section className="rounded border border-zinc-200 bg-white p-4">
          <div className="flex justify-between items-baseline mb-2">
            <h2 className="text-sm font-semibold">Stock bajo (≤ 2)</h2>
            <Link href="/productos" className="text-xs text-zinc-500 underline">Ver productos</Link>
          </div>
          {lowStock.length === 0 ? <p className="text-sm text-zinc-500">Sin alertas.</p> : null}
          {lowStock.map((p) => (
            <Row key={p.id} left={p.name} right={`stock ${p.stock}`} />
          ))}
        </section>
        <section className="rounded border border-zinc-200 bg-white p-4">
          <div className="flex justify-between items-baseline mb-2">
            <h2 className="text-sm font-semibold">Últimos pedidos</h2>
            <Link href="/pedidos" className="text-xs text-zinc-500 underline">Ver todos</Link>
          </div>
          {orders.slice(0, 6).map((o) => (
            <Row key={o.id} left={o.order_number} right={`${o.status} · ${formatCLP(o.total_clp)}`} />
          ))}
        </section>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded border border-zinc-200 bg-white p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-xl font-bold tracking-tight">{value}</p>
      <p className="text-xs text-zinc-500">{sub}</p>
    </div>
  );
}

function Row({ left, right }: { left: string; right: string }) {
  return (
    <div className="flex justify-between gap-2 py-1.5 border-b border-zinc-100 last:border-0 text-sm">
      <span className="truncate">{left}</span>
      <span className="shrink-0 text-zinc-500">{right}</span>
    </div>
  );
}
