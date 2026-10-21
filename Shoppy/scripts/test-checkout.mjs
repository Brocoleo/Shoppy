/** Run real test bodies, not an empty suite or a source-pattern-only check. */
import process from "node:process";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
const files = [
  "supabase/tests/checkout_rules.test.mjs",
  "supabase/tests/checkout_api.test.mjs",
  "supabase/tests/payment_provider.test.mjs",
  "scripts/session-connection.test.mjs",
  "scripts/server-read.test.mjs",
  "scripts/payment-bridge.test.mjs",
  "apps/web/src/lib/cartStore.test.ts",
  "apps/web/src/lib/catalogProduct.test.ts",
  "apps/web/src/lib/guestOrders.test.ts",
  "scripts/local-checkout/local-checkout.test.mjs",
];
for (const file of files) {
  if (!existsSync(file)) throw new Error(`Missing required test: ${file}`);
  const result = spawnSync(process.execPath, [file], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
