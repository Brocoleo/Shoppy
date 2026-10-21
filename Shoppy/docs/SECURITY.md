# SECURITY — Shopy

> Estado Fase 10: RLS + hardening implementados y **testeados en Postgres 16**
> (`supabase/tests/`: checks T0–T16 en verde + `beta_tests.sql` +
> `admin_images_tests.sql` + `sandbox_checkout_tests.sql`). Nunca desactivar RLS
> para "arreglar" permisos. Remediación de privilegios aplicada el 20-oct-2026
> (`20261020000000_security_profiles_payments.sql`): `profiles` con policies por
> comando, `payments` de solo lectura para clientes y admins, y
> `mark_order_paid` ejecutable solo por `service_role`.

## Modelo de roles

- **anon**: lee catálogo publicado, rastrea pedidos guest vía
  `get_guest_order(id, token)` (RPC) e ingiere analytics de catálogo.
  NO inserta pedidos, ítems ni cupones: todo checkout pasa por la Edge Function.
- **authenticated**: solo sus datos (`user_id = auth.uid()`): perfil, direcciones,
  favoritos, carrito, pedidos. Puede cancelar sus pedidos `PENDING_PAYMENT` y
  agregar ítems solo a sus pedidos `PENDING_PAYMENT` propios. NO puede cambiar
  su `profiles.role` (trigger `guard_profile_role`).
- **Invitado**: sin login; el backend crea su pedido con `guest_token` y lo
  consulta vía RPC. Sin acceso tabular.
- **admin** (`profiles.role='admin'`, vía `is_admin()` SECURITY DEFINER): CRUD total salvo
  saltar transiciones de pedido (el trigger no lo permite a nadie). Conserva el
  toggle de roles (el guard evalúa al *llamador*, no a la fila).
- **service_role**: bypass total. SOLO backend (Edge Functions): crear pedidos,
  reservas, cupones, confirmar pagos (`mark_order_paid`), webhooks. Jamás en mobile.

## Matriz de policies (base `20260928000001` + hardening `20260929000004`)

| Tabla | Lectura pública/dueño | Escritura |
|---|---|---|
| products | publicado y no ARCHIVED | admin |
| product_images, categories, brands, collections, home_sections, shipping_rates, discounts | público (activos) | admin |
| profiles, addresses, favorites, carts, cart_items | dueño / admin (lectura) | dueño (**role** solo admin/service_role/bootstrap) |
| orders | dueño | **solo backend** (INSERT revocado a anon/authenticated); dueño solo cancela; admin todo |
| order_items | dueño | dueño autenticado en pedido propio `PENDING_PAYMENT`; resto backend |
| order_status_history, payments, shipments | dueño (lectura) | admin (backend service_role en prod) |
| product_reservations, discount_usages | admin | backend |
| analytics_events | admin | ingesta de catálogo sin atribución ajena (sin `purchase`) |
| order_notifications | dueño (lectura) / admin | backend |

## Garantías verificadas (tests)

1. **A no lee pedidos de B** (IDOR bloqueado; update ajeno = 0 filas).
2. **anon no inserta productos** (`insufficient_privilege`).
3. **Cliente no modifica precios** (0 filas).
4. **Cliente no marca PAID** (`FORBIDDEN`; solo service_role/admin en `mark_order_paid`).
5. **Guest solo con token** (RPC ok con token, `ORDER_NOT_FOUND` sin él, sin SELECT directo;
   el RPC ya no devuelve `guest_token`; anon no inserta pedidos directos).
6. **Doble venta imposible** (`reserve_products` atómica → `INSUFFICIENT_STOCK`;
   `reserve_products` revocada a clientes).
7. **Expiración revierte** (`RESERVED→AVAILABLE` + stock).
8. **Pago idempotente** (segunda llamada no-op; `SOLD` + historial) + **IDOR de
   order_items bloqueado** (A no inserta en pedido de B).
9. **Transiciones ilegales bloqueadas** (`PAID→DELIVERED` falla; ruta legal avanza).
10. **Cupones validados en backend** (monto, mínimo, inexistente, case-insensitive;
    `validate_discount_code` revocada a anon).
11. **Analytics**: ingesta de catálogo, lectura solo admin, sin spoofing de
    `user_id` ni `purchase` falsos.
12. **Trending pondera** (compras > vistas).
13. **Role no autoasignable** (auto-promoción → `FORBIDDEN`; admin conserva toggle;
    edición propia intacta).

## Hardening Fase 10 (`20260929000004` + `20260929000005`)

- `search_path = public, pg_temp` en toda función SECURITY DEFINER.
- EXECUTE revocado a anon/authenticated/public en RPC backend-only
  (`reserve_products`, `claim_discount_usage`, `release_expired_reservations`,
  `refresh_trending_scores`, `validate_discount_code`).
- Bucket `product-images`: solo `image/jpeg|png|webp`, tope 5 MB.
- Rate-limit en memoria en `checkout` (create 30/min, resto 60/min, webhook 300/min)
  y `notify` (60/min) + `verify_jwt` (`checkout=false`, `notify=true`).

## Superficie restante (post-Fase 10)

Validación de firma de webhooks Mercado Pago (hoy se acepta por `type=payment` +
idempotencia de `mark_order_paid`), y re-ejecutar este suite contra el proyecto
Supabase real (`supabase db push` + tests con roles anon/authenticated).
