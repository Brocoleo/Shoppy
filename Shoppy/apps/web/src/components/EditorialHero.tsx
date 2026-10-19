import Image from "next/image";
import Link from "next/link";
import { DEFAULT_HERO, type HeroConfig } from "@shopy/shared/editorial";
import { publicImageUrl } from "../lib/productImageUrl";
export function EditorialHero({
  config = DEFAULT_HERO,
}: {
  config?: HeroConfig;
}) {
  return (
    <section aria-labelledby="hero-titulo" className="editorial-hero">
      <div className="editorial-copy">
        <p className="mb-5 text-sm text-muted">vinta.zhe</p>
        <h1 id="hero-titulo" className="editorial-title">
          <span>{config.title}</span>
          <em>{config.secondLine}</em>
        </h1>
        <Link href={config.ctaHref} className="editorial-link editorial-action">
          {config.ctaLabel}
          <span aria-hidden="true">⟶</span>
        </Link>
        <p className="mt-5 max-w-xs text-sm leading-relaxed text-muted">
          Prendas de segunda mano seleccionadas en Chile. Explora el catálogo.
        </p>
      </div>
      {config.primary ? (
        <div className="editorial-main-photo">
          <Image
            src={publicImageUrl(config.primary.storagePath)}
            alt={config.primary.alt}
            fill
            preload
            sizes="(max-width: 767px) calc(100vw - 40px), (max-width: 1439px) 48vw, 627px"
            style={{
              objectFit: "cover",
              objectPosition: config.primary.position ?? "center",
            }}
          />
        </div>
      ) : (
        <div className="editorial-main-photo flex items-center justify-center bg-parchment p-8">
          <span className="font-display text-4xl">vinta.zhe</span>
        </div>
      )}
      {config.secondary ? (
        <div className="editorial-secondary-photo">
          <Image
            src={publicImageUrl(config.secondary.storagePath)}
            alt={config.secondary.alt}
            fill
            sizes="(max-width: 767px) 1px, 24vw"
            style={{
              objectFit: "cover",
              objectPosition: config.secondary.position ?? "center",
            }}
          />
        </div>
      ) : null}
    </section>
  );
}
