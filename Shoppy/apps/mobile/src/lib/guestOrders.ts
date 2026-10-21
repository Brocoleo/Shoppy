import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Pedidos de invitado guardados en este dispositivo (ver la versión web).
 *
 * El invitado no tiene cuenta: sin esta lista, al cerrar la app perdía el
 * acceso a su pedido (el token se borraba con el intento de checkout y el
 * identificador interno nunca se le mostraba).
 */
export interface GuestOrder {
  order_id: string;
  order_number: string;
  guest_token: string;
  created_at: string;
}

const KEY = "shopy-guest-orders";
const LIMIT = 20;

export async function loadGuestOrders(): Promise<GuestOrder[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (o): o is GuestOrder =>
        !!o && typeof o.order_id === "string" && typeof o.guest_token === "string",
    );
  } catch {
    return [];
  }
}

export async function rememberGuestOrder(order: GuestOrder): Promise<void> {
  if (!order?.order_id || !order?.guest_token) return;
  try {
    const list = (await loadGuestOrders()).filter((o) => o.order_id !== order.order_id);
    list.unshift(order);
    await AsyncStorage.setItem(KEY, JSON.stringify(list.slice(0, LIMIT)));
  } catch {
    // Almacenamiento no disponible: no es crítico para la compra.
  }
}

export async function forgetGuestOrder(orderId: string): Promise<void> {
  try {
    const list = (await loadGuestOrders()).filter((o) => o.order_id !== orderId);
    await AsyncStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Ignorado a propósito.
  }
}
