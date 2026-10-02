/**
 * ratelimit — limitador best-effort en memoria (ventana deslizante) para
 * Edge Functions. Deno aísla memoria por instancia, así que es una defensa
 * en profundidad junto a los límites de la plataforma, no un conteo global.
 */

export type RateLimitOpts = {
  /** Ventana en ms (defecto 60 000). */
  windowMs?: number;
  /** Máximo de peticiones por ventana y clave (defecto 60). */
  max?: number;
  /** Etiqueta para aislar cubetas (ej. "quote", "webhook"). */
  bucket?: string;
};

const hits = new Map<string, number[]>();

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}

/** Retorna `null` si pasa, o un `Response` 429 si excede. */
export function rateLimit(req: Request, opts: RateLimitOpts = {}): Response | null {
  const windowMs = opts.windowMs ?? 60_000;
  const max = opts.max ?? 60;
  const key = `${opts.bucket ?? "default"}:${clientIp(req)}`;
  const now = Date.now();
  const prev = hits.get(key) ?? [];
  const fresh = prev.filter((t) => now - t < windowMs);
  if (fresh.length >= max) {
    const retryAfter = Math.max(1, Math.ceil((fresh[0]! + windowMs - now) / 1000));
    return Response.json(
      { error: { code: "RATE_LIMITED", message: "Demasiadas peticiones. Intenta en unos segundos." } },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }
  fresh.push(now);
  hits.set(key, fresh);
  return null;
}

/** Solo para tests: limpia el estado en memoria. */
export function __resetRateLimit(): void {
  hits.clear();
}
