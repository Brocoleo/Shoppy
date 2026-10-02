/**
 * Cliente Supabase para mobile (Fase 4).
 * Auth persistente en AsyncStorage. Sin .env -> modo mock (Fase 3).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** true cuando hay backend configurado (local o remoto). */
export const isSupabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!url || !anonKey) {
    throw new Error("Supabase no configurado: completa apps/mobile/.env");
  }
  if (!client) {
    client = createClient(url, anonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

/** URL pública de un path del bucket product-images. */
export function publicImageUrl(storagePath: string): string {
  const base = (url ?? "").replace(/\/$/, "");
  return `${base}/storage/v1/object/public/product-images/${storagePath}`;
}
