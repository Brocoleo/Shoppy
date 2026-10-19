"use client";

import { cloneElement, isValidElement, useId, useEffect, useRef, useState, type ReactElement, type FormEvent } from "react";
import type {
  DbBrand,
  DbCategory,
  DbProduct,
  DbProductCondition,
} from "@shopy/types";
import { formatCLP, supabase } from "../lib/supabase";
import { prepareImageParaIA } from "../lib/prepareImage";

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
  condition: DbProductCondition | "";
  size: string;
  color: string;
  sku: string;
  stock: number;
  availability: string;
  published: boolean;
  tags: string;
  is_featured: boolean;
}

export function toFormValue(
  p: Partial<DbProduct> & { published?: boolean },
): ProductFormValue {
  return {
    slug: p.slug ?? "",
    name: p.name ?? "",
    description: (p.description as string | null) ?? "",
    brand_id: p.brand_id ?? "",
    category_id: p.category_id ?? "",
    subcategory_id: p.subcategory_id ?? "",
    segment: p.segment ?? "",
    price_clp: p.price_clp ?? 0,
    compare_at_price_clp:
      p.compare_at_price_clp != null ? String(p.compare_at_price_clp) : "",
    condition: (p.condition as DbProductCondition | undefined) ?? "",
    size: p.size ?? "",
    color: p.color ?? "",
    sku: (p as { sku?: string | null }).sku ?? "",
    stock: p.stock ?? 0,
    availability: p.availability ?? "AVAILABLE",
    published:
      p.published ??
      (p as { published_at?: string | null }).published_at != null,
    tags: (p.tags ?? []).join(", "),
    is_featured: p.is_featured ?? false,
  };
}

export function toRow(
  v: ProductFormValue,
  existingPublishedAt: string | null = null,
): Record<string, unknown> {
  return {
    slug: v.slug.trim(),
    name: v.name.trim(),
    description: v.description.trim() || null,
    brand_id: v.brand_id || null,
    category_id: v.category_id || null,
    subcategory_id: v.subcategory_id || null,
    segment: v.segment.trim() || null,
    price_clp: Math.max(0, Math.round(Number(v.price_clp) || 0)),
    compare_at_price_clp:
      v.compare_at_price_clp === ""
        ? null
        : Math.max(0, Math.round(Number(v.compare_at_price_clp) || 0)),
    condition: v.condition,
    size: v.size.trim() || null,
    color: v.color.trim() || null,
    sku: v.sku.trim() || null,
    stock: Math.max(0, Math.round(Number(v.stock) || 0)),
    availability: v.availability,
    published_at: existingPublishedAt,
    tags: v.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    is_featured: v.is_featured,
  };
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 80)
    .replace(/^-+|-+$/g, "");
}

interface AiFields {
  name: string | null;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  segment: string | null;
  color: string | null;
  condition: DbProductCondition;
  size: string | null;
  material: string | null;
  description: string | null;
  tags: string[];
  labelText: string | null;
  notes: string | null;
}

const normalizeName = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

