 "use client";

import Image from "next/image";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CatalogProduct } from "../../../lib/catalogProduct";
import { observeProduct } from "../../../lib/catalog";
import { formatCLP } from "../../../lib/format";
import { useCart } from "../../../lib/cart";

const CONDITION_LABEL: Record<string, string> = {
  como_nuevo: "Como nuevo",
  excelente: "Excelente",
  bueno: "Bueno",
  con_detalles: "Con detalles",
};

/**
 * Ficha de prenda: recibe el producto ya traído por el server (SSR), así no
 * hay swap de skeleton y el carrito es lo único que se hidrata del lado client.
 */
export default function ProductDetail({ product: p }: { product: CatalogProduct }) {
  const { add, ready } = useCart();
  const [added, setAdded] = useState(false);
  const [selectedImage, setSelectedImage] = useState(0);

  const images = p.remoteImages ?? [];
  const currentImage = images[selectedImage] ?? images[0];
  const cover = currentImage?.url ?? null;
  // Estado en vivo: el SSR trae la prenda, un sondeo liviano (15 s) refleja si
  // otra persona la reservó o la compró mientras la estás mirando.
  const live = useQuery({
    queryKey: ["expect-product-live", p.slug],
    queryFn: () => observeProduct(p.slug),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
  const stock = live.data?.stock ?? p.stock;
  const availability = live.data?.availability ?? p.availability;
  const agotada = p.isDemo || availability === "SOLD" || availability === "RESERVED" || stock <= 0;
  const textoBotonAgotada = availability === "SOLD" ? "Vendida" : availability === "RESERVED" ? "Reservada" : "Agotada";
  const hint = p.isDemo
    ? "Producto de demostración · Imagen generada"
    : availability === "SOLD" ? "Vendida" : availability === "RESERVED" ? "Reservada temporalmente por otro comprador" : agotada ? "Agotada" : stock === 1 ? "Última unidad disponible" : `${stock} unidades disponibles`;
  const onSale = (p.compareAtPriceClp ?? 0) > p.priceClp;

  return (
    <div className="grid min-w-0 gap-5 md:grid-cols-2 md:items-start md:gap-x-12 md:gap-y-6">
      <div className="min-w-0 md:col-start-2 md:row-start-1">
        <p className="text-sm text-muted">{p.isDemo ? "Producto de demostración · Imagen generada" : p.brand}</p>
        <h1 className="mt-1 font-display text-3xl leading-tight tracking-tight text-carbon sm:text-4xl">{p.name}</h1>
        <p className="mt-2 text-sm text-muted">Talla {p.size} · {CONDITION_LABEL[p.condition] ?? p.condition}{p.color ? ` · ${p.color}` : ""}</p>
        <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="tnum text-2xl font-semibold text-carbon sm:text-3xl">{formatCLP(p.priceClp)}</span>
          {onSale ? <span className="tnum text-base text-muted line-through">{formatCLP(p.compareAtPriceClp!)}</span> : null}
        </div>
        <p className={`mt-2 text-sm font-medium ${agotada ? "text-red-700" : "text-taupe-deep"}`}>
          {hint}
        </p>
      </div>

      <div className="min-w-0 md:col-start-1 md:row-span-2 md:row-start-1">
        {/* Altura determinista en el primer layout: aspect-ratio siempre, con cap 340px en móvil.
            (Antes `h-[min(85vw,340px)] md:aspect-[3/4]` variaba según resolución del CSS.) */}
        <div className="relative aspect-[4/5] max-h-[340px] w-full overflow-hidden bg-parchment md:max-h-none">
          {cover ? <Image src={cover} alt={`${p.name}${currentImage?.isDefect ? ": detalle del estado" : ""}`} fill sizes="(max-width: 767px) calc(100vw - 32px), (max-width: 1199px) 50vw, 528px" className="object-cover" priority /> : <p className="flex h-full items-center justify-center text-sm text-muted">Imagen no disponible</p>}
          {onSale && !agotada ? <span className="absolute bottom-3 left-3 bg-carbon px-3 py-1 text-xs text-ivory">Oferta</span> : null}
        </div>
        {images.length > 1 ? (
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Fotos de la prenda">
            {images.map((image, index) => (
              <button key={image.url} type="button" aria-pressed={selectedImage === index} aria-label={`Ver foto ${index + 1}${image.isDefect ? ", detalle del estado" : ""}`} onClick={() => setSelectedImage(index)} className="relative h-16 w-14 overflow-hidden border-2 border-transparent bg-parchment aria-pressed:border-carbon">
                <Image src={image.url} alt="" fill sizes="56px" className="object-contain" />
                {image.isDefect ? <span aria-hidden="true" className="absolute inset-x-0 bottom-0 bg-carbon py-0.5 text-[10px] text-ivory">Detalle</span> : null}
              </button>
            ))}
          </div>
        ) : null}
        <p role="status" className="mt-2 min-h-5 text-xs text-muted">{currentImage?.isDefect ? "Detalle del estado de la prenda" : images.length > 1 ? `Foto ${selectedImage + 1} de ${images.length}` : ""}</p>
      </div>

      <div className="flex min-w-0 flex-col gap-5 md:col-start-2 md:row-start-2">
        <button type="button" disabled={agotada || !ready} onClick={() => {
          add(p.id, 1); setAdded(true); setTimeout(() => setAdded(false), 2500);
        }} className="btn-press h-12 bg-carbon text-sm font-medium text-ivory hover:bg-carbon-soft disabled:opacity-40">
          {p.isDemo ? "Producto de demostración" : agotada ? textoBotonAgotada : !ready ? "Cargando carrito…" : added ? "¡Agregada al carrito!" : "Agregar al carrito"}
        </button>
        <p role="status" className="sr-only">{added ? "Prenda agregada al carrito" : ""}</p>
        {p.description ? <section aria-labelledby="descripcion-prenda" className="border-t border-line pt-5">
          <h2 id="descripcion-prenda" className="mb-2 text-sm font-semibold">Sobre esta prenda</h2>
          <p className="break-words text-sm leading-relaxed text-carbon/80">{p.description}</p>
        </section> : null}
        {p.tags.length > 0 ? <ul aria-label="Etiquetas" className="flex flex-wrap gap-2">{p.tags.map((tag) => <li key={tag} className="bg-parchment px-3 py-1.5 text-xs text-muted">#{tag}</li>)}</ul> : null}
      </div>
    </div>
  );
}
