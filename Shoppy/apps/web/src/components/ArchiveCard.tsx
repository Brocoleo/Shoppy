import Image from "next/image";
import Link from "next/link";
import type { ArchiveEntry } from "@shopy/shared/editorial";
import { publicImageUrl } from "../lib/productImageUrl";
export function ArchiveCard({
  entry,
  eager = false,
}: {
  entry: ArchiveEntry;
  eager?: boolean;
}) {
  const image = entry.images[0];
  return (
    <li className="min-w-0">
      <Link
        href={`/catalogo/archivo/${entry.slug}`}
        className="group flex h-full flex-col gap-3"
      >
        <div className="relative aspect-[4/5] overflow-hidden bg-parchment">
          <Image
            src={publicImageUrl(image.storagePath)}
            alt={image.alt}
            fill
            loading={eager ? "eager" : "lazy"}
            sizes="(max-width: 639px) 46vw, (max-width: 1023px) 30vw, 23vw"
            className="card-zoom object-cover"
          />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <span className="font-display text-xl leading-tight">
            {entry.title}
          </span>
          <span className="text-xs text-muted">Archivo de Instagram</span>
          <span className="mt-auto pt-1 text-xs leading-relaxed text-muted">
            No disponible para compra
          </span>
        </div>
      </Link>
    </li>
  );
}
export function ArchiveGrid({
  items,
  eager = false,
}: {
  items: ArchiveEntry[];
  eager?: boolean;
}) {
  return (
    <ul
      aria-label="Archivo de Instagram"
      className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-4"
    >
      {items.map((entry, index) => (
        <ArchiveCard key={entry.id} entry={entry} eager={eager && index < 4} />
      ))}
    </ul>
  );
}
