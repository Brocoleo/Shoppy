import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

function fixture(env) {
  const source = readFileSync(new URL("../apps/web/src/lib/paymentBridge.ts", import.meta.url), "utf8");
  const exports = {};
  new Function("require", "exports", "process", ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(() => ({ createClient: () => { throw new Error("No database in bridge render test"); } }), exports, { env });
  return exports;
}
test("retorno sandbox vuelve al origen local donde vive el intento", async () => {
  const { bridgeReturnHtml } = fixture({ PAYMENT_MODE: "sandbox", PAYMENT_SANDBOX_RETURN_ORIGIN: "http://localhost:3015" });
  const response = bridgeReturnHtml("local-test-state", "https://tunnel.example.test", "Desktop");
  assert.match(await response.text(), /http:\/\/localhost:3015\/checkout-return\?state=local-test-state/);
  assert.match(await bridgeReturnHtml("state", "https://tunnel.example.test", "iPhone").text(), /window.location.href="http:\/\/localhost:3015\/checkout-return/);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("Referrer-Policy"), "no-referrer");
});
test("sin configuración se conserva el retorno y la app móvil existentes", async () => {
  const { bridgeReturnHtml } = fixture({});
  assert.match(await bridgeReturnHtml("state", "https://store.example.test", "Desktop").text(), /https:\/\/store.example.test\/checkout-return/);
  assert.match(await bridgeReturnHtml("state", "https://store.example.test", "iPhone").text(), /window.location.href="shopy:\/\/checkout-return/);
});
test("retorno alternativo exige sandbox y un origen HTTP loopback o HTTPS", () => {
  for (const env of [
    { PAYMENT_MODE: "live", PAYMENT_SANDBOX_RETURN_ORIGIN: "http://localhost:3015" },
    { PAYMENT_MODE: "sandbox", PAYMENT_SANDBOX_RETURN_ORIGIN: "http://outside.example.test" },
    { PAYMENT_MODE: "sandbox", PAYMENT_SANDBOX_RETURN_ORIGIN: "https://user:password@example.test" },
    { PAYMENT_MODE: "sandbox", PAYMENT_SANDBOX_RETURN_ORIGIN: "https://example.test/path?token=anything" },
  ]) assert.throws(() => fixture(env).bridgeReturnHtml("state", "https://store.example.test", "Desktop"));
});
