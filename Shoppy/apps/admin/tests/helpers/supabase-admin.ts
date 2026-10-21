/**
 * Cliente admin de Supabase para los tests E2E (service role).
 * Se usa solo para crear el usuario temporal, verificar el estado en BD y
 * limpiar al terminar. El flujo de negocio siempre ocurre en la UI.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_SECRET_KEY, SUPABASE_URL } from "./env";

export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Crea un usuario admin temporal y devuelve id + credenciales. */
export async function createTempAdmin(email: string, password: string) {
  const client = adminClient();
  const { data, error } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "e2e temporal" },
  });
  if (error) throw new Error(`[e2e] No se pudo crear el usuario: ${error.message}`);

  // El perfil lo crea un trigger; si no existe, lo insertamos con rol admin.
  const { error: profileError } = await client
    .from("profiles")
    .upsert(
      { id: data.user.id, email, role: "admin" },
      { onConflict: "id" },
    );
  if (profileError)
    throw new Error(`[e2e] No se pudo promover a admin: ${profileError.message}`);

  return { id: data.user.id, email, password };
}

export async function deleteTempAdmin(userId: string) {
  const client = adminClient();
  // Primero el usuario de auth: el perfil cae por cascada (profiles.id ->
  // auth.users ON DELETE CASCADE). Después borramos el perfil por si quedó.
  const { error } = await client.auth.admin.deleteUser(userId);
  if (error) console.warn(`[e2e] No se pudo borrar el usuario: ${error.message}`);
  const { error: profileError } = await client
    .from("profiles")
    .delete()
    .eq("id", userId);
  if (profileError)
    console.warn(`[e2e] No se pudo borrar el perfil: ${profileError.message}`);
}

export interface ProductRow {
  id: string;
  slug: string;
  name: string;
  published_at: string | null;
  metadata: Record<string, unknown>;
}

export async function getProduct(id: string): Promise<ProductRow | null> {
  const client = adminClient();
  const { data, error } = await client
    .from("products")
    .select("id,slug,name,published_at,metadata")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`[e2e] No se pudo leer el producto: ${error.message}`);
  return data as ProductRow | null;
}

export interface ProductImageRow {
  id: string;
  storage_path: string;
  sort_order: number;
  is_cover: boolean;
  is_defect_detail: boolean;
}

export async function getProductImages(productId: string): Promise<ProductImageRow[]> {
  const client = adminClient();
  const { data, error } = await client
    .from("product_images")
    .select("id,storage_path,sort_order,is_cover,is_defect_detail")
    .eq("product_id", productId)
    .order("sort_order");
  if (error) throw new Error(`[e2e] No se pudieron leer las imágenes: ${error.message}`);
  return (data ?? []) as ProductImageRow[];
}

export async function deleteProduct(id: string) {
  const client = adminClient();
  const { data: images } = await client
    .from("product_images")
    .select("storage_path")
    .eq("product_id", id);
  for (const img of images ?? []) {
    await client.storage.from("product-images").remove([img.storage_path]);
  }
  await client.from("product_images").delete().eq("product_id", id);
  await client.from("image_cleanup").delete().eq("product_id", id);
  await client.from("products").delete().eq("id", id);
}

/**
 * Crea un usuario CLIENTE temporal (el trigger le deja role='customer').
 * A diferencia de createTempAdmin, no se promueve a admin: sirve para probar
 * el aislamiento entre cuentas en el sitio público.
 */
export async function createTempUser(email: string, password: string) {
  const client = adminClient();
  const { data, error } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`[e2e] No se pudo crear el usuario: ${error.message}`);
  return { id: data.user.id, email, password };
}

export async function deleteTempUser(userId: string) {
  const client = adminClient();
  const { error } = await client.auth.admin.deleteUser(userId);
  if (error) console.warn(`[e2e] No se pudo borrar el usuario: ${error.message}`);
  const { error: profileError } = await client
    .from("profiles")
    .delete()
    .eq("id", userId);
  if (profileError)
    console.warn(`[e2e] No se pudo borrar el perfil: ${profileError.message}`);
}

export interface TestOrder {
  id: string;
  order_number: string;
}

/**
 * Inserta un pedido de prueba para el usuario indicado (mode='test' para que
 * no aparezca en la vista live del panel). No reserva stock ni pasa por el
 * checkout: solo sirve para tener algo en "Mis pedidos" de una cuenta.
 */
export async function createTestOrder(userId: string): Promise<TestOrder> {
  const client = adminClient();
  const { data, error } = await client
    .from("orders")
    .insert({
      user_id: userId,
      status: "PENDING_PAYMENT",
      subtotal_clp: 10000,
      total_clp: 10000,
      shipping_address: { fullName: "E2E aislamiento", region: "Ñuble", comuna: "Chillán", street: "5 de Abril 1234" },
      mode: "test",
    })
    .select("id,order_number")
    .single();
  if (error) throw new Error(`[e2e] No se pudo crear el pedido: ${error.message}`);
  return data as TestOrder;
}

export async function deleteTestOrder(orderId: string) {
  const client = adminClient();
  const { error } = await client.from("orders").delete().eq("id", orderId);
  if (error) console.warn(`[e2e] No se pudo borrar el pedido: ${error.message}`);
}
