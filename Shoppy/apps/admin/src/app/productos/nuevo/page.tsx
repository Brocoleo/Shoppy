"use client";

import { isExampleProduct } from "@shopy/shared/editorial";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { supabase } from "../../../lib/supabase";
import {
  ProductForm,
  toFormValue,
  toRow,
  type ProductFormValue,
} from "../../../components/ProductForm";

function NewProductPage() {
  const router = useRouter();
  const params = useSearchParams();
  const base = params.get("base");
  const source = useQuery({
    queryKey: ["example-base", base], enabled: Boolean(base), retry: false,
    queryFn: async () => {
      if (!base || !/^[0-9a-f-]{36}$/i.test(base)) throw new Error("Ejemplo no válido.");
      const result = await supabase.from("products").select("id,category_id,segment,metadata").eq("id", base).single();
      if (result.error || !result.data || !isExampleProduct(result.data)) throw new Error("No se pudo cargar el ejemplo. Vuelve al listado e inténtalo de nuevo.");
      return result.data;
    },
  });
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

  if (base && source.isPending) return <p>Cargando ejemplo…</p>;
  if (base && source.isError) return <p role="alert">{source.error.message}</p>;
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
      {base ? <p className="text-sm text-zinc-600">Borrador nuevo a partir de un ejemplo. Solo copiamos categoría y segmento. Completa los datos reales y añade fotografías nuevas.</p> : null}
      <ProductForm
        key={base ?? "new"}
        initial={toFormValue({ published: false, category_id: source.data?.category_id, segment: source.data?.segment })}
        onSave={save}
        saving={saving}
        serverError={error}
      />
    </div>
  );
}

export default function NewProductEntry() {
  return <Suspense fallback={<p>Cargando formulario…</p>}><NewProductPage /></Suspense>;
}
