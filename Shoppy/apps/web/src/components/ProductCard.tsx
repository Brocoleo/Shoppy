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

export function ProductCard({
  product,
  loading = "lazy",
}: {
  product: CatalogProduct;
  loading?: "eager" | "lazy";
}) {
  const cover = productCover(product);
  const onSale = (product.compareAtPriceClp ?? 0) > product.priceClp;
  const soldOut = product.stock <= 0 || product.isDemo;

  return (
    <li className="[content-visibility:auto] [contain-intrinsic-size:auto_420px]">
      <Link
        href={`/producto/${product.slug}`}
        aria-label={`${product.name}, ${product.brand}, ${formatCLP(product.priceClp)}${product.isDemo ? ", producto de demostración, precio ilustrativo" : soldOut ? ", agotada" : ""}`}
        className="group flex h-full flex-col"
      >
        <span className="relative block aspect-[4/5] w-full overflow-hidden bg-parchment">
          {cover ? (
            <Image
              src={cover}
              alt=""
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="card-zoom object-cover"
              loading={loading}
            />
          ) : null}
          {onSale && !soldOut ? (
            <span className="absolute bottom-0 left-0 bg-carbon px-2 py-0.5 text-[11px] uppercase tracking-[0.14em] text-ivory">
              Oferta
            </span>
          ) : null}
          {soldOut && !product.isDemo ? (
            <span className="absolute inset-x-0 bottom-0 bg-carbon/80 py-1.5 text-center text-xs uppercase tracking-[0.14em] text-ivory">
              Agotada
            </span>
          ) : null}
        </span>
        <span className="flex flex-1 flex-col gap-1 pt-3">
          {!product.isDemo ? <span className="text-xs text-muted">{product.brand}</span> : null}
          <span className="line-clamp-2 font-display text-lg leading-snug sm:text-xl text-carbon">
            {product.name}
          </span>
          {product.isDemo ? <span className="text-xs leading-relaxed text-muted">Producto de demostración · Imagen generada</span> : <span className="text-xs text-muted">
            Talla {product.size} · {CONDITION_LABEL[product.condition] ?? product.condition}
          </span>}
          <span className="mt-auto flex flex-wrap items-baseline gap-x-2 gap-y-0.5 pt-2">
            <span className="tnum text-base font-semibold sm:text-lg text-carbon">{formatCLP(product.priceClp)}</span>
            {product.isDemo ? <span className="text-xs text-muted">Precio ilustrativo</span> : null}
            {onSale ? (
              <span className="text-xs text-muted line-through">{formatCLP(product.compareAtPriceClp!)}</span>
            ) : null}
          </span>
        </span>
      </Link>
    </li>
  );
}

/** Retícula única de catálogo: la comparten el grid real, el esqueleto y los listados filtrados. */
export const PRODUCT_GRID_CLASS =
  "grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 sm:gap-x-5 sm:gap-y-12 lg:grid-cols-4";

export function ProductGrid({ products, priority = false }: { products: CatalogProduct[]; priority?: boolean }) {
  if (products.length === 0) {
    return <EmptyState message="No hay prendas aquí por ahora." />;
  }
  return (
    <ul aria-label="Productos" className={PRODUCT_GRID_CLASS}>
      {products.map((p, index) => (
        <ProductCard key={p.id} product={p} loading={priority && index < 4 ? "eager" : "lazy"} />
      ))}
    </ul>
  );
}

/** Esqueleto 4:5 con la misma retícula que el grid real (evita saltos de layout). */
export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando productos" className={PRODUCT_GRID_CLASS}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col">
          <div className="shimmer aspect-[4/5] w-full animate-shimmer" />
          <div className="shimmer mt-2.5 h-3 w-1/3 animate-shimmer" />
          <div className="shimmer mt-1.5 h-4 w-4/5 animate-shimmer" />
          <div className="shimmer mt-1.5 h-3 w-1/2 animate-shimmer" />
        </div>
      ))}
    </div>
  );
}
