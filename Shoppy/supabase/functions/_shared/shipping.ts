/**
 * ShippingProvider desacoplado (Fase 9).
 * - manual: default. Cotiza contra `shipping_rates` (administrables) y el
 *   tracking refleja lo guardado en `shipments` (carrier + tracking
 *   ingresados por el admin). Sin APIs externas.
 * - chilexpress / starken: esqueletos listos para Fase 9+ con credenciales.
 *   Sin URLs inventadas: cada uno declara su portal oficial en el error.
 *   El checkout sigue usando tarifas DB hasta activar un carrier en vivo.
 */

export interface ShippingQuote {
  carrier: string;
  price_clp: number;
  eta_days_min: number | null;
  eta_days_max: number | null;
}

export interface TrackingInfo {
  carrier: string;
  tracking_number: string | null;
  tracking_url: string | null;
  status: string;
}

export interface ShippingProvider {
  readonly name: "manual" | "chilexpress" | "starken";
  quote(region: string, comuna?: string | null): Promise<ShippingQuote[]>;
  track(trackingNumber: string): Promise<TrackingInfo>;
}

export interface RatesRow {
  carrier: string;
  price_clp: number;
  eta_days_min: number | null;
  eta_days_max: number | null;
}

export class ManualShippingProvider implements ShippingProvider {
  readonly name = "manual" as const;
  private rates: RatesRow[];
  private tracking: Map<string, TrackingInfo>;

  /**
   * rates: tarifas ya filtradas por región (el llamador consulta
   * shipping_rates). El orden de menor a mayor precio lo define aquí.
   */
  constructor(rates: RatesRow[] = [], tracking: Map<string, TrackingInfo> = new Map()) {
    this.rates = rates;
    this.tracking = tracking;
  }

  async quote(): Promise<ShippingQuote[]> {
    return [...this.rates]
      .sort((a, b) => a.price_clp - b.price_clp)
      .map((r) => ({
        carrier: r.carrier,
        price_clp: r.price_clp,
        eta_days_min: r.eta_days_min,
        eta_days_max: r.eta_days_max,
      }));
  }

  async track(trackingNumber: string): Promise<TrackingInfo> {
    const info = this.tracking.get(trackingNumber);
    if (!info) throw new Error("tracking no encontrado en registros internos");
    return info;
  }
}

export class ChilexpressProvider implements ShippingProvider {
  readonly name = "chilexpress" as const;
  constructor() {
    if (!Deno.env.get("CHILEXPRESS_API_KEY")) {
      throw new Error(
        "chilexpress sin credenciales: configura CHILEXPRESS_API_KEY (portal empresas Chilexpress) para activar",
      );
    }
  }
  async quote(): Promise<ShippingQuote[]> {
    throw new Error("chilexpress en vivo pendiente de homologación (ver docs)");
  }
  async track(): Promise<TrackingInfo> {
    throw new Error("chilexpress en vivo pendiente de homologación (ver docs)");
  }
}

export class StarkenProvider implements ShippingProvider {
  readonly name = "starken" as const;
  constructor() {
    if (!Deno.env.get("STARKEN_API_KEY")) {
      throw new Error(
        "starken sin credenciales: configura STARKEN_API_KEY (portal empresas Starken) para activar",
      );
    }
  }
  async quote(): Promise<ShippingQuote[]> {
    throw new Error("starken en vivo pendiente de homologación (ver docs)");
  }
  async track(): Promise<TrackingInfo> {
    throw new Error("starken en vivo pendiente de homologación (ver docs)");
  }
}

export function getShippingProvider(): ShippingProvider {
  const name = (Deno.env.get("SHIPPING_PROVIDER") ?? "manual").toLowerCase();
  if (name === "chilexpress") return new ChilexpressProvider();
  if (name === "starken") return new StarkenProvider();
  if (name !== "manual") throw new Error(`shipping provider ${name} desconocido (manual|chilexpress|starken)`);
  return new ManualShippingProvider();
}
