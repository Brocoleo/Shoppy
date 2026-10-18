import { notFound } from "next/navigation";
import ProductDetail from "./ProductDetail";
import { initialProductBySlug } from "../../../lib/editorial.server";
import { ServerReadError } from "../../../components/States";

export const dynamic = "force-dynamic";

/**
 * SSR de la prenda: el HTML inicial ya trae la ficha completa (antes un fetch
 * client reemplazaba un skeleton y empujaba al footer → CLS 0.09 y LCP lento).
 */
export default async function ProductoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let product = null;
  try {
    product = await initialProductBySlug(slug);
  } catch {
    return (
      <ServerReadError message="La tienda no está disponible en este momento. Vuelve a intentarlo más tarde." />
    );
  }
  if (!product) notFound();
  return <ProductDetail product={product} />;
}
