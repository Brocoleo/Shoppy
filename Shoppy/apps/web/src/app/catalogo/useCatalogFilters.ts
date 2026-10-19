"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ProductSort } from "../../lib/catalog";

export const SORTS: { value: ProductSort; label: string }[] = [
  { value: "tendencia", label: "Tendencia" },
  { value: "novedades", label: "Novedades" },
  { value: "precio-asc", label: "Menor precio" },
  { value: "precio-desc", label: "Mayor precio" },
];

export type Tipo = "todo" | "disponibles";

interface NextFilters {
  query: string;
  categoria: string;
  marca: string;
  orden: ProductSort;
}

/**
 * Filtros del catálogo con la **URL como única fuente de verdad**.
 * Centraliza la lectura y la escritura de `?q=&categoria=&marca=&orden=&tipo=`
 * para que la vista solo consuma estado ya resuelto (nada de `useState`
 * duplicado que se desincronice al compartir un enlace).
 */
export function useCatalogFilters() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const query = params.get("q") ?? "";
  const tipo: Tipo = params.get("tipo") === "disponibles" ? "disponibles" : "todo";
  const categoria = params.get("categoria") ?? "";
  const marca = params.get("marca") ?? "";
  const orden =
    SORTS.find((sort) => sort.value === params.get("orden"))?.value ??
    "novedades";

  // Marca que el próximo cambio de URL debe devolver el foco al buscador.
  const restoreSearchFocusRef = useRef(false);
  useEffect(() => {
    if (restoreSearchFocusRef.current) {
      document.getElementById("buscar-prenda")?.focus();
      restoreSearchFocusRef.current = false;
    }
  }, [query, categoria, marca]);

  const push = (search: URLSearchParams) => {
    const qs = search.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const sync = (next: NextFilters) => {
    const search = new URLSearchParams();
    if (tipo !== "todo") search.set("tipo", tipo);
    if (next.query) search.set("q", next.query);
    if (next.categoria) search.set("categoria", next.categoria);
    if (next.marca) search.set("marca", next.marca);
    if (next.orden !== "novedades") search.set("orden", next.orden);
    push(search);
  };

  const setSearch = (value: string) =>
    sync({ query: value.trim(), categoria, marca, orden });
  const setCategoria = (value: string) =>
    sync({ query, categoria: value, marca, orden });
  const setMarca = (value: string) =>
    sync({ query, categoria, marca: value, orden });
  const setOrden = (value: ProductSort) =>
    sync({ query, categoria, marca, orden: value });
  const setTipo = (value: Tipo) => {
    const search = new URLSearchParams(params);
    if (value === "todo") search.delete("tipo");
    else search.set("tipo", value);
    push(search);
  };
  const clear = () => {
    restoreSearchFocusRef.current = true;
    sync({ query: "", categoria: "", marca: "", orden });
  };

  const filters = useMemo(
    () => ({
      ...(query ? { query } : {}),
      ...(categoria ? { categorySlug: categoria } : {}),
      ...(marca ? { brandSlug: marca } : {}),
    }),
    [query, categoria, marca],
  );

  const activeCount = (categoria ? 1 : 0) + (marca ? 1 : 0);
  const hasFilters = query !== "" || categoria !== "" || marca !== "";

  return {
    query,
    tipo,
    categoria,
    marca,
    orden,
    filters,
    activeCount,
    hasFilters,
    setSearch,
    setCategoria,
    setMarca,
    setOrden,
    setTipo,
    clear,
    restoreSearchFocusRef,
  };
}
