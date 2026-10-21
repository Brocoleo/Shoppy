"use client";

/**
 * Pedidos de invitado guardados en este dispositivo.
 *
 * El invitado no tiene cuenta. Antes, al cerrar la app perdía el acceso a su
 * pedido: el token se borraba con el intento de checkout y el identificador
 * interno nunca se le mostraba, así que no podía volver al tracking ni
 * ejercer su derecho de retracto.
 *
 * Con esta lista el invitado vuelve a su pedido en un clic. Solo se guarda lo
 * mínimo (id, número, token) y vive en el navegador: no es un canal de acceso
 * para terceros (el token es la credencial y además caduca a 180 días).
 */
export interface GuestOrder {
  order_id: string;
  order_number: string;
  guest_token: string;
  created_at: string;
}

const KEY = "shopy-guest-orders";
const LIMIT = 20;

export function loadGuestOrders(): GuestOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
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

export function rememberGuestOrder(order: GuestOrder): void {
  if (typeof window === "undefined" || !order?.order_id || !order?.guest_token) return;
  try {
    const list = loadGuestOrders().filter((o) => o.order_id !== order.order_id);
    list.unshift(order);
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, LIMIT)));
  } catch {
    // Almacenamiento bloqueado o lleno: no es crítico para la compra.
  }
}

export function forgetGuestOrder(orderId: string): void {
  if (typeof window === "undefined") return;
  try {
    const list = loadGuestOrders().filter((o) => o.order_id !== orderId);
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Ignorado a propósito.
  }
}
