"use client";

import { useSearchParams } from "next/navigation";
import { prepareImage } from "../../../lib/prepareImage";
import Link from "next/link";
import { isExampleProduct, isPublicProduct } from "@shopy/shared/editorial";
import { use, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import {
  ProductForm,
  toFormValue,
  toRow,
  type ProductFormValue,
} from "../../../components/ProductForm";

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
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as
    | (Record<string, unknown> & { slug: string; published_at: string | null })
    | null;
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

export default function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [progress, setProgress] = useState("");
  const [retryFiles, setRetryFiles] = useState<File[]>([]);
  const attempts = useRef(new Map<File, string>());
  const [slug, setSlug] = useState("");
  const [dirty, setDirty] = useState(false);
  const [stage, setStage] = useState<"datos" | "fotos" | "revision">(() => searchParams.get("paso") === "fotos" ? "fotos" : "datos");

  const productQuery = useQuery({
    queryKey: ["admin-product", id],
    queryFn: () => fetchProduct(id),
  });
  const imagesQuery = useQuery({
    queryKey: ["admin-images", id],
    queryFn: () => fetchImages(id),
  });
  const images = imagesQuery.data ?? [];
  const cleanupQuery = useQuery({
    queryKey: ["image-cleanup", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("image_cleanup")
        .select("storage_path")
        .eq("product_id", id);
      if (error) throw error;
      return (data ?? []) as { storage_path: string }[];
    },
  });
  const cleanStorage = async (path: string) => {
    const reference = await supabase
      .from("product_images")
      .select("id")
      .eq("storage_path", path)
      .limit(1);
    if (reference.error) throw reference.error;
    if (reference.data?.length) {
      const { error } = await supabase
        .from("image_cleanup")
        .delete()
        .eq("storage_path", path);
      if (error) throw error;
      return;
    }
    const { error } = await supabase.storage
      .from("product-images")
      .remove([path]);
    if (error) throw error;
    const { error: recordError } = await supabase
      .from("image_cleanup")
      .delete()
      .eq("storage_path", path);
    if (recordError) throw recordError;
  };

  const refreshImages = () =>
    queryClient.invalidateQueries({ queryKey: ["admin-images", id] });

  const save = async (v: ProductFormValue) => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      if (productQuery.data?.published_at && v.price_clp <= 0)
        throw new Error(
          "Una prenda publicada necesita precio positivo. Retírala de la web antes de dejar el precio pendiente.",
        );
      const values = toRow(
        v,
        null,
        (row.metadata as Record<string, unknown> | null) ?? null,
      );
      delete values.published_at;
      const result = await supabase
        .from("products")
        .update(values)
        .eq("id", id)
        .eq("updated_at", String(productQuery.data?.updated_at))
        .select("id");
      if (result.error) throw result.error;
      if (!result.data?.length)
        throw new Error(
          "Otra sesión modificó esta prenda. Recarga antes de guardar.",
        );
      await queryClient.invalidateQueries({ queryKey: ["admin-product", id] });
      setDirty(false);
      setSaved(true);
      setSlug(v.slug);
      setStage("fotos");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudieron guardar los datos.",
      );
    } finally {
      setSaving(false);
    }
  };

  const mutateImage = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => fn(),
    onMutate: () => setError(null),
    onSettled: () => {
      void refreshImages();
      void cleanupQuery.refetch();
    },
    onError: (e) =>
      setError(e instanceof Error ? e.message : "Error en imágenes"),
  });

  if (productQuery.isLoading)
    return <p className="text-sm text-zinc-500">Cargando…</p>;
  if (productQuery.isError || !productQuery.data) {
    return <p className="text-sm text-red-700">Producto no encontrado.</p>;
  }
  const row = productQuery.data;
  if (isExampleProduct({ id: String(row.id), metadata: row.metadata as Record<string, unknown> | null })) return (
    <section className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">Ejemplo · {String(row.name)}</h1>
      <p>Registro de prueba conservado como referencia. No se edita ni se publica como una prenda real.</p>
      <p>Al usarlo como base se crea una prenda nueva; solo se copian categoría y segmento.</p>
      <Link href={`/productos/nuevo?base=${id}`} className="inline-flex min-h-11 items-center bg-zinc-900 px-4 text-white">Usar como base</Link>
      <Link href="/productos" className="ml-4 inline-flex min-h-11 items-center underline">Volver a productos</Link>
    </section>
  );
  const initial = toFormValue({
    ...(row as object),
    published: row.published_at != null,
  } as never);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight">Editar producto</h1>
      <nav aria-label="Pasos del producto" className="flex flex-wrap gap-2">
        {(["datos", "fotos", "revision"] as const).map((step, index) => (
          <button
            key={step}
            disabled={saving || (dirty && step !== "datos")}
            aria-current={stage === step ? "step" : undefined}
            onClick={() => setStage(step)}
            className={`min-h-11 px-4 ${stage === step ? "bg-zinc-900 text-white" : "border border-zinc-300"}`}
          >
            {index + 1}.{" "}
            {step === "datos"
              ? "Datos"
              : step === "fotos"
                ? "Fotos"
                : "Revisión"}
          </button>
        ))}
      </nav>
      {stage === "datos" ? (
        <ProductForm
          onDirty={() => setDirty(true)}
          initial={initial}
          onSave={save}
          saving={saving}
          serverError={error}
        />
      ) : null}
      {stage === "revision" ? (
        <section className="max-w-2xl space-y-4 rounded border border-zinc-200 bg-white p-4">
          <h2 className="text-xl font-semibold">Revisar antes de publicar</h2>
          <p className="font-medium">{String(row.name)}</p>
          <p>
            Precio: ${Number(row.price_clp).toLocaleString("es-CL")} · Stock:{" "}
            {Number(row.stock)}
          </p>
          <p>
            {images.length} fotos ·{" "}
            {row.published_at ? "Publicado" : "Borrador"}
          </p>
          <p className="text-sm text-zinc-600">
            Se publican los datos guardados. Confirma que las fotos y la
            disponibilidad corresponden a esta prenda.
          </p>
          <button
            disabled={
              saving ||
              !String(row.name ?? "").trim() ||
              Number(row.price_clp) <= 0 ||
              Number(row.stock) <= 0 ||
              !row.category_id || !row.size || !row.color || !row.condition ||
              row.availability !== "AVAILABLE" ||
              !images.some((i) => i.is_cover) ||
              !isPublicProduct({
                id: String(row.id),
                metadata: row.metadata as Record<string, unknown> | null,
              })
            }
            onClick={async () => {
              setSaving(true);
              setError(null);
              try {
                const result = await supabase
                  .from("products")
                  .update({
                    published_at: row.published_at ?? new Date().toISOString(),
                  })
                  .eq("id", id)
                  .eq("updated_at", String(row.updated_at))
                  .select("id");
                if (result.error) throw result.error;
                if (!result.data?.length)
                  throw new Error(
                    "La prenda cambió en otra sesión. Recarga antes de publicar.",
                  );
                await queryClient.invalidateQueries({
                  queryKey: ["admin-product", id],
                });
                setSaved(true);
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "No se pudo publicar.",
                );
              } finally {
                setSaving(false);
              }
            }}
            className="min-h-12 w-full bg-zinc-900 px-5 text-white disabled:opacity-50"
          >
            {saving
              ? "Publicando…"
              : row.published_at
                ? "Confirmar publicación"
                : "Publicar producto"}
          </button>
          {Number(row.price_clp) <= 0 ||
          Number(row.stock) <= 0 ||
          !row.category_id || !row.size || !row.color || !row.condition ||
          !images.some((i) => i.is_cover) ? (
            <p className="text-sm text-zinc-600">
              Para publicar necesitas categoría, talla, color, estado, precio positivo, stock y una foto de portada.
            </p>
          ) : null}
          {row.published_at ? (
            <button
              className="min-h-11 underline"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                const result = await supabase
                  .from("products")
                  .update({ published_at: null })
                  .eq("id", id);
                if (result.error) setError(result.error.message);
                else
                  await queryClient.invalidateQueries({
                    queryKey: ["admin-product", id],
                  });
                setSaving(false);
              }}
            >
              Retirar de la web y guardar como borrador
            </button>
          ) : null}
          {error ? (
            <p role="alert" className="text-red-700">
              {error}
            </p>
          ) : null}
        </section>
      ) : null}
      <div hidden={stage !== "fotos"}>
        {dirty ? (
          <p role="status" className="text-sm text-zinc-600">
            Guarda los datos para continuar a las fotos o la revisión.
          </p>
        ) : null}
        {saved ? <p className="text-sm text-green-700">Guardado.</p> : null}
        <ImagesManager
          productId={id}
          slug={slug || row.slug}
          images={images}
          onUpload={async (files) => {
            const selected = Array.from(files);

            let completed = 0;
            const base = Math.max(-1, ...images.map((i) => i.sort_order)) + 1;
            for (const original of selected) {
              setRetryFiles(selected.slice(completed));
              const file = await prepareImage(original);
              setProgress(
                `Subiendo ${completed + 1} de ${selected.length}: ${file.name}`,
              );
              const safe = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-");
              const path =
                attempts.current.get(original) ??
                `products/${slug || row.slug}/${crypto.randomUUID()}-${safe}`;
              attempts.current.set(original, path);
              try {
                const prior = await supabase
                  .from("product_images")
                  .select("id")
                  .eq("storage_path", path)
                  .maybeSingle();
                if (prior.error)
                  throw new Error(
                    "No se pudo verificar una carga anterior. Reintenta cuando vuelva la conexión.",
                  );
                if (prior.data) {
                  completed++;
                  setRetryFiles(selected.slice(completed));
                  continue;
                }
                const { error: upErr } = await supabase.storage
                  .from("product-images")
                  .upload(path, file, {
                    contentType: file.type,
                    upsert: false,
                  });
                if (upErr && !/already exists|duplicate/i.test(upErr.message))
                  throw upErr;
                const { error: rowErr } = await supabase
                  .from("product_images")
                  .insert({
                    product_id: id,
                    storage_path: path,
                    sort_order: base + completed,
                    is_cover: false,
                    is_defect_detail: false,
                  });
                if (rowErr) {
                  // No eliminar el objeto si el insert se confirmó pero se perdió su respuesta.
                  const check = await supabase
                    .from("product_images")
                    .select("id")
                    .eq("storage_path", path)
                    .maybeSingle();
                  if (check.error)
                    throw new Error(
                      `Carga incierta: revisa ${path} antes de reintentar.`,
                    );
                  if (!check.data) {
                    const { error: cleanupError } = await supabase.storage
                      .from("product-images")
                      .remove([path]);
                    if (cleanupError) {
                      const queued = await supabase
                        .from("image_cleanup")
                        .upsert({ product_id: id, storage_path: path });
                      if (queued.error)
                        throw new Error(`Limpieza manual necesaria: ${path}`);
                    }
                    throw rowErr;
                  }
                }
                completed++;
                setRetryFiles(selected.slice(completed));
              } catch (e) {
                const queued = await supabase
                  .from("image_cleanup")
                  .upsert({ product_id: id, storage_path: path });
                setRetryFiles(selected.slice(completed));
                if (queued.error)
                  throw new Error(
                    `No se pudo registrar limpieza; revisar ${path}.`,
                  );
                throw new Error(
                  e instanceof Error
                    ? e.message
                    : `No se pudo cargar ${file.name}. Revisa las fotos antes de reintentar.`,
                );
              }
            }
            setProgress(`${completed} fotos cargadas.`);
          }}
          onCover={async (img) => {
            const { error } = await supabase.rpc("admin_set_product_cover", {
              p_product_id: id,
              p_image_id: img.id,
            });
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
            const sorted = [...images].sort(
              (a, b) => a.sort_order - b.sort_order,
            );
            const idx = sorted.findIndex((i) => i.id === img.id);
            const other = sorted[idx + dir];
            if (!other) return;
            const { error } = await supabase.rpc("admin_swap_product_images", {
              p_product_id: id,
              p_first_id: img.id,
              p_second_id: other.id,
            });
            if (error) throw error;
          }}
          onRemove={async (img) => {
            if (row.published_at && images.length === 1)
              throw new Error(
                "Retira el producto de la web antes de eliminar su última foto.",
              );
            const { error } = await supabase
              .from("product_images")
              .delete()
              .eq("id", img.id);
            if (error) throw error;
            await cleanStorage(img.storage_path);
          }}
          mutate={mutateImage.mutate}
          busy={mutateImage.isPending}
          error={error}
          progress={progress}
          retryFiles={retryFiles}
        />
        <button
          className="mt-5 min-h-12 w-full bg-zinc-900 px-5 text-white sm:w-auto"
          onClick={() => setStage("revision")}
        >
          Revisar producto
        </button>
      </div>
      {imagesQuery.isError || cleanupQuery.isError ? (
        <button
          onClick={() => {
            void imagesQuery.refetch();
            void cleanupQuery.refetch();
          }}
        >
          No se pudieron cargar las imágenes. Reintentar
        </button>
      ) : null}
      {(cleanupQuery.data ?? []).map((job) => (
        <button
          key={job.storage_path}
          disabled={mutateImage.isPending}
          onClick={() =>
            mutateImage.mutate(() => cleanStorage(job.storage_path))
          }
        >
          Reintentar limpieza pendiente: {job.storage_path}
        </button>
      ))}
    </div>
  );
}

