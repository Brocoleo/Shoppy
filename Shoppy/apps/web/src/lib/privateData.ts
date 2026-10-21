"use client";

import type { QueryClient } from "@tanstack/react-query";

/**
 * Claves de consulta que contienen datos privados de una cuenta (pedidos,
 * ficha de pedido, seguimiento de invitado, dirección guardada, cotización y
 * favoritos).
 *
 * Toda clave privada incluye el identificador de la cuenta propietaria (o
 * "guest"), de modo que la caché de una cuenta nunca se puede servir a otra:
 * es la primera barrera de aislamiento. La segunda es la purga al cambiar de
 * cuenta, que borra los datos privados de la cuenta anterior.
 */
export const PRIVATE_QUERY_KEYS = [
  "my-orders",
  "order-detail",
  "guest-order",
  "my-order",
  "my-address",
  "quote",
  "favorites",
] as const;

function isPrivateKey(key: readonly unknown[]): boolean {
  return PRIVATE_QUERY_KEYS.includes(key[0] as (typeof PRIVATE_QUERY_KEYS)[number]);
}

/**
 * Cancela las consultas privadas en vuelo y borra los datos de la cuenta
 * indicada de la caché.
 *
 * - `cancelQueries` evita que una respuesta tardía de la cuenta anterior
 *   repueble la caché después del cambio de cuenta.
 * - `removeQueries` elimina lo ya cacheado, para que no quede en memoria en un
 *   dispositivo compartido.
 *
 * Solo afecta a las consultas cuya clave contiene ese usuario: las de la
 * cuenta actual quedan intactas y no se cancelan consultas en vuelo que la
 * página activa está usando.
 */
export function purgeUserQueries(client: QueryClient, userId: string | null): void {
  if (!userId) return;
  const belongsToUser = (key: readonly unknown[]) => isPrivateKey(key) && key.includes(userId);
  void client.cancelQueries({ predicate: (query) => belongsToUser(query.queryKey) });
  client.removeQueries({ predicate: (query) => belongsToUser(query.queryKey) });
}
