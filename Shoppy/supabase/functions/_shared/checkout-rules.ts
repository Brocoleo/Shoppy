import { REGIONES } from "./chile.ts";

/** Shared, runtime-independent rules: never import server credentials here. */
export const addressFields = {
  fullName: { min: 2, max: 120 }, email: { min: 1, max: 160 },
  phone: { min: 6, max: 30 }, street: { min: 3, max: 200 },
  comuna: { min: 2, max: 100 }, region: { min: 2, max: 100 },
  zipCode: { min: 0, max: 20 }, notes: { min: 0, max: 500 },
} as const;

export function isKnownRegion(region: string): boolean {
  return REGIONES.some((entry) => entry.name === region);
}

export function matchesShippingRegion(rateRegion: string, region: string): boolean {
  if (!isKnownRegion(region)) return false;
  const normalize = (value: string) => value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return [normalize(region), "otras"].includes(normalize(rateRegion));
}

/** Approximation only: recognizes a street name followed by a house number. */
export function hasStreetAndNumber(street: string): boolean {
  const main = street.split(/[,;]/)[0]?.trim() ?? "";
  return /\p{L}/u.test(main) && /\p{L}.*\s+(?:n[º°o.]?\s*)?\d+[\p{L}]?(?:\s*[-/]\s*\d+)?$/iu.test(main);
}

export function addressIssues(address: Record<string, unknown>): { path: string; message: string }[] {
  const issues: { path: string; message: string }[] = [];
  for (const [path, bounds] of Object.entries(addressFields)) {
    const value = address[path];
    if (bounds.min === 0 && value == null) continue;
    if (typeof value !== "string" || value.trim().length < bounds.min || value.length > bounds.max) {
      issues.push({ path, message: "Revisa este campo y su longitud." });
    }
  }
  if (typeof address.street === "string" && !hasStreetAndNumber(address.street)) {
    issues.push({ path: "street", message: "Escribe calle y número, por ejemplo: 5 de Abril 1234." });
  }
  const region = REGIONES.find((entry) => entry.name === address.region);
  if (!region) issues.push({ path: "region", message: "Selecciona tu región." });
  else if (typeof address.comuna !== "string" || !region.comunas.includes(address.comuna)) {
    issues.push({ path: "comuna", message: "Selecciona una comuna válida para tu región." });
  }
  return issues;
}

const demoIds = new Set([
  "e6db9acd-19b1-5ae4-88b1-15f6f625a9de",
  "de3d27df-84d2-5da7-98df-efa448ebb853",
  "5dd43f7d-bc7b-5008-8ea3-93a4b644afc1",
  "32f39058-beb4-509e-be9d-3237213ba0f9",
  "83cc5365-1dd8-582d-831e-f4df1210ae78",
  "67da0315-47d1-5ac7-8924-6ba8b9d2b53b",
  "ffa969d1-d247-5da4-84fb-ce2b062183c5",
  "3f8e6546-46b7-5703-b948-db13fad1f4b6"
]);

export function isCommercialProduct(product: {
  id?: string; metadata?: unknown; published_at?: unknown; availability?: unknown;
}): boolean {
  const metadata = product.metadata && typeof product.metadata === "object"
    ? product.metadata as Record<string, unknown> : {};
  const legacy = /^d0000000-0000-4000-8000-0000000000(?:0[1-9]|1[0-9]|20)$/i.test(product.id ?? "");
  return !legacy && !demoIds.has(product.id ?? "") && metadata.demo !== true && metadata.example !== true
    && Boolean(product.published_at) && product.availability === "AVAILABLE";
}
