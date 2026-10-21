import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { randomUUID } from "expo-crypto";
import { Platform } from "react-native";
import type { CreateResult, createOrder } from "./checkout";

export type OrderInput = Parameters<typeof createOrder>[0];
export interface PendingCheckout {
  key: string;
  secret: string;
  input?: OrderInput;
  created?: CreateResult;
}
const name = (owner: string) => `shopy-checkout-${owner}`;
const browserSecrets = new Map<string, string>();
async function secretRead(key: string) {
  return Platform.OS === "web" ? browserSecrets.get(key) ?? null : SecureStore.getItemAsync(key);
}
async function secretWrite(key: string, value: string) {
  if (Platform.OS === "web") browserSecrets.set(key, value);
  else await SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
}
export async function loadPendingCheckout(owner: string): Promise<PendingCheckout | null> {
  const stored = await secretRead(name(owner));
  if (!stored) return null;
  // El almacenamiento puede quedar corrupto (valor a medio escribir, borrado
  // parcial del sistema). Antes, un JSON inválido hacía fallar la promesa y
  // dejaba el checkout bloqueado para siempre; ahora se descarta el intento
  // y el cliente puede empezar de cero.
  let secret: { key: string; secret: string; guestToken?: string | null };
  try {
    secret = JSON.parse(stored) as typeof secret;
  } catch {
    await clearPendingCheckout(owner);
    return null;
  }
  if (!secret?.key || !secret?.secret) {
    await clearPendingCheckout(owner);
    return null;
  }
  const raw = await AsyncStorage.getItem(`${name(owner)}-details`);
  let details: PendingCheckout | null = null;
  if (raw) {
    try {
      details = JSON.parse(raw) as PendingCheckout;
    } catch {
      details = null;
    }
  }
  // Escritura parcial: el secreto está pero los detalles no (o no coinciden).
  // Devolver un intento sin `input` dejaba al cliente sin poder comprar ni
  // cerrar el intento; se descarta para que pueda empezar de nuevo.
  if (!details || details.key !== secret.key) {
    await clearPendingCheckout(owner);
    return null;
  }
  return { ...details, secret: secret.secret, ...(details.created ? { created: { ...details.created, guest_token: secret.guestToken ?? null } } : {}) };
}
export async function savePendingCheckout(owner: string, pending: PendingCheckout) {
  await secretWrite(name(owner), JSON.stringify({ key: pending.key, secret: pending.secret, guestToken: pending.created?.guest_token }));
  const { secret: _secret, ...details } = pending;
  await AsyncStorage.setItem(`${name(owner)}-details`, JSON.stringify({ ...details, created: details.created ? { ...details.created, guest_token: null } : undefined }));
}
export async function newPendingCheckout(owner: string, input: OrderInput) {
  const pending = { key: randomUUID(), secret: randomUUID(), input };
  await savePendingCheckout(owner, pending);
  return pending;
}
export async function clearPendingCheckout(owner: string) {
  if (Platform.OS === "web") browserSecrets.delete(name(owner));
  else await SecureStore.deleteItemAsync(name(owner));
  await AsyncStorage.removeItem(`${name(owner)}-details`);
}
