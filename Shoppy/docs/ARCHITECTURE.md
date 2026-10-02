# ARCHITECTURE — Shopy

## Monorepo (Fase 1)

- `apps/mobile`: Expo + Expo Router + TypeScript.
- `apps/admin`: Next.js + TypeScript.
- `packages/types`: entidades compartidas (Product, Order, Cart...).
- `packages/validation`: Zod (checkout, dirección, carrito).
- `packages/shared`: formato CLP, constantes (reserva 15 min, categorías iniciales).
- `supabase/`: migraciones, functions, seed (schema real en Fase 2).

Gestor: **npm workspaces**. Sin Turborepo/pnpm para no sobreingenierizar.
Si el repo crece se puede agregar Turborepo sin cambiar la estructura.

## Principios

1. Backend como fuente de verdad: disponibilidad, precios, stock, descuentos y
   estados de pedido se validan en Postgres/Edge Functions, nunca en el cliente.
2. Productos únicos con `stock = 1` pero schema admite `stock > 1` (a futuro).
3. Reserva temporal: `AVAILABLE -> RESERVED (15 min) -> SOLD`, expiración revierte.
4. Pagos/envíos/email como interfaces (`PaymentProvider`,
   `ShippingProvider`, `EmailProvider`) + mock en dev.
   Estado Fase 9: `EmailProvider` (mock/resend) con 7 templates ES y log
   idempotente (`order_notifications`); `ShippingProvider` manual contra
   `shipping_rates` + stubs Chilexpress/Starken env-gated.
5. RLS obligatoria; `service_role` jamás en cliente.
6. CLP como entero (sin decimales). `es-CL` para formato.
7. UI editorial minimalista con design tokens (Fase 3).

## Flujo de compra (resumen, detalle en PAYMENTS.md / DATABASE.md)

Carrito local persistente → checkout (dirección + despacho) →
reserva temporal en backend → `createPayment()` (mock/sandbox) →
webhook confirma → `PAID` → `PREPARING → SHIPPED → DELIVERED`.
