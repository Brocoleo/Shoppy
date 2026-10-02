"use client";

import { use, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { ProductForm, toFormValue, toRow, type ProductFormValue } from "../../../components/ProductForm";

interface DbImage {
  id: string;
  storage_path: string;
  sort_order: number;
  is_cover: boolean;
  is_defect_detail: boolean;
}

function publicUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  return `${base}/storage/v1/object/public/product-images/${path}`;
}

async function fetchProduct(id: string) {
  const { data, error } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as (Record<string, unknown> & { slug: string; published_at: string | null }) | null;
}

async function fetchImages(productId: string): Promise<DbImage[]> {
  const { data, error } = await supabase
    .from("product_images")
    .select("id,storage_path,sort_order,is_cover,is_defect_detail")
    .eq("product_id", productId)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as DbImage[];
}

export default function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [slug, setSlug] = useState("");

  const productQuery = useQuery({ queryKey: ["admin-product", id], queryFn: () => fetchProduct(id) });
  const imagesQuery = useQuery({ queryKey: ["admin-images", id], queryFn: () => fetchImages(id) });
  const images = imagesQuery.data ?? [];

  const refreshImages = () => queryClient.invalidateQueries({ queryKey: ["admin-images", id] });

  const save = async (v: ProductFormValue) => {
    setSaving(true);
    setError(null);
    setSaved(false);
    const { error: err } = await supabase.from("products").update(toRow(v)).eq("id", id);
    if (err) setError(err.message);
    else {
      setSaved(true);
      setSlug(v.slug);
      queryClient.invalidateQueries({ queryKey: ["admin-product", id] });
    }
    setSaving(false);
  };

  const mutateImage = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => fn(),
    onSuccess: refreshImages,
    onError: (e) => setError(e instanceof Error ? e.message : "Error en imágenes"),
  });

  if (productQuery.isLoading) return <p className="text-sm text-zinc-500">Cargando…</p>;
  if (productQuery.isError || !productQuery.data) {
    return <p className="text-sm text-red-700">Producto no encontrado.</p>;
  }
  const row = productQuery.data;
  const initial = toFormValue({ ...(row as object), published: row.published_at != null } as never);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight">Editar producto</h1>
      <ProductForm initial={initial} onSave={save} saving={saving} serverError={error} />
      {saved ? <p className="text-sm text-green-700">Guardado.</p> : null}
      <ImagesManager
        productId={id}
        slug={slug || row.slug}
        images={images}
        onUpload={async (files) => {
          const base = Math.max(0, ...images.map((i) => i.sort_order), -1) + 1;
          let order = base;
          for (const file of Array.from(files)) {
            const safe = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-");
            const path = `products/${slug || row.slug}/${Date.now()}-${safe}`;
            const { error: upErr } = await supabase.storage.from("product-images").upload(path, file, {
              contentType: file.type || "image/jpeg",
              upsert: false,
            });
            if (upErr) throw new Error(upErr.message);
            const { error: rowErr } = await supabase.from("product_images").insert({
              product_id: id,
              storage_path: path,
              sort_order: order++,
              is_cover: images.length === 0 && order === base + 1,
              is_defect_detail: false,
            });
            if (rowErr) throw new Error(rowErr.message);
          }
        }}
        onCover={async (img) => {
          await supabase.from("product_images").update({ is_cover: false }).eq("product_id", id);
          const { error } = await supabase.from("product_images").update({ is_cover: true }).eq("id", img.id);
          if (error) throw error;
        }}
        onDefect={async (img) => {
          const { error } = await supabase
            .from("product_images")
            .update({ is_defect_detail: !img.is_defect_detail })
            .eq("id", img.id);
          if (error) throw error;
        }}
        onMove={async (img, dir) => {
          const sorted = [...images].sort((a, b) => a.sort_order - b.sort_order);
          const idx = sorted.findIndex((i) => i.id === img.id);
          const other = sorted[idx + dir];
          if (!other) return;
          await supabase.from("product_images").update({ sort_order: other.sort_order }).eq("id", img.id);
          const { error } = await supabase.from("product_images").update({ sort_order: img.sort_order }).eq("id", other.id);
          if (error) throw error;
        }}
        onRemove={async (img) => {
          await supabase.storage.from("product-images").remove([img.storage_path]);
          const { error } = await supabase.from("product_images").delete().eq("id", img.id);
          if (error) throw error;
        }}
        mutate={mutateImage.mutate}
        busy={mutateImage.isPending}
        error={mutateImage.isError ? "Operación de imagen fallida." : null}
      />
    </div>
  );
}

function ImagesManager({
  slug,
  images,
  onUpload,
  onCover,
  onDefect,
  onMove,
  onRemove,
  mutate,
  busy,
  error,
}: {
  productId: string;
  slug: string;
  images: DbImage[];
  onUpload: (files: FileList) => Promise<void>;
  onCover: (img: DbImage) => Promise<void>;
  onDefect: (img: DbImage) => Promise<void>;
  onMove: (img: DbImage, dir: -1 | 1) => Promise<void>;
  onRemove: (img: DbImage) => Promise<void>;
  mutate: (fn: () => Promise<unknown>) => void;
  busy: boolean;
  error: string | null;
}) {
  void slug;
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Fotografías · {images.length}</h2>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <label className="text-sm">
        <span className="rounded-full border border-zinc-300 px-4 py-2 cursor-pointer inline-block">
          {busy ? "Procesando…" : "Subir fotos"}
        </span>
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          disabled={busy}
          onChange={(e) => e.target.files && mutate(() => onUpload(e.target.files as FileList))}
        />
      </label>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {images.map((img) => (
          <div key={img.id} className="rounded border border-zinc-200 bg-white p-2 flex flex-col gap-1 text-xs">
            {/* remote storage URL: next/image requeriría remotePatterns; img simple es suficiente aquí */}
            <img src={publicUrl(img.storage_path)} alt="" className="w-full aspect-[3/4] object-cover rounded" />
            <p className="text-zinc-500">
              #{img.sort_order}
              {img.is_cover ? " · portada" : ""}
              {img.is_defect_detail ? " · defecto" : ""}
            </p>
            <div className="flex flex-wrap gap-x-2 gap-y-1">
              {!img.is_cover ? <button className="underline" onClick={() => mutate(() => onCover(img))}>Portada</button> : null}
              <button className="underline" onClick={() => mutate(() => onDefect(img))}>
                {img.is_defect_detail ? "Quitar defecto" : "Marcar defecto"}
              </button>
              <button className="underline" onClick={() => mutate(() => onMove(img, -1))}>←</button>
              <button className="underline" onClick={() => mutate(() => onMove(img, 1))}>→</button>
              <button
                className="underline text-red-700"
                onClick={() => confirm("Eliminar esta foto?") && mutate(() => onRemove(img))}
              >
                Eliminar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
