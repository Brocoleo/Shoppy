"use client";

import Link from "next/link";
import { EditorialListingHeader } from "../../../components/EditorialListingHeader";
import { ProductGrid } from "../../../components/ProductCard";
import type { CatalogCollection, CatalogProduct } from "../../../lib/catalogProduct";

/**
 * Listado de colección: la colección y sus prendas llegan ya por props (SSR),
 * sin estados de carga que intercambien el layout.
 */
export default function ColeccionDetail({
  collection,
  products,
}: {
  collection: CatalogCollection;
  products: CatalogProduct[];
}) {
  return (
    <div className="flex flex-col gap-8 sm:gap-10">
      <EditorialListingHeader title={collection.name} image="principal">
        <p className="text-sm text-muted">{products.length} prendas en esta colección</p>
      </EditorialListingHeader>
      {products.length > 0 ? <ProductGrid products={products} eager /> : <section className="border-y border-line py-10 text-center">
        <h2 className="font-display text-2xl">{collection.slug === "ofertas" ? "Todavía no hay ofertas disponibles" : "Esta colección todavía no tiene prendas disponibles"}</h2>
      </section>}
    </div>
  );
}
