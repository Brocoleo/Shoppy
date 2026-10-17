"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "../../../lib/supabase";
import {
  ProductForm,
  toFormValue,
  toRow,
  type ProductFormValue,
} from "../../../components/ProductForm";

export default function NewProductPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (v: ProductFormValue) => {
    setSaving(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("products")
        .insert(toRow({ ...v, published: false }, null))
        .select("id")
        .single();
      if (err || !data) {
        setError(
          err?.message ?? "No se pudo crear el borrador. Inténtalo de nuevo.",
        );
        return;
      }
      router.replace(`/productos/${(data as { id: string }).id}?paso=fotos`);
    } catch {
      setError(
        "No se pudo conectar. Comprueba tu conexión e inténtalo de nuevo.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs font-medium tracking-widest text-zinc-600">
        vinta.zhe · Administración
      </p>
      <h1 className="text-2xl font-bold tracking-tight">Nuevo producto</h1>
      <p className="max-w-xl text-sm text-zinc-600">
        Primero guarda un borrador. Después podrás añadir fotos, revisar los
        datos y publicar desde esta misma pantalla.
      </p>
      <ProductForm
        initial={toFormValue({ published: false })}
        onSave={save}
        saving={saving}
        serverError={error}
      />
    </div>
  );
}
