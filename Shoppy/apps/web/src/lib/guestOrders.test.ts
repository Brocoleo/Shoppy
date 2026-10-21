/**
 * Lista local de pedidos de invitado (A-04): el invitado no tiene cuenta y
 * sin esta lista perdía el acceso a su pedido al cerrar la app.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

function fakeWindow() {
  const store = new Map<string, string>();
  return {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
    raw: store,
  };
}

async function load() {
  // El módulo lee window.localStorage en cada llamada: se puede probar sin DOM.
  const mod = await import("./guestOrders.ts");
  return mod;
}

test("recuerda el pedido y lo devuelve en la lista", async () => {
  const win = fakeWindow();
  (globalThis as unknown as { window: unknown }).window = win;
  const { rememberGuestOrder, loadGuestOrders } = await load();
  rememberGuestOrder({
    order_id: "11111111-1111-4111-8111-111111111111",
    order_number: "SHO-ABC12345",
    guest_token: "tok-1",
    created_at: "2026-10-21T00:00:00.000Z",
  });
  const list = loadGuestOrders();
  assert.equal(list.length, 1);
  assert.equal(list[0].order_number, "SHO-ABC12345");
  assert.equal(list[0].guest_token, "tok-1");
});

test("no duplica el mismo pedido y ordena el más reciente primero", async () => {
  const win = fakeWindow();
  (globalThis as unknown as { window: unknown }).window = win;
  const { rememberGuestOrder, loadGuestOrders } = await load();
  const order = {
    order_id: "11111111-1111-4111-8111-111111111111",
    order_number: "SHO-ABC12345",
    guest_token: "tok-1",
    created_at: "2026-10-21T00:00:00.000Z",
  };
  rememberGuestOrder(order);
  rememberGuestOrder({ ...order, guest_token: "tok-1b" });
  const list = loadGuestOrders();
  assert.equal(list.length, 1);
  assert.equal(list[0].guest_token, "tok-1b");
});

test("un almacenamiento corrupto no rompe la lista", async () => {
  const win = fakeWindow();
  win.raw.set("shopy-guest-orders", "{no es json");
  (globalThis as unknown as { window: unknown }).window = win;
  const { loadGuestOrders, rememberGuestOrder } = await load();
  assert.deepEqual(loadGuestOrders(), []);
  rememberGuestOrder({
    order_id: "22222222-2222-4222-8222-222222222222",
    order_number: "SHO-DEF67890",
    guest_token: "tok-2",
    created_at: "2026-10-21T00:00:00.000Z",
  });
  assert.equal(loadGuestOrders().length, 1);
});

test("olvida un pedido concreto", async () => {
  const win = fakeWindow();
  (globalThis as unknown as { window: unknown }).window = win;
  const { rememberGuestOrder, forgetGuestOrder, loadGuestOrders } = await load();
  rememberGuestOrder({
    order_id: "11111111-1111-4111-8111-111111111111",
    order_number: "SHO-ABC12345",
    guest_token: "tok-1",
    created_at: "2026-10-21T00:00:00.000Z",
  });
  forgetGuestOrder("11111111-1111-4111-8111-111111111111");
  assert.equal(loadGuestOrders().length, 0);
});
