/**
 * Medidas de la prenda en centímetros. En vintage la talla de etiqueta no es
 * suficiente: la ficha necesita cm reales tomados en plano.
 *
 * Se guardan en `products.metadata.measurements_cm` (jsonb) para no migrar el
 * esquema; `metadata.material` guarda la composición declarada.
 */
export const MEASUREMENT_KEYS = [
  "busto",
  "cintura",
  "cadera",
  "largo",
  "hombro",
  "manga",
] as const;

export type MeasurementKey = (typeof MEASUREMENT_KEYS)[number];

export const MEASUREMENT_LABELS: Record<MeasurementKey, string> = {
  busto: "Busto",
  cintura: "Cintura",
  cadera: "Cadera",
  largo: "Largo",
  hombro: "Hombro",
  manga: "Manga",
};

export type MeasurementsCm = Partial<Record<MeasurementKey, number>>;

function toCm(raw: unknown): number | null {
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && raw.trim()
        ? Number(raw.replace(",", "."))
        : NaN;
  if (!Number.isFinite(n) || n <= 0 || n > 500) return null;
  return Math.round(n * 10) / 10;
}

/** Lee `metadata.measurements_cm` sin confiar en su forma. */
export function parseMeasurements(value: unknown): MeasurementsCm {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const out: MeasurementsCm = {};
  for (const key of MEASUREMENT_KEYS) {
    const cm = toCm(raw[key]);
    if (cm != null) out[key] = cm;
  }
  return out;
}

/** Convierte el objeto de medidas a un mapa de strings para inputs controlados. */
export function measurementsToInput(
  value: MeasurementsCm,
): Record<MeasurementKey, string> {
  return Object.fromEntries(
    MEASUREMENT_KEYS.map((key) => [key, value[key] != null ? String(value[key]) : ""]),
  ) as Record<MeasurementKey, string>;
}

/** Convierte los inputs a objeto numérico, ignorando vacíos e inválidos. */
export function inputToMeasurements(
  value: Partial<Record<MeasurementKey, string>> | undefined,
): MeasurementsCm {
  const out: MeasurementsCm = {};
  for (const key of MEASUREMENT_KEYS) {
    const cm = toCm(value?.[key]);
    if (cm != null) out[key] = cm;
  }
  return out;
}

export function hasMeasurements(value: MeasurementsCm): boolean {
  return MEASUREMENT_KEYS.some((key) => value[key] != null);
}

/** Lee `metadata.material` (composición). */
export function parseMaterial(value: unknown): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 160)
    : null;
}

export function formatMeasurements(value: MeasurementsCm): string {
  return MEASUREMENT_KEYS.filter((key) => value[key] != null)
    .map((key) => `${MEASUREMENT_LABELS[key]} ${value[key]} cm`)
    .join(" · ");
}

/**
 * Fusiona composición y medidas en `metadata` sin tocar otras claves
 * (`demo`, `example`, futuras). Borra las nuestras si quedan vacías.
 */
export function mergeProductMetadata(
  existing: Record<string, unknown> | null | undefined,
  material: string,
  measurementInputs:
    | Partial<Record<MeasurementKey, string>>
    | undefined,
): Record<string, unknown> {
  const metadata: Record<string, unknown> = { ...(existing ?? {}) };
  const clean = material.trim();
  if (clean) metadata.material = clean;
  else delete metadata.material;
  const measurements = inputToMeasurements(measurementInputs);
  if (Object.keys(measurements).length > 0)
    metadata.measurements_cm = measurements;
  else delete metadata.measurements_cm;
  return metadata;
}
