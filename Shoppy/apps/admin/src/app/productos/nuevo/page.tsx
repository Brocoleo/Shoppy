"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "../../../lib/supabase";
import { ProductForm, toFormValue, toRow, type ProductFormValue } from "../../../components/ProductForm";

export default function NewProductPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (v: ProductFormValue) => {
    setSaving(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("products")
      .insert(toRow(v))
      .select("id")
      .single();
    if (err || !data) {
      setError(err?.message ?? "No se pudo crear.");
      setSaving(false);
      return;
    }
    router.replace(`/productos/${(data as { id: string }).id}`);
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight">Nuevo producto</h1>
      <ProductForm
        initial={toFormValue({ published: false })}
        onSave={save}
        saving={saving}
        serverError={error}
      />
    </div>
  );
}
