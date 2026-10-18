import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { z } from "zod";
import * as rules from "../functions/_shared/checkout-rules.ts";
import * as chile from "../functions/_shared/chile.ts";

const source = readFileSync(new URL("../../packages/validation/src/index.ts", import.meta.url), "utf8");
const exports = {};
new Function("require", "exports", ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)((name) => {
  if (name === "zod") return { z };
  if (name.endsWith("checkout-rules.ts")) return rules;
  if (name === "./chile") return chile;
  throw new Error(`Unexpected test import: ${name}`);
}, exports);

const address = { fullName: "Prueba Local", email: "test@example.test", phone: "+56911111111", street: "5 de Abril 1234", region: "Metropolitana", comuna: "Santiago" };
test("campos ausentes muestran instrucciones en español", () => {
  const result = exports.addressSchema.safeParse({});
  assert.equal(result.success, false);
  assert.deepEqual(result.error.issues.map(i => i.message), ["Ingresa tu nombre completo", "Ingresa un email válido", "Ingresa un teléfono válido", "Ingresa tu calle y número", "Selecciona tu comuna", "Selecciona tu región"]);
});
test("formato de calle distingue nombre numérico y domicilio, sin geocodificar", () => {
  for (const value of ["123", "5 de Abril", "21 de Mayo", "Calle", " ", "123, dpto 4"]) {
    assert.equal(rules.hasStreetAndNumber(value), false, value);
    assert.equal(exports.addressSchema.safeParse({ ...address, street: value }).success, false, value);
  }
  for (const value of ["5 de Abril 1234", "Av. Providencia 1234, dpto 56", "Calle 12B", "Calle Nº 123"]) {
    assert.equal(exports.addressSchema.safeParse({ ...address, street: value }).success, true, value);
  }
});
test("web comparte límites y correspondencia de región/comuna con el servidor", () => {
  assert.equal(exports.addressSchema.safeParse(address).success, true);
  for (const patch of [{ fullName: "  " }, { notes: "x".repeat(501) }, { region: "OTRAS" }, { comuna: "Temuco" }]) {
    const candidate = { ...address, ...patch };
    assert.ok(rules.addressIssues(candidate).length > 0);
    assert.equal(exports.addressSchema.safeParse(candidate).success, false);
  }
});
test("tarifas explícitas y OTRAS, sin equivalencias geográficas", () => {
  assert.equal(rules.matchesShippingRegion("metropolitana ", "Metropolitana"), true);
  assert.equal(rules.matchesShippingRegion("Biobío", "Ñuble"), false);
  assert.equal(rules.matchesShippingRegion("Los Lagos", "Los Ríos"), false);
  for (const region of chile.REGIONES) assert.equal(rules.matchesShippingRegion("OTRAS", region.name), true);
  assert.equal(rules.matchesShippingRegion("OTRAS", "inventada"), false);
});
test("IDs de seed y demos siguen no comerciales aunque se retire metadata", () => {
  const manifest = JSON.parse(readFileSync(new URL("../seed/editorial-demo/manifest.json", import.meta.url), "utf8"));
  const ids = [...Array.from({ length: 20 }, (_, i) => `d0000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`), ...manifest.products.map((p) => p.id)];
  for (const id of ids) assert.equal(rules.isCommercialProduct({ id, published_at: "2026-01-01", availability: "AVAILABLE" }), false, id);
  assert.equal(rules.isCommercialProduct({ id: "ordinary", published_at: "2026-01-01", availability: "AVAILABLE" }), true);
});
