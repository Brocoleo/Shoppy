/** Minutos que dura una reserva temporal de producto único durante checkout. */
export const RESERVATION_MINUTES = 15;

/** Moneda e idioma iniciales del proyecto. */
export const DEFAULT_CURRENCY = "CLP" as const;
export const DEFAULT_LOCALE = "es-CL" as const;

/** Categorías iniciales configurables (el catálogo real vivirá en DB en Fase 2). */
export const INITIAL_CATEGORY_SLUGS = [
  "mujer",
  "hombre",
  "accesorios",
  "ofertas",
  "novedades",
] as const;
