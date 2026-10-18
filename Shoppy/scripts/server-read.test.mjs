import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

test("SSR public transport forces no-store without cookies or persistent auth", async () => {
  const source = readFileSync(new URL("../apps/web/src/lib/editorial.server.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  const captured = [];
  let options;
  new Function("require", "exports", "process", "fetch", compiled)((name) => {
    if (name === "server-only") return {};
    if (name === "react") return { cache: (fn) => fn };
    if (name === "@supabase/supabase-js") return { createClient: (_url, _key, config) => { options = config; return config; } };
    if (name === "@shopy/shared/editorial" || name === "./catalogProduct" || name === "./productImageUrl") return {};
    throw new Error(`Unexpected import ${name}`);
  }, exports, { env: { NEXT_PUBLIC_SUPABASE_URL: "https://example.test", NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-test-key" } }, async (url, init) => {
    captured.push({ url, init }); return Response.json([]);
  });
  exports.publicServerDb();
  assert.deepEqual(options.auth, { persistSession: false, autoRefreshToken: false });
  await options.global.fetch("https://example.test/products", { headers: { apikey: "public-test-key" } });
  await options.global.fetch("https://example.test/products", {});
  assert.equal(captured.length, 2);
  for (const call of captured) {
    assert.equal(call.init.cache, "no-store");
    assert.equal(call.init.next, undefined);
    assert.ok(call.init.signal instanceof AbortSignal);
  }
});
