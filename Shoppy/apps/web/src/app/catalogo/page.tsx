import { Suspense } from "react";
import CatalogContent from "./CatalogContent";
import { initialProducts } from "../../lib/editorial.server";
import { ProductGridSkeleton } from "../../components/ProductCard";
export const dynamic = "force-dynamic";
export default async function CatalogoPage() {
  const products = await initialProducts();
  return (
    <Suspense fallback={<ProductGridSkeleton />}>
      <CatalogContent
        initialProducts={products}
      />
    </Suspense>
  );
}