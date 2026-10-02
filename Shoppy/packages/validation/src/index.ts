import { z } from "zod";

export const productConditionSchema = z.enum([
  "como_nuevo",
  "excelente",
  "bueno",
  "con_detalles",
]);

export const productAvailabilitySchema = z.enum([
  "AVAILABLE",
  "RESERVED",
  "SOLD",
  "ARCHIVED",
]);

export const addressSchema = z.object({
  fullName: z.string().min(2).max(120),
  email: z.string().email().max(160),
  phone: z.string().min(6).max(30),
  street: z.string().min(3).max(200),
  comuna: z.string().min(2).max(100),
  region: z.string().min(2).max(100),
  zipCode: z.string().max(20).nullish(),
  notes: z.string().max(500).nullish(),
});

export const cartItemSchema = z.object({
  productId: z.string().uuid(),
  qty: z.number().int().min(1).max(99),
  unitPriceClp: z.number().int().nonnegative(),
  addedAt: z.string().datetime(),
});

export const checkoutInputSchema = z.object({
  items: z.array(cartItemSchema).min(1).max(50),
  address: addressSchema,
  discountCode: z.string().max(40).nullish(),
  shippingRateId: z.string().uuid().nullish(),
});

export type CheckoutInput = z.infer<typeof checkoutInputSchema>;
export type AddressInput = z.infer<typeof addressSchema>;
