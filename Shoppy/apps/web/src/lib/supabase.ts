"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** true cuando hay backend configurado. Sin .env las páginas muestran estado de error. */
export const isSupabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!url || !anonKey) {
    throw new Error("Supabase no configurado: completa apps/web/.env.local");
  }
  if (!client) {
    client = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}

/** URL pública de un path del bucket product-images. `?v=` invalida caché tras regenerar. */
const STORAGE_IMG_VERSION = "v=2";

export function publicImageUrl(storagePath: string): string {
  const base = (url ?? "").replace(/\/$/, "");
  return `${base}/storage/v1/object/public/product-images/${storagePath}?${STORAGE_IMG_VERSION}`;
}