function base64FromBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function ProductForm({
  initial,
  onSave,
  saving,
  serverError,
  onDirty,
}: {
  initial: ProductFormValue;
  onSave: (v: ProductFormValue) => void;
  saving: boolean;
  serverError: string | null;
  onDirty?: () => void;
}) {
  const [v, setV] = useState(initial);
  const [slugEdited, setSlugEdited] = useState(
    Boolean(initial.slug && initial.slug !== slugify(initial.name)),
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [taxonomyError, setTaxonomyError] = useState<string | null>(null);
  const [brands, setBrands] = useState<DbBrand[]>([]);
  const [categories, setCategories] = useState<DbCategory[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const aiInputRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof ProductFormValue>(
    k: K,
    val: ProductFormValue[K],
  ) => {
    setValidationError(null);
    setV((s) => ({ ...s, [k]: val }));
  };

  useEffect(() => {
    let cancelled = false;
    async function loadTaxonomy() {
      try {
        const [brandsResult, categoriesResult] = await Promise.all([
          supabase.from("brands").select("id,slug,name").order("name"),
          supabase
            .from("categories")
            .select("id,slug,name,parent_id")
            .order("sort_order"),
        ]);
        if (brandsResult.error || categoriesResult.error)
          throw new Error(
            "No se pudieron cargar las categorías y marcas. Recarga antes de cambiarlas.",
          );
        if (cancelled) return;
        setBrands((brandsResult.data ?? []) as DbBrand[]);
        setCategories((categoriesResult.data ?? []) as DbCategory[]);
      } catch (error) {
        if (!cancelled)
          setTaxonomyError(
            error instanceof Error
              ? error.message
              : "No se pudieron cargar las categorías y marcas.",
          );
      }
    }
    void loadTaxonomy();
    return () => {
      cancelled = true;
    };
  }, []);

  const parents = categories.filter((c) => !c.parent_id);
  const subs = categories.filter((c) => c.parent_id === v.category_id);

  const analizarFoto = async (file: File) => {
    setAiError(null);
    setAiNote(null);
    setAiBusy(true);
    try {
      const optimizada = await prepareImageParaIA(file);
      const base64 = base64FromBuffer(await optimizada.arrayBuffer());
      const { data, error } = await supabase.functions.invoke("producto-ia", {
        body: { image_base64: base64, mime_type: optimizada.type },
      });
      if (error) {
        let message = "No se pudo analizar la foto. Inténtalo de nuevo.";
        try {
          const body = await (error as { context?: Response }).context?.json();
          const msg = (body as { error?: { message?: string } } | undefined)?.error?.message;
          if (msg) message = msg;
        } catch {
          /* sin cuerpo legible */
        }
        throw new Error(message);
      }
      const fields = (data as { fields?: AiFields } | null)?.fields;
      if (!fields) throw new Error("La IA no devolvió datos. Reintenta.");

      const filled: string[] = [];
      const skipped: string[] = [];
      const next: ProductFormValue = { ...v };
      const fillEmpty = <K extends keyof ProductFormValue>(
        k: K,
        valor: ProductFormValue[K],
        label: string,
      ) => {
        const actual = next[k];
        const vacio = actual === "" || actual === null || actual === 0;
        if (!vacio) {
          skipped.push(label);
          return;
        }
        next[k] = valor;
        filled.push(label);
      };

      if (fields.name) {
        fillEmpty("name", fields.name, "nombre");
        if (!slugEdited && !next.slug) next.slug = slugify(fields.name);
      }
      if (fields.brand) {
        const match = brands.find((b) => normalizeName(b.name) === normalizeName(fields.brand!));
        if (!match) skipped.push(`marca «${fields.brand}» (no está en el catálogo)`);
        else fillEmpty("brand_id", match.id, "marca");
      }
      if (fields.category) {
        const match = parents.find((c) => normalizeName(c.name) === normalizeName(fields.category!));
        if (!match) skipped.push(`categoría «${fields.category}» (no está en el catálogo)`);
        else if (!next.category_id) {
          next.category_id = match.id;
          next.subcategory_id = "";
          filled.push("categoría");
        } else skipped.push("categoría");
      }
      if (fields.subcategory) {
        const match = categories.find(
          (c) => c.parent_id === next.category_id && normalizeName(c.name) === normalizeName(fields.subcategory!),
        );
        if (!next.subcategory_id && match) {
          next.subcategory_id = match.id;
          filled.push("subcategoría");
        }
      }
      if (fields.segment) fillEmpty("segment", fields.segment, "segmento");
      if (fields.color) fillEmpty("color", fields.color, "color");
      if (fields.size) fillEmpty("size", fields.size, "talla");
      if (fields.description) fillEmpty("description", fields.description, "descripción");
      if (fields.tags.length) fillEmpty("tags", fields.tags.join(", "), "tags");
      if (!next.condition) {
        next.condition = fields.condition;
        filled.push("estado");
      }

      setValidationError(null);
      setV(next);
      const resumen = filled.length
        ? `Completado: ${filled.join(", ")}.`
        : "No había campos vacíos que completar.";
      const omitidos = skipped.length ? ` No toqué: ${skipped.join(", ")}.` : "";
      const nota = fields.notes ? ` Nota de la IA: ${fields.notes}` : "";
      setAiNote(`${resumen}${omitidos}${nota} Revisa y corrige antes de guardar.`);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "No se pudo analizar la foto.");
    } finally {
      setAiBusy(false);
    }
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    let message: string | null = null;
    if (!v.name.trim() || v.name.trim().length > 180)
      message = "Escribe un nombre de hasta 180 caracteres.";
    else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v.slug) || v.slug.length > 80)
      message =
        "La dirección admite hasta 80 letras minúsculas, números y guiones entre palabras.";
    else if (!CONDITIONS.some((c) => c.value === v.condition))
      message = "Selecciona el estado real de la prenda.";
    else if (!Number.isSafeInteger(v.price_clp) || v.price_clp < 0)
      message =
        "El precio debe ser un número entero de pesos, igual o mayor que cero.";
    else if (!Number.isSafeInteger(v.stock) || v.stock < 0)
      message = "El stock debe ser un número entero igual o mayor que cero.";
    else if (
      v.compare_at_price_clp !== "" &&
      (!Number.isSafeInteger(Number(v.compare_at_price_clp)) ||
        Number(v.compare_at_price_clp) <= v.price_clp)
    )
      message = "El precio anterior debe ser mayor que el precio actual.";
    else if (v.category_id && !parents.some((c) => c.id === v.category_id))
      message =
        "Espera a que carguen las categorías y selecciona una categoría válida.";
    else if (v.subcategory_id && !subs.some((c) => c.id === v.subcategory_id))
      message = "La subcategoría debe pertenecer a la categoría seleccionada.";
    setValidationError(message);
    if (!message && !saving) onSave(v);
  };

  return (
    <form
      onChange={onDirty}
      onSubmit={submit}
      className="flex w-full max-w-2xl flex-col gap-5"
      aria-busy={saving}
    >
      <p className="text-sm text-zinc-600">
        Paso 1 · Datos. Guarda para continuar con las fotos y revisar la
        publicación.
      </p>
      <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-4">
        <h2 className="text-sm font-semibold">Completar con IA (opcional)</h2>
        <p className="mt-1 text-xs text-zinc-600">
          Sube la foto cruda de la prenda: la IA lee marca, tipo y estado y
          rellena los campos que estén vacíos. La foto no se publica ni se
          guarda; solo se usa para el borrador. Revisa y corrige siempre.
        </p>
        <div className="mt-3">
          <input
            ref={aiInputRef}
            type="file"
            accept="image/*"
            disabled={aiBusy}
            aria-label="Foto para completar los campos con IA"
            className="min-h-11 max-w-full text-sm"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void analizarFoto(file);
            }}
          />
        </div>
        {aiBusy ? (
          <p role="status" className="mt-2 text-xs text-zinc-500">
            Analizando la foto con IA… puede tardar unos segundos.
          </p>
        ) : null}
        {aiError ? (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {aiError}
          </p>
        ) : null}
        {aiNote ? (
          <p role="status" className="mt-2 text-xs text-green-800">
            {aiNote}
          </p>
        ) : null}
      </div>
      {taxonomyError ? (
        <p role="alert" className="text-sm text-red-700">
          {taxonomyError}
        </p>
      ) : null}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Nombre *">
          <input
            className={inputCls}
            value={v.name}
            required
            maxLength={180}
            onChange={(e) => {
              const name = e.target.value;
              setValidationError(null);
              setV((s) => ({
                ...s,
                name,
                slug: slugEdited ? s.slug : slugify(name),
              }));
            }}
          />
        </Field>
        <Field label="Slug *">
          <input
            required
            maxLength={80}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            autoCapitalize="none"
            spellCheck={false}
            className={inputCls}
            value={v.slug}
            onChange={(e) => {
              setSlugEdited(true);
              set("slug", e.target.value);
            }}
          />
        </Field>
      </div>
      <Field label="Descripción">
        <textarea
          className={inputCls}
          rows={3}
          value={v.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Marca">
          <select
            className={inputCls}
            value={v.brand_id}
            onChange={(e) => set("brand_id", e.target.value)}
          >
            <option value="">—</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Categoría">
          <select
            className={inputCls}
            value={v.category_id}
            onChange={(e) => {
              setValidationError(null);
              setV((s) => ({
                ...s,
                category_id: e.target.value,
                subcategory_id: "",
              }));
            }}
          >
            <option value="">—</option>
            {parents.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Subcategoría">
          <select
            className={inputCls}
            value={v.subcategory_id}
            disabled={!v.category_id || Boolean(taxonomyError)}
            onChange={(e) => set("subcategory_id", e.target.value)}
          >
            <option value="">—</option>
            {subs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Precio CLP *">
          <input
            type="number"
            inputMode="numeric"
            required
            min={0}
            step={1}
            className={inputCls}
            value={v.price_clp}
            onChange={(e) => set("price_clp", Number(e.target.value))}
          />
        </Field>
        <Field label="Precio anterior">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            className={inputCls}
            value={v.compare_at_price_clp}
            onChange={(e) => set("compare_at_price_clp", e.target.value)}
            placeholder="Opcional"
          />
        </Field>
        <Field label="Stock *">
          <input
            type="number"
            inputMode="numeric"
            required
            min={0}
            step={1}
            className={inputCls}
            value={v.stock}
            onChange={(e) => set("stock", Number(e.target.value))}
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Condición">
          <select
            className={inputCls}
            value={v.condition}
            onChange={(e) =>
              set("condition", e.target.value as DbProductCondition)
            }
          >
            <option value="">Selecciona el estado</option>
            {CONDITIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Talla">
          <input
            className={inputCls}
            value={v.size}
            onChange={(e) => set("size", e.target.value)}
          />
        </Field>
        <Field label="Color">
          <input
            className={inputCls}
            value={v.color}
            onChange={(e) => set("color", e.target.value)}
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="SKU">
          <input
            className={inputCls}
            value={v.sku}
            onChange={(e) => set("sku", e.target.value)}
          />
        </Field>
        <Field label="Segmento">
          <input
            className={inputCls}
            value={v.segment}
            onChange={(e) => set("segment", e.target.value)}
            placeholder="mujer / hombre…"
          />
        </Field>
        <Field label="Disponibilidad">
          <select
            className={inputCls}
            value={v.availability}
            onChange={(e) => set("availability", e.target.value)}
          >
            {["AVAILABLE", "RESERVED", "SOLD", "ARCHIVED"].map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Tags (coma)">
        <input
          className={inputCls}
          value={v.tags}
          onChange={(e) => set("tags", e.target.value)}
          placeholder="denim, chaqueta, otoño"
        />
      </Field>
      <div className="flex gap-6 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={v.is_featured}
            onChange={(e) => set("is_featured", e.target.checked)}
          />
          Destacado (home)
        </label>
      </div>
      {validationError || serverError ? (
        <p role="alert" className="text-sm text-red-700">
          {validationError || serverError}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={saving}
        className="rounded-full bg-zinc-900 text-white h-12 text-sm font-semibold disabled:opacity-50 w-full sm:w-64 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
      >
        {saving ? "Guardando datos…" : "Guardar datos y continuar"}
      </button>
      <p role="status" className="text-xs text-zinc-600">
        {saving
          ? "Guardando los datos del producto."
          : `Referencia: ${formatCLP(Number(v.price_clp) || 0)}. La publicación se confirma después de revisar las fotos.`}
      </p>
    </form>
  );
}

const inputCls =
  "w-full min-w-0 rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-base leading-6 shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:bg-zinc-100";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const labelId = useId();
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-sm text-zinc-700">
      <span id={labelId}>{label}</span>
      {isValidElement(children) ? cloneElement(children as ReactElement<{ "aria-labelledby"?: string }>, { "aria-labelledby": labelId }) : children}
    </label>
  );
}
