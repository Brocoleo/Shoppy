import { notFound } from "next/navigation";
import ColeccionDetail from "./ColeccionDetail";
import { initialCollection } from "../../../lib/editorial.server";
import { ServerReadError } from "../../../components/States";

export const dynamic = "force-dynamic";

/** SSR de la colección + sus prendas (antes: doble fetch client tras un skeleton). */
export default async function ColeccionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let data = null;
  try {
    data = await initialCollection(slug);
  } catch {
    return (
      <ServerReadError message="La tienda no está disponible en este momento. Vuelve a intentarlo más tarde." />
    );
  }
  if (!data) notFound();
  return <ColeccionDetail collection={data.collection} products={data.products} />;
}
