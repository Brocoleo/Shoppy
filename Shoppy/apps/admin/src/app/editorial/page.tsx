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

const PROMPT_EDITORIAL = `Edita la fotografía original de esta prenda para crear una composición profesional de e-commerce, hiperrealista y natural, manteniendo la identidad visual del producto.

═══════════════════════════════════════════
DISTRIBUCIÓN VISUAL OBJETIVO — NO NEGOCIABLE
┌──────────────────────────────────────────┐
│  ████████████████████████  85 % PRENDA   │
│  ██████  15 % MODELO (soporte visual)    │
└──────────────────────────────────────────┘
La prenda llena 80–85 % del encuadre. La modelo es solo el 15–20 % restante
(cintura y francha mínima de top/abdomen). Si la modelo ocupa más, el prompt falló.
═══════════════════════════════════════════

**REGLA PRINCIPAL: LA PRENDA ES LA PROTAGONISTA.**

### 1. Encuadre de la fotografía principal
Mostrar la prenda puesta en una modelo adulta, utilizando un encuadre cerrado de producto, no un retrato de moda.
- La prenda debe ocupar aproximadamente el 80–85% del protagonismo visual.
- La modelo debe representar como máximo el 15–20% del protagonismo visual.
- Recortar el cuerpo inmediatamente por encima de la cintura, mostrando únicamente una pequeña franja del top y abdomen.
- El encuadre inferior debe terminar entre 5 y 10 cm debajo del borde de la falda.
- No mostrar rostro, cabeza, hombros, pecho, rodillas ni piernas completas.
- Evitar poses llamativas, movimientos exagerados y accesorios.
- La modelo debe estar de pie, en posición frontal natural, con los brazos relajados.
- Cámara a la altura de la prenda, sin perspectiva dramática.
La imagen debe parecer una fotografía de producto con una persona utilizándolo, NO una sesión fotográfica de una modelo.

### 2. Fidelidad a la prenda original
Utilizar la fotografía original como referencia obligatoria.
Mantener la forma, el color, las costuras, el pliegue central, los bolsillos, la textura, la etiqueta, el largo y las marcas de desgaste reales.
No inventar estampados, modificar proporciones, reemplazar etiquetas ni mejorar artificialmente el estado de la prenda.

### 3. Composición editorial
Crear una imagen vertical 4:5 con tres fotografías:
**Fotografía principal:** aproximadamente 70% del espacio total, mostrando la prenda puesta con el encuadre cerrado descrito anteriormente.
**Detalle 1:** acercamiento al pliegue central y las costuras originales.
**Detalle 2:** acercamiento a la etiqueta original y textura de la tela.
Los detalles deben ser secundarios y mantener coherencia visual con la fotografía principal.

### 4. Estética fotográfica
Fotografía casera profesional, realista y sin retoques excesivos.
Fondo beige claro de lino, iluminación suave de ventana desde la izquierda, sombras naturales y colores fieles.
Conservar pequeñas imperfecciones fotográficas, arrugas auténticas, textura real del denim y asimetrías naturales.
Evitar apariencia CGI, piel plastificada, texturas artificiales, iluminación cinematográfica y retoques de moda.

### 5. Restricciones prioritarias
No generar fotografías de cuerpo entero.
No ampliar el encuadre para mostrar más partes de la modelo.
No convertir la imagen en una campaña publicitaria centrada en la persona.
No agregar textos, logos, accesorios ni elementos decorativos.

El objetivo es que el comprador observe inmediatamente la prenda, su forma, su caída, su textura y sus detalles, utilizando a la modelo únicamente como soporte visual para mostrar cómo queda puesta.`;

