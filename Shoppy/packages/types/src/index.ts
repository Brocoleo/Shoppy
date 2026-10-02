/**
 * @shopy/types — Modelos compartidos mobile/admin.
 * Fase 1: enumeraciones y entidades mínimas para fundación.
 * El schema completo de DB se define en Fase 2 (supabase/migrations).
 */

export * from "./db.js";

export type UUID = string;


export type ProductCondition =
  | "como_nuevo"
  | "excelente"
  | "bueno"
  | "con_detalles";

export type ProductAvailability =
  | "AVAILABLE"
  | "RESERVED"
  | "SOLD"
  | "ARCHIVED";

export type OrderStatus =
  | "PENDING_PAYMENT"
  | "PAID"
  | "PREPARING"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED"
  | "REFUNDED";

export interface Category {
  id: UUID;
  slug: string;
  name: string;
  parentId: UUID | null;
  sortOrder: number;
  isActive: boolean;
}

export interface Brand {
  id: UUID;
  slug: string;
  name: string;
}

export interface ProductImage {
  id: UUID;
  productId: UUID;
  storagePath: string;
  publicUrl: string | null;
  sortOrder: number;
  isCover: boolean;
  isDefectDetail: boolean;
  altText: string | null;
}

export interface Product {
  id: UUID;
  slug: string;
  name: string;
  description: string | null;
  brandId: UUID | null;
  brandName: string | null;
  categoryId: UUID | null;
  subcategoryId: UUID | null;
  /** Género/segmento opcional: mujer | hombre | unisex | kids ... */
  segment: string | null;
  priceClp: number;
  compareAtPriceClp: number | null;
  condition: ProductCondition;
  size: string | null;
  color: string | null;
  sku: string | null;
  stock: number;
  availability: ProductAvailability;
  coverImageUrl: string | null;
  publishedAt: string | null;
  tags: string[];
  viewCount: number;
  favoriteCount: number;
  trendingScore: number;
  isFeatured: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CartItem {
  productId: string;
  qty: number;
  /** Snapshot de precio al agregar (CLP). El precio real se revalida en backend al pagar. */
  unitPriceClp: number;
  addedAt: string;
}

export interface Cart {
  items: CartItem[];
  updatedAt: string;
}

export interface Address {
  id?: UUID;
  fullName: string;
  email: string;
  phone: string;
  street: string;
  comuna: string;
  region: string;
  zipCode: string | null;
  notes: string | null;
}

export interface OrderItemSnapshot {
  productId: UUID;
  productSlug: string;
  productName: string;
  brandName: string | null;
  size: string | null;
  color: string | null;
  condition: ProductCondition;
  imageUrl: string | null;
  unitPriceClp: number;
  qty: number;
}

export interface Order {
  id: UUID;
  guestToken: string | null;
  userId: UUID | null;
  status: OrderStatus;
  subtotalClp: number;
  discountClp: number;
  shippingClp: number;
  totalClp: number;
  currency: "CLP";
  shippingAddress: Address;
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PaymentProviderName = "mock" | "mercadopago" | "transbank";

export interface CreatePaymentInput {
  orderId: UUID;
  amountClp: number;
  returnUrl: string;
  webhookUrl?: string;
}

export interface PaymentResult {
  providerPaymentId: string;
  checkoutUrl: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
}
