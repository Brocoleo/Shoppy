import { isPublicProduct } from "@shopy/shared/editorial";
import type { Metadata } from "next";
import { cache } from "react";
import { publicServerDb } from "../../../lib/editorial.server";
import { publicImageUrl } from "../../../lib/productImageUrl";
import { SITE_URL } from "../../../lib/site";

/**
 * Datos mínimos para metadatos y datos estructurados por prenda.
 * Solo lectura pública (anon key + RLS); nunca expone stock privado de otros.
 */
interface SeoProduct {
  slug: string;
  name: string;
  description: string;
  brand: string | null;
  size: string | null;
  priceClp: number;
  stock: number;
  isDemo: boolean;
  images: string[];
}

interface SeoRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  size: string | null;
  metadata: Record<string, unknown> | null;
  price_clp: number;
  stock: number;
  brand: { name: string } | null;
  product_images:
    | { storage_path: string; is_cover: boolean; sort_order: number }[]
    | null;
}

/** Memoizado por petición: generateMetadata y el layout comparten una consulta. */
const loadSeoProduct = cache(async (slug: string): Promise<SeoProduct | null> => {
  try {
    const { data } = await publicServerDb()
      .from("products")
      .select(
        "id,slug,name,description,size,metadata,price_clp,stock,brand:brands(name),product_images(storage_path,is_cover,sort_order)",
      )
      .eq("slug", slug)
      .maybeSingle();
    const row = data as unknown as SeoRow | null;
    if (!row || !isPublicProduct(row)) return null;
    const images = [...(row.product_images ?? [])]
      .sort(
        (a, b) => Number(b.is_cover) - Number(a.is_cover) || a.sort_order - b.sort_order,
      )
      .map((image) => publicImageUrl(image.storage_path));
    return {
      slug: row.slug,
      name: row.name,
      description: row.description ?? "",
      brand: row.brand?.name ?? null,
      size: row.size,
      priceClp: row.price_clp,
      stock: row.stock,
      isDemo: row.metadata?.demo === true,
      images,
    };
  } catch {
    return null;
  }
});

function seoDescription(product: SeoProduct): string {
  if (product.description.trim()) {
    const clean = product.description.replace(/\s+/g, " ").trim();
    return clean.length > 155 ? `${clean.slice(0, 152).trimEnd()}…` : clean;
  }
  const brand = product.brand ? ` de ${product.brand}` : "";
  const size = product.size ? ` Talla ${product.size}.` : "";
  return `Prenda de segunda mano${brand} en vinta.zhe.${size} Compra segura con envío a todo Chile.`;
}

/** Product + BreadcrumbList: habilita resultados enriquecidos de Google. */
function productJsonLd(product: SeoProduct): string {
  const url = `${SITE_URL}/producto/${product.slug}`;
  const offers =
    !product.isDemo && product.priceClp > 0
      ? {
          "@type": "Offer",
          url,
          priceCurrency: "CLP",
          price: product.priceClp,
          itemCondition: "https://schema.org/UsedCondition",
          availability:
            product.stock > 0
              ? "https://schema.org/InStock"
              : "https://schema.org/OutOfStock",
          seller: { "@id": `${SITE_URL}/#organizacion` },
        }
      : undefined;

  const graph: Record<string, unknown>[] = [
    {
      "@type": "Product",
      "@id": `${url}#prenda`,
      name: product.name,
      ...(product.description ? { description: product.description } : {}),
      ...(product.images.length ? { image: product.images } : {}),
      ...(product.brand
        ? { brand: { "@type": "Brand", name: product.brand } }
        : {}),
      itemCondition: "https://schema.org/UsedCondition",
      ...(offers ? { offers } : {}),
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Inicio", item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: "Catálogo", item: `${SITE_URL}/catalogo` },
        { "@type": "ListItem", position: 3, name: product.name },
      ],
    },
  ];

  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(
    /</g,
    "\\u003c",
  );
}

/**
 * Título, canónica y datos estructurados por prenda para crawlers y pestañas.
 * Los datos visibles los sigue cargando la página cliente.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await loadSeoProduct(slug);
  if (!product) {
    return { title: "Prenda no disponible", robots: { index: false, follow: true } };
  }

  const brandSuffix =
    product.brand && !product.name.toLowerCase().includes(product.brand.toLowerCase())
      ? ` · ${product.brand}`
      : "";
  const title = `${product.name}${brandSuffix}`;
  const description = seoDescription(product);
  const canonical = `/producto/${product.slug}`;
  const cover = product.images[0];

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      title,
      description,
      url: canonical,
      images: cover ? [{ url: cover, alt: product.name }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: cover ? [cover] : undefined,
    },
  };
}

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await loadSeoProduct(slug);
  return (
    <>
      {product ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: productJsonLd(product) }}
        />
      ) : null}
      {children}
    </>
  );
}
