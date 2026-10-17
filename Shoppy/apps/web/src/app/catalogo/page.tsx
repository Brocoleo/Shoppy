import { Suspense } from "react";
import CatalogContent from "./CatalogContent";
import { initialEditorial, initialProducts } from "../../lib/editorial.server";
import { ProductGridSkeleton } from "../../components/ProductCard";
export const dynamic = "force-dynamic";
export default async function CatalogoPage() {
  const [products, editorial] = await Promise.allSettled([
    initialProducts(),
    initialEditorial(),
  ]);
  return (
    <Suspense fallback={<ProductGridSkeleton />}>
      <CatalogContent
        initialProducts={
          products.status === "fulfilled" ? products.value : undefined
        }
        initialEditorial={
          editorial.status === "fulfilled" ? editorial.value : undefined
        }
      />
    </Suspense>
  );
}
