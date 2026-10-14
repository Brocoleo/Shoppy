"use client";

import { addressSchema, type AddressInput } from "@shopy/validation";

export type { AddressInput };

export interface PendingCheckout {
  key: string;
  secret: string;
  input?: {
    items: { product_id: string; qty: number }[];
    address: AddressInput;
    shipping_rate_id: string;
    discount_code?: string;
    save_address?: boolean;
    provider?: "mock" | "mercadopago" | "transbank";
  };
  created?: {
    order_id: string;
    order_number: string;
    guest_token: string | null;
    total_clp: number;
    payment: { provider: string; provider_payment_id: string; status: string; checkout_url: string | null };
  };
}

const name = (owner: string) => `shopy-checkout-${owner}`;

export async function loadPendingCheckout(owner: string): Promise<PendingCheckout | null> {
  try {
    const raw = localStorage.getItem(name(owner));
    if (!raw) return null;
    return JSON.parse(raw) as PendingCheckout;
  } catch {
    return null;
  }
}

export async function savePendingCheckout(owner: string, pending: PendingCheckout) {
  try {
    localStorage.setItem(name(owner), JSON.stringify(pending));
  } catch {
    // Sin almacenamiento: el intento vive solo en memoria de la sesión.
  }
}

export async function newPendingCheckout(owner: string, input: PendingCheckout["input"]) {
  const pending: PendingCheckout = { key: crypto.randomUUID(), secret: crypto.randomUUID(), input };
  await savePendingCheckout(owner, pending);
  return pending;
}

export async function clearPendingCheckout(owner: string) {
  try {
    localStorage.removeItem(name(owner));
  } catch {
    // Nada que limpiar.
  }
}

/** Valida la dirección del formulario contra el esquema compartido. */
export function parseAddress(values: Record<string, string>): { ok: true; address: AddressInput } | { ok: false; errors: Record<string, string> } {
  const parsed = addressSchema.safeParse(values);
  if (parsed.success) return { ok: true, address: parsed.data };
  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!errors[key]) errors[key] = issue.message;
  }
  return { ok: false, errors };
}
