import { z } from "zod";
import { addressIssues, addressFields } from "../../../supabase/functions/_shared/checkout-rules.ts";

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

export const addressSchema = z
  .object({
    fullName: z.string({ required_error: "Ingresa tu nombre completo" }).min(addressFields.fullName.min, "Ingresa tu nombre completo").max(addressFields.fullName.max),
    email: z.string({ required_error: "Ingresa un email válido" }).email("Ingresa un email válido").max(addressFields.email.max),
    phone: z.string({ required_error: "Ingresa un teléfono válido" }).min(addressFields.phone.min, "Ingresa un teléfono válido").max(addressFields.phone.max),
    street: z.string({ required_error: "Ingresa tu calle y número" }).min(addressFields.street.min, "Ingresa tu calle y número").max(addressFields.street.max),
    comuna: z.string({ required_error: "Selecciona tu comuna" }).min(addressFields.comuna.min, "Selecciona tu comuna").max(addressFields.comuna.max),
    region: z.string({ required_error: "Selecciona tu región" }).min(addressFields.region.min, "Selecciona tu región").max(addressFields.region.max),
    zipCode: z.string().max(addressFields.zipCode.max).nullish(),
    notes: z.string().max(addressFields.notes.max).nullish(),
  })
  .superRefine((address, ctx) => {
    for (const issue of addressIssues(address)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [issue.path], message: issue.message });
    }
  });

export { REGIONES, RATE_BUCKETS, shippingRegionOf, type ChileRegion } from "./chile";
export { matchesShippingRegion, isKnownRegion } from "../../../supabase/functions/_shared/checkout-rules.ts";

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
