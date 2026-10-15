import Image from "next/image";
import Link from "next/link";

export function EditorialHero() {
  return (
    <section aria-labelledby="hero-titulo" className="editorial-hero">
      <div className="editorial-copy">
        <h1 id="hero-titulo" className="editorial-title">
          <span>Prendas únicas,</span>
          <em>precios justos.</em>
        </h1>
        <Link href="/catalogo" className="editorial-link editorial-action">
          Explorar prendas <span aria-hidden="true">⟶</span>
        </Link>
      </div>
      <div className="editorial-main-photo">
        <Image src="/images/editorial/modelo-principal.webp" alt="" fill priority sizes="(max-width: 767px) calc(100vw - 40px), (max-width: 1439px) calc(47.2vw - 53px), 627px" className="object-cover" />
      </div>
      <div className="editorial-secondary-photo">
        <Image src="/images/editorial/modelo-secundario.webp" alt="" fill sizes="(max-width: 767px) 1px, (max-width: 1439px) 22vw, 306px" className="object-cover" />
      </div>
    </section>
  );
}
