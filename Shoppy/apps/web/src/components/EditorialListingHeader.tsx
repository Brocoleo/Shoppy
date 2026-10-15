import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";

export function EditorialListingHeader({ title, image, children }: {
  title: string;
  image: "principal" | "secundario";
  children: ReactNode;
}) {
  return (
    <header className="listing-intro">
      <div className="listing-copy">
        <nav aria-label="Ruta de navegación" className="flex items-center gap-3 text-xs text-muted">
          <Link href="/" className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">Inicio</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{title}</span>
        </nav>
        <h1 className="listing-title">{title}</h1>
        {children}
      </div>
      <div className="listing-photo">
        <Image src={`/images/editorial/modelo-${image}.webp`} alt="" fill loading="eager" sizes="(max-width: 767px) 100px, 260px" className="object-cover" />
      </div>
    </header>
  );
}
