"use client";

import { useEffect, useState } from "react";
import type { DbBrand, DbCategory, DbProduct, DbProductCondition } from "@shopy/types";
import { formatCLP, supabase } from "../lib/supabase";

const CONDITIONS: { value: DbProductCondition; label: string }[] = [
  { value: "como_nuevo", label: "Como nuevo" },
  { value: "excelente", label: "Excelente" },
  { value: "bueno", label: "Bueno" },
  { value: "con_detalles", label: "Con detalles" },
];

export interface ProductFormValue {
  slug: string;
  name: string;
  description: string;
  brand_id: string;
  category_id: string;
  subcategory_id: string;
  segment: string;
  price_clp: number;
  compare_at_price_clp: string;
  condition: DbProductCondition;
  size: string;
  color: string;
  sku: string;
  stock: number;
  availability: string;
  published: boolean;
  tags: string;
  is_featured: boolean;
}

export function toFormValue(p: Partial<DbProduct> & { published?: boolean }): ProductFormValue {
  return {
    slug: p.slug ?? "",
    name: p.name ?? "",
    description: (p.description as string | null) ?? "",
    brand_id: p.brand_id ?? "",
    category_id: p.category_id ?? "",
    subcategory_id: p.subcategory_id ?? "",
    segment: p.segment ?? "",
    price_clp: p.price_clp ?? 0,
    compare_at_price_clp: p.compare_at_price_clp != null ? String(p.compare_at_price_clp) : "",
    condition: (p.condition as DbProductCondition | undefined) ?? "bueno",
    size: p.size ?? "",
    color: p.color ?? "",
    sku: (p as { sku?: string | null }).sku ?? "",
    stock: p.stock ?? 1,
    availability: p.availability ?? "AVAILABLE",
    published: p.published ?? (p as { published_at?: string | null }).published_at != null,
    tags: (p.tags ?? []).join(", "),
    is_featured: p.is_featured ?? false,
  };
}

export function toRow(v: ProductFormValue): Record<string, unknown> {
  return {
    slug: v.slug.trim(),
    name: v.name.trim(),
    description: v.description.trim() || null,
    brand_id: v.brand_id || null,
    category_id: v.category_id || null,
    subcategory_id: v.subcategory_id || null,
    segment: v.segment.trim() || null,
    price_clp: Math.max(0, Math.round(Number(v.price_clp) || 0)),
    compare_at_price_clp: v.compare_at_price_clp === "" ? null : Math.max(0, Math.round(Number(v.compare_at_price_clp) || 0)),
    condition: v.condition,
    size: v.size.trim() || null,
    color: v.color.trim() || null,
    sku: v.sku.trim() || null,
    stock: Math.max(0, Math.round(Number(v.stock) || 0)),
    availability: v.availability,
    published_at: v.published ? new Date().toISOString() : null,
    tags: v.tags.split(",").map((t) => t.trim()).filter(Boolean),
    is_featured: v.is_featured,
  };
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function ProductForm({
  initial,
  onSave,
  saving,
  serverError,
}: {
  initial: ProductFormValue;
  onSave: (v: ProductFormValue) => void;
  saving: boolean;
  serverError: string | null;
}) {
  const [v, setV] = useState(initial);
  const [brands, setBrands] = useState<DbBrand[]>([]);
  const [categories, setCategories] = useState<DbCategory[]>([]);
  const set = <K extends keyof ProductFormValue>(k: K, val: ProductFormValue[K]) =>
    setV((s) => ({ ...s, [k]: val }));

  useEffect(() => {
    (async () => {
      const [{ data: b }, { data: c }] = await Promise.all([
        supabase.from("brands").select("id,slug,name").order("name"),
        supabase.from("categories").select("id,slug,name,parent_id").order("sort_order"),
      ]);
      setBrands((b ?? []) as DbBrand[]);
      setCategories((c ?? []) as DbCategory[]);
    })();
  }, []);

  const parents = categories.filter((c) => !c.parent_id);
  const subs = categories.filter((c) => c.parent_id);

  return (
    <div className="flex flex-col gap-3 max-w-2xl">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nombre *">
          <input
            className={inputCls}
            value={v.name}
            onChange={(e) => {
              const name = e.target.value;
              setV((s) => ({ ...s, name, slug: s.slug || slugify(name) }));
            }}
          />
        </Field>
        <Field label="Slug *">
          <input className={inputCls} value={v.slug} onChange={(e) => set("slug", e.target.value)} />
        </Field>
      </div>
      <Field label="Descripción">
        <textarea className={inputCls} rows={3} value={v.description} onChange={(e) => set("description", e.target.value)} />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Marca">
          <select className={inputCls} value={v.brand_id} onChange={(e) => set("brand_id", e.target.value)}>
            <option value="">—</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Categoría">
          <select className={inputCls} value={v.category_id} onChange={(e) => set("category_id", e.target.value)}>
            <option value="">—</option>
            {parents.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Subcategoría">
          <select className={inputCls} value={v.subcategory_id} onChange={(e) => set("subcategory_id", e.target.value)}>
            <option value="">—</option>
            {subs.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Precio CLP *">
          <input type="number" min={0} className={inputCls} value={v.price_clp} onChange={(e) => set("price_clp", Number(e.target.value))} />
        </Field>
        <Field label="Precio anterior">
          <input className={inputCls} value={v.compare_at_price_clp} onChange={(e) => set("compare_at_price_clp", e.target.value)} placeholder="Opcional" />
        </Field>
        <Field label="Stock *">
          <input type="number" min={0} className={inputCls} value={v.stock} onChange={(e) => set("stock", Number(e.target.value))} />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Condición">
          <select className={inputCls} value={v.condition} onChange={(e) => set("condition", e.target.value as DbProductCondition)}>
            {CONDITIONS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Talla">
          <input className={inputCls} value={v.size} onChange={(e) => set("size", e.target.value)} />
        </Field>
        <Field label="Color">
          <input className={inputCls} value={v.color} onChange={(e) => set("color", e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="SKU">
          <input className={inputCls} value={v.sku} onChange={(e) => set("sku", e.target.value)} />
        </Field>
        <Field label="Segmento">
          <input className={inputCls} value={v.segment} onChange={(e) => set("segment", e.target.value)} placeholder="mujer / hombre…" />
        </Field>
        <Field label="Disponibilidad">
          <select className={inputCls} value={v.availability} onChange={(e) => set("availability", e.target.value)}>
            {["AVAILABLE", "RESERVED", "SOLD", "ARCHIVED"].map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Tags (coma)">
        <input className={inputCls} value={v.tags} onChange={(e) => set("tags", e.target.value)} placeholder="denim, chaqueta, otoño" />
      </Field>
      <div className="flex gap-6 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={v.published} onChange={(e) => set("published", e.target.checked)} />
          Publicado
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={v.is_featured} onChange={(e) => set("is_featured", e.target.checked)} />
          Destacado (home)
        </label>
      </div>
      {serverError ? <p className="text-sm text-red-700">{serverError}</p> : null}
      <button
        onClick={() => onSave(v)}
        disabled={saving || !v.name.trim() || !v.slug.trim()}
        className="rounded-full bg-zinc-900 text-white h-12 text-sm font-semibold disabled:opacity-50 w-56"
      >
        {saving ? "Guardando…" : "Guardar producto"}
      </button>
      <p className="text-xs text-zinc-500">Referencia: {formatCLP(Number(v.price_clp) || 0)}</p>
    </div>
  );
}

const inputCls = "rounded border border-zinc-300 px-3 h-11 text-sm w-full bg-white";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-zinc-500">
      {label}
      {children}
    </label>
  );
}
