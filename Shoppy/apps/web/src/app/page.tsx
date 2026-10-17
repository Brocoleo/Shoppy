import type { Metadata } from "next";
import HomeContent from "../components/HomeContent";
import { initialEditorial, initialProducts } from "../lib/editorial.server";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};
export default async function HomePage() {
  const [products, editorial] = await Promise.allSettled([
    initialProducts(),
    initialEditorial(),
  ]);
  return (
    <HomeContent
      initialProducts={
        products.status === "fulfilled" ? products.value : undefined
      }
      initialEditorial={
        editorial.status === "fulfilled" ? editorial.value : undefined
      }
    />
  );
}
