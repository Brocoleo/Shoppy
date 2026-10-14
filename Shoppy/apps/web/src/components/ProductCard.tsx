"use client";

import Image from "next/image";
import Link from "next/link";
import { formatCLP } from "../lib/format";
import { productCover, type CatalogProduct } from "../lib/catalog";

const CONDITION_LABEL: Record<string, string> = {
  como_nuevo: "Como nuevo",
  excelente: "Excelente",
  bueno: "Bueno",
  con_detalles: "Con detalles",
};

export function ProductCard({ product }: { product: CatalogProduct }) {
  const cover = productCover(product);
  return (
    <Link
      href={`/producto/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white transition hover:shadow-md"
    >
      <div className="relative aspect-[3/4] w-full bg-zinc-100">
        {cover ? (
          <Image src={cover} alt={product.name} fill sizes="(max-width: 640px) 50vw, 25vw" className="object-cover" />
        ) : null}
        {product.compareAtPriceClp && product.compareAtPriceClp > product.priceClp ? (
          <span className="absolute left-2 top-2 rounded bg-red-700 px-2 py-0.5 text-xs font-semibold text-white">
            Oferta
          </span>
        ) : null}
        {product.stock <= 0 ? (
          <span className="absolute inset-x-0 bottom-0 bg-zinc-900/70 py-1 text-center text-xs font-medium text-white">
            Agotado
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="text-xs uppercase tracking-wide text-zinc-500">{product.brand}</p>
        <p className="line-clamp-2 text-sm font-medium leading-snug">{product.name}</p>
        <p className="text-xs text-zinc-500">
          {CONDITION_LABEL[product.condition] ?? product.condition} · Talla {product.size}
        </p>
        <div className="mt-auto flex items-baseline gap-2 pt-1">
          <span className="text-base font-bold">{formatCLP(product.priceClp)}</span>
          {product.compareAtPriceClp && product.compareAtPriceClp > product.priceClp ? (
            <span className="text-xs text-zinc-400 line-through">{formatCLP(product.compareAtPriceClp)}</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

export function ProductGrid({ products }: { products: CatalogProduct[] }) {
  if (products.length === 0) {
    return <p className="py-10 text-center text-sm text-zinc-500">No hay prendas aquí por ahora.</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}
