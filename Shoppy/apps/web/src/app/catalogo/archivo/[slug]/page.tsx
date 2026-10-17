import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { initialEditorial } from "../../../../lib/editorial.server";
import { ArchiveGallery } from "./ArchiveGallery";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const entry = (await initialEditorial()).archive.find(
      (e) => e.slug === slug,
    );
    return {
      title: entry?.title ?? "Archivo",
      description:
        "Archivo de Instagram de vinta.zhe. No disponible para compra.",
    };
  } catch {
    return { title: "Archivo" };
  }
}
export default async function ArchivePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let content;
  try {
    content = await initialEditorial();
  } catch {
    return (
      <div role="alert" className="py-16">
        <h1 className="font-display text-3xl">No pudimos cargar el archivo</h1>
        <Link
          href={`/catalogo/archivo/${slug}`}
          className="inline-flex min-h-11 items-center underline"
        >
          Reintentar
        </Link>
      </div>
    );
  }
  const entry = content.archive.find((e) => e.slug === slug);
  if (!entry) notFound();
  return (
    <div>
      <nav
        aria-label="Ruta de navegación"
        className="mb-6 flex gap-3 text-sm text-muted"
      >
        <Link
          href="/catalogo?tipo=archivo"
          className="inline-flex min-h-11 items-center underline"
        >
          Catálogo · Archivo
        </Link>
      </nav>
      <div className="grid min-w-0 grid-cols-1 gap-6 md:grid-cols-2 md:gap-12">
        <div className="min-w-0 md:col-start-2 md:row-start-1">
          <p className="text-sm text-muted">Archivo de Instagram</p>
          <h1 className="mt-2 font-display text-4xl">{entry.title}</h1>
          <p className="mt-5 border-y border-line py-4 text-sm">
            No disponible para compra
          </p>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-muted">
            Esta fotografía forma parte del archivo de vinta.zhe. No confirma
            disponibilidad, precio, talla ni estado actual de las prendas.
          </p>
          {entry.publishedAt ? (
            <p className="mt-4 text-xs text-muted">
              Publicación original:{" "}
              <time dateTime={entry.publishedAt}>
                {new Date(entry.publishedAt).toLocaleDateString("es-CL", {
                  timeZone: "UTC",
                })}
              </time>
            </p>
          ) : null}
          <a
            href={entry.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex min-h-11 items-center border-b border-carbon text-sm"
          >
            Ver publicación en Instagram{" "}
            <span className="sr-only">(abre otra pestaña)</span>
          </a>
        </div>
        <div className="min-w-0 md:col-start-1 md:row-start-1">
          <ArchiveGallery entry={entry} />
        </div>
      </div>
    </div>
  );
}
