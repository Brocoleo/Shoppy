"use client";

import Image from "next/image";
import Link from "next/link";
import { formatCLP } from "../lib/format";
import { productCover, type CatalogProduct } from "../lib/catalog";
import { EmptyState } from "./States";

const CONDITION_LABEL: Record<string, string> = {
  como_nuevo: "Como nuevo",
  excelente: "Excelente",
  bueno: "Bueno",
  con_detalles: "Con detalles",
};

export function ProductCard({ product }: { product: CatalogProduct }) {
  const cover = productCover(product);
  const onSale = (product.compareAtPriceClp ?? 0) > product.priceClp;
  const soldOut = product.stock <= 0;

  return (
    <li className="[content-visibility:auto]">
      <Link
        href={`/producto/${product.slug}`}
        aria-label={`${product.name}, ${product.brand}, ${formatCLP(product.priceClp)}${soldOut ? ", agotada" : ""}`}
        className="group flex h-full flex-col"
      >
        <span className="relative block aspect-[3/4] w-full overflow-hidden bg-parchment">
          {cover ? (
            <Image
              src={cover}
              alt=""
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="card-zoom object-cover"
              loading="lazy"
            />
          ) : null}
          {onSale && !soldOut ? (
            <span className="absolute bottom-0 left-0 bg-carbon px-2 py-0.5 text-[11px] uppercase tracking-[0.14em] text-ivory">
              Oferta
            </span>
          ) : null}
          {soldOut ? (
            <span className="absolute inset-x-0 bottom-0 bg-carbon/80 py-1.5 text-center text-xs uppercase tracking-[0.14em] text-ivory">
              Agotada
            </span>
          ) : null}
        </span>
        <span className="flex flex-1 flex-col gap-0.5 pt-2.5">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">{product.brand}</span>
          <span className="line-clamp-2 min-h-[2.75em] font-display text-base leading-snug text-carbon">
            {product.name}
          </span>
          <span className="text-xs text-muted">
            Talla {product.size} · {CONDITION_LABEL[product.condition] ?? product.condition}
          </span>
          <span className="flex items-baseline gap-2 pt-0.5">
            <span className="tnum text-[15px] font-bold text-carbon">{formatCLP(product.priceClp)}</span>
            {onSale ? (
              <span className="text-xs text-muted line-through">{formatCLP(product.compareAtPriceClp!)}</span>
            ) : null}
          </span>
        </span>
      </Link>
    </li>
  );
}

export function ProductGrid({ products }: { products: CatalogProduct[] }) {
  if (products.length === 0) {
    return <EmptyState message="No hay prendas aquí por ahora." />;
  }
  return (
    <ul aria-label="Productos" className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-4">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </ul>
  );
}

/** Esqueleto 3:4 con la misma retícula que el grid real (evita saltos de layout). */
export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div aria-busy="true" aria-label="Cargando productos" className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col">
          <div className="shimmer aspect-[3/4] w-full animate-shimmer" />
          <div className="shimmer mt-2.5 h-3 w-1/3 animate-shimmer" />
          <div className="shimmer mt-1.5 h-4 w-4/5 animate-shimmer" />
          <div className="shimmer mt-1.5 h-3 w-1/2 animate-shimmer" />
        </div>
      ))}
    </div>
  );
}
