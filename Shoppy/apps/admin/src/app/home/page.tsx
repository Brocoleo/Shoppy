"use client";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ARCHIVE_KEY,
  parseArchive,
  parseHero,
  type HeroConfig,
  type ArchiveConfig,
  type EditorialImage,
} from "@shopy/shared/editorial";
import { supabase } from "../../lib/supabase";
import { prepareImage } from "../../lib/prepareImage";
import { QueryState } from "../../components/QueryState";
type Section = { id: string; key: string; config: unknown; updated_at: string };
const imageUrl = (path: string) =>
  supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
export default function HomeSectionsPage() {
  const [edition, setEdition] = useState(0);
  const query = useQuery({
    queryKey: ["admin-home"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("home_sections")
        .select("id,key,config,updated_at")
        .in("key", ["hero", ARCHIVE_KEY]);
      if (error) throw error;
      return data as Section[];
    },
  });
  return (
    <div className="max-w-4xl">
      <h1 className="font-serif text-3xl">Portada y archivo</h1>
      <p className="mt-2 mb-6 text-sm text-zinc-600">
        Elige las fotografías y el texto de la web. El archivo nunca se ofrece
        para compra.
      </p>
      <QueryState
        isLoading={query.isPending}
        isError={query.isError}
        isEmpty={false}
        onRetry={() => query.refetch()}
      />
      {query.data ? (
        <Editors
          key={edition}
          rows={query.data}
          onReload={async () => {
            await query.refetch();
            setEdition((v) => v + 1);
          }}
        />
      ) : null}
    </div>
  );
}
function Editors({
  rows,
  onReload,
}: {
  rows: Section[];
  onReload: () => Promise<void>;
}) {
  const savedRows = useRef(new Map(rows.map((r) => [r.key, r])));
  const heroRow = rows.find((r) => r.key === "hero"),
    archiveRow = rows.find((r) => r.key === ARCHIVE_KEY);
  const [hero, setHero] = useState<HeroConfig>(() =>
    parseHero(heroRow?.config),
  );
  const [archive, setArchive] = useState<ArchiveConfig>(() =>
    parseArchive(archiveRow?.config),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function action(work: () => Promise<void>, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
      setMessage(success);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo guardar. Reintenta.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function save(_row: Section | undefined, key: string, config: unknown) {
    const row = savedRows.current.get(key);
    const result = row
      ? await supabase
          .from("home_sections")
          .update({ config })
          .eq("id", row.id)
          .eq("updated_at", row.updated_at)
          .select("id,key,config,updated_at")
      : await supabase
          .from("home_sections")
          .insert({
            key,
            title: key === "hero" ? "Portada" : "Archivo de Instagram",
            config,
            is_active: true,
          })
          .select("id,key,config,updated_at");
    if (result.error) throw result.error;
    if (!result.data?.length)
      throw new Error(
        "Otra sesión cambió este contenido. Recarga antes de guardar.",
      );
    savedRows.current.set(key, result.data[0] as Section);
  }
  const choices = archive.items.flatMap((entry) =>
    entry.images.map((image, index) => ({
      image,
      label: `${entry.title} · foto ${index + 1}`,
    })),
  );
  const setImage = (
    slot: "primary" | "secondary",
    image: EditorialImage | undefined,
  ) => setHero((v) => ({ ...v, [slot]: image }));
  return (
    <div className="flex flex-col gap-10">
        <button
          type="button"
          disabled={busy}
          onClick={() => void onReload()}
          className="min-h-11 text-sm underline"
        >
          Recargar contenido guardado
        </button>
      <form
        className="space-y-5 rounded border border-zinc-200 bg-white p-4 sm:p-6"
        onSubmit={(event) => {
          event.preventDefault();
          void action(
            () => save(heroRow, "hero", hero),
            "Portada guardada. Recarga la tienda para verla.",
          );
        }}
      >
        <h2 className="text-xl font-semibold">Portada</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            ["title", "Primera línea"],
            ["secondLine", "Segunda línea"],
            ["ctaLabel", "Texto del enlace"],
            ["ctaHref", "Destino dentro de la tienda"],
          ].map(([field, label]) => (
            <label key={field} className="flex flex-col gap-1 text-sm">
              {label}
              <input
                required
                className="min-h-11 rounded border border-zinc-300 px-3"
                value={hero[field as "title"]}
                onChange={(e) =>
                  setHero((v) => ({ ...v, [field]: e.target.value }))
                }
                pattern={
                  field === "ctaHref" ? "/(?!/)[a-zA-Z0-9/?=&%\\-]*" : undefined
                }
              />
            </label>
          ))}
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          {(["primary", "secondary"] as const).map((slot) => {
            const image = hero[slot];
            return (
              <fieldset key={slot} className="min-w-0 space-y-3">
                <legend className="mb-2 font-medium">
                  {slot === "primary"
                    ? "Fotografía principal"
                    : "Fotografía secundaria (escritorio)"}
                </legend>
                {image ? (
                  <img
                    src={imageUrl(image.storagePath)}
                    alt={image.alt}
                    className="h-64 w-full bg-[#efede7] object-contain"
                  />
                ) : (
                  <p className="bg-zinc-50 p-5 text-sm">
                    Sin fotografía seleccionada.
                  </p>
                )}
                <label className="flex flex-col gap-1 text-sm">
                  Elegir del archivo
                  <select
                    className="min-h-11 w-full rounded border border-zinc-300 px-2"
                    value={
                      choices.some(
                        (c) => c.image.storagePath === image?.storagePath,
                      )
                        ? image?.storagePath
                        : ""
                    }
                    onChange={(e) => {
                      const chosen = choices.find(
                        (c) => c.image.storagePath === e.target.value,
                      );
                      if (chosen)
                        setImage(slot, {
                          ...chosen.image,
                          fit: "cover",
                          position: "center",
                        });
                      else setImage(slot, undefined);
                    }}
                  >
                    <option value="">
                      {image ? "Foto cargada / quitar selección" : "Sin foto"}
                    </option>
                    {choices.map((c) => (
                      <option
                        key={c.image.storagePath}
                        value={c.image.storagePath}
                      >
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Subir otra foto
                  <input
                    type="file"
                    accept="image/*"
                    disabled={busy}
                    className="min-h-11 max-w-full"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file)
                        void action(async () => {
                          const optimized = await prepareImage(file);
                          const bitmap = await createImageBitmap(optimized);
                          const width = bitmap.width,
                            height = bitmap.height;
                          bitmap.close();
                          const path = `vinta/editorial/${crypto.randomUUID()}-${optimized.name.replace(/[^a-zA-Z0-9.-]/g, "-")}`;
                          const { error } = await supabase.storage
                            .from("product-images")
                            .upload(path, optimized, {
                              upsert: false,
                              contentType: optimized.type,
                            });
                          if (error) throw error;
                          setImage(slot, {
                            storagePath: path,
                            width,
                            height,
                            alt: "Fotografía editorial de vinta.zhe",
                            fit: "cover",
                            position: "center",
                          });
                        }, "Foto preparada. Guarda la portada para usarla.");
                    }}
                  />
                </label>
                {image ? (
                  <>
                    <label className="flex flex-col gap-1 text-sm">
                      Descripción de la imagen
                      <input
                        className="min-h-11 rounded border border-zinc-300 px-3"
                        value={image.alt}
                        onChange={(e) =>
                          setImage(slot, { ...image, alt: e.target.value })
                        }
                      />
                    </label>
                    <div className="grid grid-cols-1 gap-3">
                      <label className="text-sm">
                        Punto de recorte
                        <select
                          className="mt-1 min-h-11 w-full rounded border px-2"
                          value={image.position ?? "center"}
                          onChange={(e) =>
                            setImage(slot, {
                              ...image,
                              position: e.target.value as
                                | "center"
                                | "top"
                                | "bottom",
                            })
                          }
                        >
                          <option value="center">Centro</option>
                          <option value="top">Arriba</option>
                          <option value="bottom">Abajo</option>
                        </select>
                        <span className="mt-1 block text-xs text-zinc-500">
                          La portada siempre llena el encuadre (sin bordes).
                          Ajusta aquí qué zona de la foto se ve.
                        </span>
                      </label>
                    </div>
                  </>
                ) : null}
              </fieldset>
            );
          })}
        </div>
        <button
          disabled={busy}
          className="min-h-12 w-full bg-zinc-900 px-5 text-white disabled:opacity-50 sm:w-auto"
        >
          {busy ? "Guardando…" : "Guardar portada"}
        </button>
      </form>
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">
          Archivo · {archive.items.length} publicaciones
        </h2>
        <p className="text-sm text-zinc-600">
          Puedes corregir los títulos o elegir qué publicaciones se muestran.
          Estas acciones no crean productos vendibles.
        </p>
        {archive.items.map((entry) => (
          <div
            key={entry.id}
            className="flex items-start gap-3 rounded border border-zinc-200 bg-white p-3"
          >
            <img
              src={imageUrl(entry.images[0].storagePath)}
              alt=""
              className="h-24 w-20 shrink-0 object-contain"
            />
            <div className="min-w-0 flex-1">
              <label className="flex flex-col gap-1 text-sm">
                Título de la publicación
                <input
                  className="min-h-11 w-full rounded border px-2"
                  value={entry.title}
                  onChange={(e) =>
                    setArchive((a) => ({
                      ...a,
                      items: a.items.map((i) =>
                        i.id === entry.id ? { ...i, title: e.target.value } : i,
                      ),
                    }))
                  }
                />
              </label>
              <label className="mt-2 flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={entry.visible}
                  onChange={(e) =>
                    setArchive((a) => ({
                      ...a,
                      items: a.items.map((i) =>
                        i.id === entry.id
                          ? { ...i, visible: e.target.checked }
                          : i,
                      ),
                    }))
                  }
                />
                Mostrar en catálogo
              </label>
              <a
                href={entry.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center text-sm underline"
              >
                Publicación original
              </a>
            </div>
          </div>
        ))}
        <button
          disabled={busy || !archiveRow}
          onClick={() =>
            void action(
              () => save(archiveRow, ARCHIVE_KEY, archive),
              "Archivo guardado.",
            )
          }
          className="min-h-12 w-full bg-zinc-900 px-5 text-white disabled:opacity-50 sm:w-auto"
        >
          Guardar archivo
        </button>
      </section>
      <div className={message || error ? "sticky bottom-2 z-20 bg-[#f8f7f4] p-2" : ""} aria-live="polite">
        {message ? (
          <p role="status" className="text-sm text-green-800">
            {message}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        ) : null}

      </div>
    </div>
  );
}
