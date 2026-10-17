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
  const secret = JSON.parse(stored) as { key: string; secret: string; guestToken?: string | null };
  const raw = await AsyncStorage.getItem(`${name(owner)}-details`);
  const details = raw ? JSON.parse(raw) as PendingCheckout : null;
  if (details?.key !== secret.key) return { key: secret.key, secret: secret.secret };
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
