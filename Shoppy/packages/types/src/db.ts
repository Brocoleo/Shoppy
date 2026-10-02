/**
 * @shopy/types/db — Tipos espejo del schema Postgres (Fase 2).
 *
 * Fuente de verdad: supabase/migrations/*.sql.
 * Cuando exista el proyecto Supabase real, regenerar con:
 *   supabase gen types typescript --linked > packages/types/src/db.gen.ts
 * y reemplazar este archivo manual (mantener los mismos nombres).
 */

export type DbProductCondition = "como_nuevo" | "excelente" | "bueno" | "con_detalles";
export type DbProductAvailability = "AVAILABLE" | "RESERVED" | "SOLD" | "ARCHIVED";
export type DbOrderStatus =
  | "PENDING_PAYMENT" | "PAID" | "PREPARING" | "SHIPPED"
  | "DELIVERED" | "CANCELLED" | "REFUNDED";
export type DbDiscountKind = "percent" | "fixed";
export type DbPaymentStatus = "pending" | "approved" | "rejected" | "refunded";
export type DbReservationStatus = "active" | "consumed" | "expired" | "released";
export type DbAnalyticsEvent =
  | "product_view" | "search" | "favorite" | "add_to_cart"
  | "remove_from_cart" | "checkout_started" | "purchase";

export interface DbProfile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: "customer" | "admin";
  created_at: string;
  updated_at: string;
}

export interface DbAddress {
  id: string;
  user_id: string | null;
  full_name: string;
  email: string;
  phone: string;
  street: string;
  comuna: string;
  region: string;
  zip_code: string | null;
  notes: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbCategory {
  id: string;
  slug: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbBrand {
  id: string;
  slug: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface DbCollection {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  image_url: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface DbProduct {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  brand_id: string | null;
  category_id: string | null;
  subcategory_id: string | null;
  segment: string | null;
  price_clp: number;
  compare_at_price_clp: number | null;
  condition: DbProductCondition;
  size: string | null;
  color: string | null;
  sku: string | null;
  stock: number;
  availability: DbProductAvailability;
  published_at: string | null;
  tags: string[];
  view_count: number;
  favorite_count: number;
  trending_score: number;
  is_featured: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DbProductImage {
  id: string;
  product_id: string;
  /** Path dentro del bucket `product-images`. La URL pública la construye la app. */
  storage_path: string;
  sort_order: number;
  is_cover: boolean;
  is_defect_detail: boolean;
  alt_text: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbCart {
  id: string;
  user_id: string | null;
  session_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbCartItem {
  cart_id: string;
  product_id: string;
  qty: number;
  unit_price_clp: number;
  added_at: string;
}

export interface DbProductReservation {
  id: string;
  product_id: string;
  order_id: string | null;
  user_id: string | null;
  session_id: string | null;
  qty: number;
  status: DbReservationStatus;
  expires_at: string;
  created_at: string;
}

export interface DbOrder {
  id: string;
  order_number: string | null;
  user_id: string | null;
  guest_token: string | null;
  status: DbOrderStatus;
  subtotal_clp: number;
  discount_clp: number;
  shipping_clp: number;
  total_clp: number;
  currency: "CLP";
  shipping_address: Record<string, unknown>;
  discount_code: string | null;
  shipping_rate_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbOrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  product_slug: string;
  product_name: string;
  brand_name: string | null;
  size: string | null;
  color: string | null;
  condition: DbProductCondition;
  image_url: string | null;
  unit_price_clp: number;
  qty: number;
}

export interface DbPayment {
  id: string;
  order_id: string;
  provider: "mock" | "mercadopago" | "transbank";
  provider_payment_id: string | null;
  amount_clp: number;
  status: DbPaymentStatus;
  idempotency_key: string | null;
  raw_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DbShippingRate {
  id: string;
  region: string;
  comuna: string | null;
  carrier: string;
  price_clp: number;
  eta_days_min: number | null;
  eta_days_max: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbShipment {
  id: string;
  order_id: string;
  carrier: string;
  tracking_number: string | null;
  tracking_url: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbDiscount {
  id: string;
  code: string;
  kind: DbDiscountKind;
  value: number;
  starts_at: string | null;
  ends_at: string | null;
  min_subtotal_clp: number;
  usage_limit: number | null;
  usage_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbHomeSection {
  id: string;
  key: string;
  title: string;
  config: Record<string, unknown>;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}
