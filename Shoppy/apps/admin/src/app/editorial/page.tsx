"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ARCHIVE_KEY, parseArchive } from "@shopy/shared/editorial";
import { supabase } from "../../lib/supabase";

const BEIGE_SITIO = "#efede7";

interface Estilo {
  id: string;
  nombre: string;
  descripcion: string;
  background: string;
  color: string;
  pasos: string[];
}

const ESTILOS: Estilo[] = [
  {
    id: "lino",
    nombre: "Lino blanco arrugado (estándar)",
    descripcion:
      "Continuidad total con el archivo actual: la misma tela de lino blanco con sus arrugas naturales le da cuerpo y calidez a la foto.",
    color: "#f7f5f0 base + pliegues",
    background:
      "radial-gradient(ellipse at 20% 18%, #ffffff 0%, rgba(255,255,255,0) 45%), radial-gradient(ellipse at 78% 62%, #eceadf 0%, rgba(236,234,223,0) 50%), radial-gradient(ellipse at 55% 30%, #f1efe9 0%, rgba(241,239,233,0) 55%), radial-gradient(ellipse at 12% 85%, #e6e3da 0%, rgba(230,227,218,0) 60%), #f5f3ee",
    pasos: [
      "Misma tela blanca de lino del archivo, sin planchar.",
      "Ventana a la izquierda (sombra suave lateral).",
      "Foto en 4:5, la prenda centrada con aire alrededor.",
      "Ajusta la tela en el encuadre: las arrugas cuentan la historia.",
    ],
  },
  {
    id: "patron",
    nombre: "Blanco con patrón tenue",
    descripcion:
      "Blanco casi puro con un patrón muy sutil (rayas diagonales apenas visibles). Da identidad sin competir con la prenda.",
    color: "#fbfaf7 + rayas 3%",
    background:
      "repeating-linear-gradient(135deg, rgba(31,41,51,0.035) 0 1px, rgba(0,0,0,0) 1px 26px), repeating-linear-gradient(45deg, rgba(31,41,51,0.014) 0 1px, rgba(0,0,0,0) 1px 26px), #fbfaf7",
    pasos: [
      "Tela de fondo blanca lisa con textura de rayas sutil (o estampado del sitio impreso a media opacidad).",
      "Luz frontal difusa: el patrón no debe proyectar sombras.",
      "Foto en 4:5; deja el patrón visible en bordes y esquinas, no bajo la prenda.",
    ],
  },
  {
    id: "beige",
    nombre: "Beige del sitio (parchment)",
    descripcion:
      "El tono cálido exacto de las páginas de la web (#efede7). Las fotos se funden con el fondo del sitio y la prenda queda al centro del mensaje.",
    color: BEIGE_SITIO,
    background:
      "radial-gradient(ellipse at 30% 24%, #f6f4ef 0%, rgba(246,244,239,0) 55%), radial-gradient(ellipse at 70% 80%, rgba(215,211,200,0.55) 0%, rgba(215,211,200,0) 60%), " +
      BEIGE_SITIO,
    pasos: [
      "Tela o papel en beige cálido similar a #efede7 (lino lavado).",
      "Luz natural suave; evita que la foto quede más blanca que la página.",
      "Foto en 4:5; el fondo debe acercarse al tono de la web, no empatar al milímetro.",
    ],
  },
  {
    id: "piedra",
    nombre: "Gris piedra",
    descripcion:
      "Neutro moderno: el gris piedra hace resaltar denim, verdes y cremas. Ordinario y minimalista, hero mejor para marcas de color fuerte.",
    color: "#c6c4bf",
    background:
      "linear-gradient(160deg, #cccac5 0%, #bfbdb8 55%, #b3b1ac 100%)",
    pasos: [
      "Tela gris de punto grueso o liso apoyada plana.",
      "Luz de ventana constante en toda la serie.",
      "Foto en 4:5; si la prenda es gris o blanca, sube la exposición de la tela.",
    ],
  },
];

// ──────────────────────────────────────────────────────────────
// Prompts maestros anclados al estándar "Lino blanco arrugado".
// Copiar y pegar en ChatGPT adjuntando la foto cruda de la prenda.
// ──────────────────────────────────────────────────────────────