const PROMPT_GORRA = `Edita la fotografía original de esta gorra para crear una composición profesional de e-commerce, hiperrealista y natural, manteniendo la identidad visual del producto.

═══════════════════════════════════════════
DISTRIBUCIÓN VISUAL OBJETIVO — NO NEGOCIABLE
┌──────────────────────────────────────────┐
│  ████████████████████████  85 % GORRA    │
│  ██████  15 % MODELO (soporte visual)    │
└──────────────────────────────────────────┘
La gorra llena 80–85 % del encuadre. La modelo es solo el 15–20 % restante
(cuello y una franja mínima de sienes/recedimiento). Si la modelo o el entorno ocupan más, el prompt falló.
═══════════════════════════════════════════

**REGLA PRINCIPAL: LA GORRA ES LA PROTAGONISTA.**

### 1. Encuadre de la fotografía principal
Mostrar la gorra puesta en una modelo adulta, utilizando un encuadre cerrado de producto, no un retrato de moda.
- La gorra debe ocupar aproximadamente el 80–85% del protagonismo visual.
- La modelo debe representar como máximo el 15–20% del protagonismo visual.
- Recortar la cabeza de forma cerrada: incluir únicamente la gorra, una franja muy pequeña de sienes/recedimiento bajo el borde y el arranque del cuello.
- El encuadre debe acabar justo por debajo del borde inferior de la visera curvada, mostrando apenas el arranque de la barbilla difuminado en sombra, sin labios ni mandíbula visible.
- No mostrar rostro completo, ojos expresivos, hombros completos ni torso.
- Evitar poses llamativas, sonrisas, movimientos exagerados y accesorios (gafas, pendientes, aretes, tatuajes visibles).
- La modelo debe estar de frente natural, con la cabeza ligeramente inclinada hacia abajo (posición neutra de producto, no mirando a cámara).
- Cámara a la altura de la gorra, ligeramente frontal con leve ángulo de 3/4 para que la visera y los paneles se lean con claridad, sin perspectiva dramática.
La imagen debe parecer una fotografía de producto con una persona utilizándolo, NO una sesión fotográfica de una modelo.

### 2. Fidelidad a la gorra original
Utilizar la fotografía original como referencia obligatoria.
Mantener la forma exacta de la copa (número de paneles), la curvatura real de la visera, el color, las costuras de los paneles y de la visera, los ojales de ventilación, el cierre trasero (broche, velcro o hebilla, tal cual sea), la etiqueta frontal o laterales tal como están, la textura de la tela y cualquier marca de desgaste real.
No inventar logotipos, modificar la curvatura de la visera, reemplazar el cierre trasero, cambiar la tonalidad ni "mejorar" artificialmente el estado de la prenda.

### 3. Composición editorial
Crear una imagen vertical 4:5 con tres fotografías:
**Fotografía principal:** aproximadamente 70% del espacio total, mostrando la gorra puesta con el encuadre cerrado descrito anteriormente.
**Detalle 1:** acercamiento a la visera y las costuras originales de los paneles (punto central de la copa incluido).
**Detalle 2:** acercamiento al cierre trasero y a la etiqueta original con la textura de la tela.
Los detalles deben ser secundarios y mantener coherencia visual con la fotografía principal.

### 4. Estética fotográfica
Fotografía casera profesional, realista y sin retoques excesivos.
Fondo beige claro de lino, iluminación suave de ventana desde la izquierda, sombras naturales (que la propia visera proyecte una sombra suave y creíble sobre la sien) y colores fieles.
Conservar pequeñas imperfecciones fotográficas, textura real de la tela (sarga, ribete o pana según sea la gorra), arrugas auténticas de la copa y asimetrías naturales del bordado.
Evitar apariencia CGI, piel plastificada, bordados digitalmente perfectos, iluminación cinematográfica y retoques de moda.

### 5. Restricciones prioritarias
No generar fotografías de cabeza y hombros en marco abierto ni medio cuerpo.
No ampliar el encuadre para mostrar más rostro, cuello o torso de la modelo.
No convertir la imagen en una campaña publicitaria centrada en la persona.
No agregar textos, logotipos inventados, accesorios ni elementos decorativos.

El objetivo es que el comprador observe inmediatamente la gorra, su copa, su visera, su bordado, su textura y sus detalles, utilizando a la modelo únicamente como soporte visual para mostrar cómo queda puesta.`;

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
          Los prompts listos para copiar y pegar en ChatGPT adjuntando la
          foto cruda de la prenda o de la gorra. Mantienen la línea visual fija
          (lino blanco arrugado) entre todos los productos.
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <PromptCard
            title="1. Prompt /catálogo — foto para tarjeta"
            prompt={PROMPT_CATALOGO}
            hint="Resultado: prenda plana sobre lino blanco arrugado, 4:5. Para la portada del catálogo y la ficha principal."
            label="/catálogo"
          />
          <PromptCard
            title="2. Prompt /editorial — encuadre cerrado + 3 detalles"
            prompt={PROMPT_EDITORIAL}
            hint="Resultado: foto principal (prenda puesta 85% encuadre cerrado, sin rostro) + 2 detalles (pliegue/costuras + etiqueta/textura). Vertical 4:5, fondo lino beige, luz ventana. Para la galería de la ficha."
            label="/editorial"
          />
          <div className="md:col-span-2">
            <PromptCard
              title="3. Prompt /editorial-gorra — gorras (snapback, trucker, dad hat)"
              prompt={PROMPT_GORRA}
              hint="Resultado: foto principal (gorra puesta 85% del encuadre, recorte cerrado en sien y cuello, sin rostro) + 2 detalles (visera y costuras de paneles + cierre trasero y etiqueta). Vertical 4:5, fondo lino beige, luz de ventana con sombra de la visera. Para la galería de gorras."
              label="/editorial-gorra"
            />
          </div>
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