"use client";

import Image from "next/image";
import Link from "next/link";
import { productCover, type CatalogProduct } from "../lib/catalog";
import { formatCLP } from "../lib/format";

/**
 * Hero editorial mobile-first: la fotografía manda.
 * En móvil la foto va primero (4:5) y el bloque carbón es compacto;
 * en desktop, texto + foto en 2 columnas.
 */
export function EditorialHero({ product }: { product: CatalogProduct | undefined }) {
  const cover = product ? productCover(product) : null;

  return (
    <section
      aria-labelledby="hero-titulo"
      className="grid overflow-hidden bg-ivory md:grid-cols-2 md:bg-carbon md:text-ivory"
    >
      <div className="relative order-first aspect-[4/5] max-h-[26rem] w-full bg-parchment sm:max-h-[30rem] md:order-last md:aspect-auto md:max-h-none md:min-h-[28rem]">
        {cover && product ? (
          <Image
            src={cover}
            alt={product.name}
            fill
            priority
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover"
          />
        ) : (
          <p
            aria-hidden="true"
            className="flex h-full min-h-72 items-center justify-center p-8 text-center font-display text-2xl italic text-muted"
          >
            Nueva selección cada semana
          </p>
        )}
        {cover && product ? (
          <Link
            href={`/producto/${product.slug}`}
            className="absolute inset-x-3 bottom-3 flex items-center justify-between bg-ivory/95 px-4 py-2.5 text-carbon backdrop-blur transition-colors hover:bg-ivory"
            aria-label={`Ver prenda destacada: ${product.name}`}
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{product.name}</span>
              <span className="block text-[11px] uppercase tracking-[0.14em] text-muted">
                Destacado · {product.brand}
              </span>
            </span>
            <span className="pl-3 text-sm font-bold">{formatCLP(product.priceClp)}</span>
          </Link>
        ) : null}
      </div>

      <div className="flex flex-col justify-center gap-3 bg-carbon p-6 text-ivory sm:gap-4 sm:p-8 md:p-12">
        <p className="text-[11px] uppercase tracking-[0.28em] text-taupe">
          Segunda mano verificada
        </p>
        <h1
          id="hero-titulo"
          className="font-display text-3xl leading-[1.05] tracking-tight sm:text-4xl md:text-5xl"
        >
          Prendas únicas,
          <br />
          precios justos.
        </h1>
        <p className="max-w-md text-sm leading-relaxed text-ivory/70">
          Prendas únicas verificadas. Si te gusta, no la dejes pasar.
        </p>
        <div className="flex flex-wrap gap-2.5 pt-1 sm:gap-3">
          <Link
            href="/catalogo"
            className="bg-ivory px-5 py-2 text-xs uppercase tracking-[0.12em] text-carbon transition-colors hover:bg-taupe sm:px-6 sm:py-2.5 sm:text-sm"
          >
            Ver catálogo
          </Link>
          <Link
            href="/coleccion/ofertas"
            className="border border-ivory/40 px-5 py-2 text-xs uppercase tracking-[0.12em] text-ivory transition-colors hover:border-ivory sm:px-6 sm:py-2.5 sm:text-sm"
          >
            Ver ofertas
          </Link>
        </div>
      </div>
    </section>
  );
}