const PROMPT_CATALOGO = `Edita esta foto de producto: coloca la MISMA prenda —idéntica: no cambies diseño, color, textura, etiqueta ni desgaste— plana, centrada, vista superior, sobre un fondo de lino blanco arrugado. Luz natural de ventana desde la izquierda, sombra suave. Sin modelo, sin accesorios, sin texto. Encuadre vertical 4:5 con aire alrededor. Fotografía profesional de e-commerce.`;

const PROMPT_EDITORIAL = `Crea una imagen editorial usando la MISMA prenda —idéntica en diseño, color, textura, etiqueta y desgaste, no inventes cambios— puesta por una modelo de cuerpo entero sobre fondo beige claro de lino. A la derecha, 4 tomas superpuestas: frente, espalda, etiqueta de marca y close-up de la tela. Luz cálida natural, sin texto ni logos agregados. Vertical 4:5.`;

async function fetchFotoDemo() {
  const { data, error } = await supabase
    .from("home_sections")
    .select("config")
    .eq("key", ARCHIVE_KEY)
    .maybeSingle();
  if (error) throw error;
  const archive = parseArchive(data?.config);
  const image = archive.items?.[0]?.images?.[0];
  const title = archive.items?.[0]?.title ?? "";
  if (!image) throw new Error("ARCHIVE_EMPTY");
  const url = supabase.storage.from("product-images").getPublicUrl(image.storagePath).data.publicUrl;
  return { url, alt: image.alt, title, width: image.width, height: image.height };
}

function CopyBtn({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition"
      aria-label={`Copiar prompt ${label}`}
    >
      {copied ? "✓ Copiado" : "Copiar"}
    </button>
  );
}

function PromptCard({ title, prompt, hint, label }: { title: string; prompt: string; hint: string; label: string }) {
  return (
    <section className="rounded border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium text-zinc-900">{title}</h3>
        <CopyBtn text={prompt} label={label} />
      </div>
      <p className="mt-1.5 text-xs text-zinc-600">{hint}</p>
      <pre className="mt-2 rounded bg-zinc-100 p-3 text-[11px] overflow-x-auto whitespace-pre-wrap text-zinc-800" aria-label={`Prompt ${label}`}>
{`${prompt}`}
      </pre>
    </section>
  );
}

function ChecklistHonestidad() {
  return (
    <section className="rounded border border-amber-200 bg-amber-50 p-4">
      <h3 className="font-medium text-amber-900 flex items-center gap-1.5">
        <span aria-hidden>⚠</span>
        Honestidad de segunda mano (obligatorio)
      </h3>
      <ul className="mt-2 space-y-1.5 text-xs text-amber-800">
        <li className="flex gap-1.5">
          <span aria-hidden className="text-amber-600">✓</span>
          <span>Sube <strong>1–2 fotos reales sin retoque</strong> de la prenda y márcalas <em>“detalle del estado”</em> (campo <code>isDefect</code> en el formulario).</span>
        </li>
        <li className="flex gap-1.5">
          <span aria-hidden className="text-amber-600">✓</span>
          <span>La foto editorial embellece; la ficha <strong>siempre</strong> muestra la prenda tal cual.</span>
        </li>
        <li className="flex gap-1.5">
          <span aria-hidden className="text-amber-600">✓</span>
          <span>Si ChatGPT cambia la etiqueta, color o desgaste → <strong>no subas</strong> esa versión; pide “otra vez” o retócalo manualmente.</span>
        </li>
      </ul>
    </section>
  );
}

function FlujoManual() {
  return (
    <section className="rounded border border-zinc-200 bg-white p-4">
      <h3 className="font-medium text-zinc-900">Flujo manual por prenda (~3 min)</h3>
      <ol className="mt-3 space-y-2 text-sm text-zinc-600 list-decimal list-inside">
        <li className="flex gap-2"><strong>Foto cruda:</strong> celular, prenda plana, cualquier fondo.</li>
        <li className="flex gap-2"><strong>ChatGPT (app o web):</strong> adjunta la foto + pega prompt <em>/catálogo</em> → descarga.</li>
        <li className="flex gap-2"><strong>Repite con prompt <em>/editorial</em></strong> (misma foto cruda).</li>
        <li className="flex gap-2"><strong>Admin → Producto → Fotos:</strong> sube las 2 imágenes generadas + 1–2 fotos reales marcadas “detalle del estado”.</li>
        <li className="flex gap-2"><strong>Publica.</strong> El sistema recorta a 4:5 y comprime a WebP solo.</li>
      </ol>
    </section>
  );
}

