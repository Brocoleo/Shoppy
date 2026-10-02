import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { __resetRateLimit, rateLimit } from "./ratelimit.ts";

function req(ip: string): Request {
  return new Request("https://shopy.local/functions/v1/checkout", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  });
}

Deno.test("ratelimit permite hasta max y luego responde 429", () => {
  __resetRateLimit();
  for (let i = 0; i < 3; i++) {
    assertEquals(rateLimit(req("1.1.1.1"), { max: 3, windowMs: 60_000 }), null);
  }
  const limited = rateLimit(req("1.1.1.1"), { max: 3, windowMs: 60_000 });
  assert(limited instanceof Response);
  assertEquals(limited.status, 429);
  assert(limited.headers.has("Retry-After"));
});

Deno.test("ratelimit aísla por IP y por bucket", () => {
  __resetRateLimit();
  assertEquals(rateLimit(req("2.2.2.2"), { max: 1, bucket: "quote" }), null);
  assert(rateLimit(req("2.2.2.2"), { max: 1, bucket: "quote" }) instanceof Response);
  // Otra IP pasa; otro bucket pasa.
  assertEquals(rateLimit(req("3.3.3.3"), { max: 1, bucket: "quote" }), null);
  assertEquals(rateLimit(req("2.2.2.2"), { max: 1, bucket: "webhook" }), null);
});