function ImagesManager({
  slug,
  progress,
  retryFiles,
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
  progress: string;
  retryFiles: File[];
  onUpload: (files: FileList | File[]) => Promise<void>;
  onCover: (img: DbImage) => Promise<void>;
  onDefect: (img: DbImage) => Promise<void>;
  onMove: (img: DbImage, dir: -1 | 1) => Promise<void>;
  onRemove: (img: DbImage) => Promise<void>;
  mutate: (fn: () => Promise<unknown>) => void;
  busy: boolean;
  error: string | null;
}) {
  void slug;
  const previewUrls = useRef<string[]>([]);
  const [previews, setPreviews] = useState<{ src: string; name: string }[]>([]);
  useEffect(
    () => () => previewUrls.current.forEach((url) => URL.revokeObjectURL(url)),
    [],
  );
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Fotografías · {images.length}</h2>
      <p role="status" className="text-sm">
        {progress}
      </p>
      {retryFiles.length > 0 ? (
        <button
          disabled={busy}
          onClick={() => mutate(() => onUpload(retryFiles))}
        >
          Reintentar {retryFiles.length} fotos pendientes
        </button>
      ) : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <label className="text-sm">
        <span className="rounded-full border border-zinc-300 px-4 py-2 cursor-pointer inline-block">
          {busy ? "Procesando…" : "Subir fotos"}
        </span>
        <input
          type="file"
          accept="image/*"
          multiple
          className="mt-3 block min-h-11 max-w-full"
          disabled={busy}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length) {
              previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
              const next = files.map((f) => ({
                src: URL.createObjectURL(f),
                name: f.name,
              }));
              previewUrls.current = next.map((p) => p.src);
              setPreviews(next);
              mutate(() => onUpload(files));
            }
          }}
        />
      </label>
      {previews.length ? (
        <div
          aria-label="Fotos seleccionadas"
          className="flex gap-2 overflow-x-auto"
        >
          {previews.map((p) => (
            <img
              key={p.src}
              src={p.src}
              alt={`Seleccionada: ${p.name}`}
              className="h-24 w-20 shrink-0 object-contain"
            />
          ))}
        </div>
      ) : null}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {images.map((img) => (
          <div
            key={img.id}
            className="rounded border border-zinc-200 bg-white p-2 flex flex-col gap-1 text-xs"
          >
            {/* remote storage URL: next/image requeriría remotePatterns; img simple es suficiente aquí */}
            <img
              src={publicUrl(img.storage_path)}
              alt=""
              className="w-full aspect-[3/4] object-contain rounded"
            />
            <p className="text-zinc-500">
              #{img.sort_order}
              {img.is_cover ? " · portada" : ""}
              {img.is_defect_detail ? " · defecto" : ""}
            </p>
            <div className="flex flex-wrap gap-x-2 gap-y-1">
              {!img.is_cover ? (
                <button
                  disabled={busy}
                  className="underline"
                  onClick={() => mutate(() => onCover(img))}
                >
                  Portada
                </button>
              ) : null}
              <button
                disabled={busy}
                className="underline"
                onClick={() => mutate(() => onDefect(img))}
              >
                {img.is_defect_detail ? "Quitar defecto" : "Marcar defecto"}
              </button>
              <button
                disabled={busy}
                className="underline"
                aria-label="Mover foto antes"
                onClick={() => mutate(() => onMove(img, -1))}
              >
                ←
              </button>
              <button
                disabled={busy}
                className="underline"
                aria-label="Mover foto después"
                onClick={() => mutate(() => onMove(img, 1))}
              >
                →
              </button>
              <button
                disabled={busy}
                className="underline text-red-700"
                onClick={() =>
                  confirm("Eliminar esta foto?") && mutate(() => onRemove(img))
                }
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