export default function EditorialPage() {
  const query = useQuery({
    queryKey: ["admin-editorial-foto"],
    queryFn: fetchFotoDemo,
    staleTime: 60_000,
    retry: 1,
  });
  const foto = query.data;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-serif text-3xl tracking-tight">Foto editorial</h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-600">
          Una sola línea visual para todas las fotos de producto: misma tela de
          fondo, misma luz y encuadre 4:5. Al subir una foto, el sistema la
          recorta centrada a 4:5 automáticamente — si la tomas en 4:5 no pierde
          casi nada. El estándar elegido es <strong>Lino blanco arrugado</strong>.
        </p>
      </div>

      {query.isPending ? (
        <p className="text-sm text-zinc-500">Cargando foto de muestra…</p>
      ) : null}
      {query.isError || !foto ? (
        <div className="rounded border border-amber-300 bg-amber-50 p-4 text-sm">
          <p className="font-medium text-amber-900">
            No hay foto de archivo configurada para la demo.
          </p>
          <p className="mt-1 text-amber-800">
            Configura el archivo en la sección <strong>Home</strong> del admin y
            este panel la usará como muestra. Mientras tanto, usa los prompts y
            la checklist de abajo.
          </p>
          <button
            type="button"
            onClick={() => query.refetch()}
            className="mt-2 rounded bg-amber-800 px-3 py-1.5 text-xs font-medium text-white"
          >
            Reintentar
          </button>
        </div>
      ) : null}

      <Propuestas foto={foto ?? null} />

      <div className="border-t border-zinc-200 pt-6">
        <h2 className="font-serif text-2xl tracking-tight">Proceso con ChatGPT (manual, $0)</h2>
        <p className="mt-1.5 text-sm text-zinc-600">
          Los dos prompts listos para copiar y pegar en ChatGPT adjuntando la
          foto cruda de la prenda. Mantienen la línea visual fija (lino blanco
          arrugado) entre todas las prendas.
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <PromptCard
            title="1. Prompt /catálogo — foto para tarjeta"
            prompt={PROMPT_CATALOGO}
            hint="Resultado: prenda plana sobre lino blanco arrugado, 4:5. Para la portada del catálogo y la ficha principal."
            label="/catálogo"
          />
          <PromptCard
            title="2. Prompt /editorial — foto con modelo + detalles"
            prompt={PROMPT_EDITORIAL}
            hint="Resultado: modelo con la prenda + 4 tomas (frente, espalda, etiqueta, close-up tela). Para la galería de la ficha."
            label="/editorial"
          />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <FlujoManual />
          <ChecklistHonestidad />
        </div>
      </div>
    </div>
  );
}

function Propuestas({
  foto,
}: {
  foto: { url: string; alt: string; title: string } | null;
}) {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      {ESTILOS.map((s) => (
        <section
          key={s.id}
          className="rounded border border-zinc-200 bg-white p-4"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-serif text-xl">{s.nombre}</h2>
            <code className="text-[11px] text-zinc-500">{s.color}</code>
          </div>
          <p className="mt-1.5 text-sm text-zinc-600">{s.descripcion}</p>
          <div
            aria-hidden
            className="mt-3 h-44 rounded border border-zinc-100"
            style={{ background: s.background }}
          />
          {foto ? (
            <div className="mt-3 flex gap-3">
              <img
                src={foto.url}
                alt={foto.alt}
                className="h-40 w-32 shrink-0 rounded-sm border border-zinc-200 object-cover"
                loading="lazy"
              />
              <ul className="flex-1 space-y-1.5 text-xs leading-relaxed text-zinc-600">
                {s.pasos.map((paso) => (
                  <li key={paso} className="flex gap-1.5">
                    <span aria-hidden className="text-zinc-400">
                      —
                    </span>
                    <span>{paso}</span>
                  </li>
                ))}
              </ul>
              <p className="sr-only">
                Foto de muestra del archivo: {foto.title}
              </p>
            </div>
          ) : (
            <ul className="mt-3 space-y-1.5 text-xs leading-relaxed text-zinc-600">
              {s.pasos.map((paso) => (
                <li key={paso} className="flex gap-1.5">
                  <span aria-hidden className="text-zinc-400">
                    —
                  </span>
                  <span>{paso}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
      {foto ? (
        <p className="text-[11px] text-zinc-500 md:col-span-2">
          Foto de muestra del archivo: {foto.title}
        </p>
      ) : null}
    </div>
  );
}