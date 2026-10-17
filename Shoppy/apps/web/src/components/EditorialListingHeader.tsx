"use client";
import { useQuery } from "@tanstack/react-query";
import { loadEditorial, editorialQueryKey } from "../lib/editorial";
import { publicImageUrl } from "../lib/productImageUrl";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";

export function EditorialListingHeader({
  title,
  image,
  children,
}: {
  title: string;
  image: "principal" | "secundario";
  children: ReactNode;
}) {
  const editorial = useQuery({
    queryKey: editorialQueryKey,
    queryFn: loadEditorial,
  });
  const photo =
    image === "principal"
      ? editorial.data?.hero.primary
      : (editorial.data?.hero.secondary ?? editorial.data?.hero.primary);
  return (
    <header className="listing-intro">
      <div className="listing-copy">
        <nav
          aria-label="Ruta de navegación"
          className="flex items-center gap-3 text-xs text-muted"
        >
          <Link
            href="/"
            className="inline-flex min-h-11 items-center underline-offset-4 hover:underline"
          >
            Inicio
          </Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{title}</span>
        </nav>
        <h1 className="listing-title">{title}</h1>
        {children}
      </div>
      {photo ? (
        <div className="listing-photo">
          <Image
            src={publicImageUrl(photo.storagePath)}
            alt=""
            fill
            sizes="(max-width: 767px) 100px, 260px"
            style={{
              objectFit: "contain",
              objectPosition: photo.position ?? "center",
            }}
          />
        </div>
      ) : null}
    </header>
  );
}
