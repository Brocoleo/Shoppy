import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { test } from "node:test";
import ts from "typescript";
const require = createRequire(import.meta.url);
function load(path, mocks) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
  const exports = {};
  new Function("require", "exports", outputText)((name) => mocks[name] ?? require(name), exports);
  return exports;
}
function storage() {
  const values = new Map();
  return { values, getItem: async (key) => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); }, removeItem: async (key) => { values.delete(key); } };
}
async function store() {
  const disk = storage();
  const { useShopStore } = load("../src/stores/useShopStore.ts", { "@react-native-async-storage/async-storage": disk, "expo-crypto": { randomUUID } });
  await useShopStore.persist.rehydrate();
  useShopStore.getState().activate("guest");
  return useShopStore;
}
test("carrito invitado se transfiere una vez y las cuentas están aisladas", async () => {
  const s = await store();
  s.getState().addToCart("prenda", 2);
  s.getState().activate("user-a");
  const merge = s.getState().scopes["user-a"].merge;
  assert.equal(merge.lines[0].qty, 2);
  s.getState().acknowledge("user-a", 0, merge.lines, true);
  s.getState().activate("guest");
  assert.deepEqual(s.getState().cart, []);
  s.getState().activate("user-b");
  assert.deepEqual(s.getState().cart, []);
  s.getState().activate("user-a");
  assert.equal(s.getState().cart[0].qty, 2);
  assert.equal(s.getState().scopes["user-a"].merge, undefined);
});
test("respuesta tardía no elimina una edición más reciente ni cruza cuentas", async () => {
  const s = await store();
  s.getState().activate("user-a");
  s.getState().addToCart("prenda");
  const revision = s.getState().scopes["user-a"].revision;
  s.getState().setQty("prenda", 3);
  s.getState().acknowledge("user-a", revision, [{ productId: "prenda", qty: 1 }]);
  assert.equal(s.getState().cart[0].qty, 3);
  assert.equal(s.getState().scopes["user-a"].dirty, true);
  s.getState().activate("user-b");
  s.getState().acknowledge("user-a", revision, [{ productId: "prenda", qty: 1 }]);
  assert.deepEqual(s.getState().cart, []);
});
test("fusión pendiente conserva su clave al cerrar sesión", async () => {
  const s = await store();
  s.getState().addToCart("uno");
  s.getState().activate("user-a");
  const key = s.getState().scopes["user-a"].merge.id;
  s.getState().activate("guest");
  s.getState().addToCart("dos");
  s.getState().activate("user-a");
  assert.equal(s.getState().scopes["user-a"].merge.id, key);
  assert.equal(s.getState().scopes.guest.cart[0].productId, "dos");
});
test("pedido pendiente guarda secretos fuera de AsyncStorage y separado por cuenta", async () => {
  const disk = storage(); const secure = storage();
  const pending = load("../src/lib/pendingCheckout.ts", {
    "@react-native-async-storage/async-storage": disk, "expo-crypto": { randomUUID }, "react-native": { Platform: { OS: "ios" } },
    "expo-secure-store": { getItemAsync: secure.getItem, setItemAsync: secure.setItem, deleteItemAsync: secure.removeItem },
  });
  const attempt = await pending.newPendingCheckout("a", { items: [] });
  await pending.savePendingCheckout("a", { ...attempt, created: { order_id: "o", guest_token: "private-token", payment: {} } });
  assert.equal(JSON.stringify([...disk.values.values()]).includes("private-token"), false);
  assert.equal(JSON.stringify([...disk.values.values()]).includes(attempt.secret), false);
  assert.equal((await pending.loadPendingCheckout("a")).created.guest_token, "private-token");
  assert.equal(await pending.loadPendingCheckout("b"), null);
  await pending.clearPendingCheckout("a");
  assert.equal(await pending.loadPendingCheckout("a"), null);
});

test("ediciones durante fusión conservan productos remotos y cambios locales", async () => {
  const s = await store();
  s.getState().addToCart("B");
  s.getState().activate("a");
  const sent = s.getState().cart;
  s.getState().addToCart("C");
  s.getState().acknowledge("a", 0, [{ productId: "A", qty: 1 }, { productId: "B", qty: 1 }], true, sent);
  assert.deepEqual(s.getState().cart.map((l) => l.productId).sort(), ["A", "B", "C"]);
  assert.equal(s.getState().scopes.a.dirty, true);
});
test("confirmación repetida descuenta solo la compra y conserva nuevas prendas", async () => {
  const s = await store();
  s.getState().addToCart("A", 3);
  s.getState().addToCart("B");
  s.getState().consumePaidOrder("pedido", [{ productId: "A", qty: 2 }]);
  s.getState().consumePaidOrder("pedido", [{ productId: "A", qty: 2 }]);
  assert.deepEqual(s.getState().cart, [{ productId: "A", qty: 1 }, { productId: "B", qty: 1 }]);
});
