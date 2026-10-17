import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Catálogo",
  description:
    "Explora las prendas de segunda mano disponibles y el archivo fotográfico de vinta.zhe. Filtra por categoría, marca y precio.",
  alternates: { canonical: "/catalogo" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
