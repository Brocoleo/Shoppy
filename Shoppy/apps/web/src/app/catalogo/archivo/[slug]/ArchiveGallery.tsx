"use client";
import { useState } from "react";
import Image from "next/image";
import type { ArchiveEntry } from "@shopy/shared/editorial";
import { publicImageUrl } from "../../../../lib/productImageUrl";
export function ArchiveGallery({ entry }: { entry: ArchiveEntry }) {
  const [selected, setSelected] = useState(0),
    current = entry.images[selected] ?? entry.images[0];
  return (
    <div className="min-w-0">
      <div className="relative aspect-[4/5] overflow-hidden bg-parchment">
        <Image
          src={publicImageUrl(current.storagePath)}
          alt={current.alt}
          fill
          sizes="(max-width:767px) calc(100vw - 40px), 48vw"
          className="object-cover"
        />
      </div>
      <div
        className="mt-3 flex gap-2 overflow-x-auto pb-2"
        role="group"
        aria-label="Fotografías del archivo"
      >
        {entry.images.map((img, i) => (
          <button
            key={img.storagePath}
            type="button"
            aria-label={`Ver foto ${i + 1} de ${entry.images.length}`}
            aria-pressed={i === selected}
            onClick={() => setSelected(i)}
            className={`relative h-20 w-16 shrink-0 border-2 ${i === selected ? "border-carbon" : "border-transparent"}`}
          >
            <Image
              src={publicImageUrl(img.storagePath)}
              alt=""
              fill
              sizes="64px"
              className="object-cover"
            />
          </button>
        ))}
      </div>
      <p className="mt-1 text-xs text-muted" role="status">
        Foto {selected + 1} de {entry.images.length}
      </p>
    </div>
  );
}
