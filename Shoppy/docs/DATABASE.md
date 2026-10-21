# DATABASE — Shopy

> Estado Fase 10: schema + RLS + hardening implementados y **validados en Postgres 16 real**
> (`supabase/tests/rls_tests.sql`: checks T0–T16 en verde, más `beta_tests.sql`,
> `admin_images_tests.sql` y `sandbox_checkout_tests.sql`). El esquema remoto
> tiene las **21 migraciones aplicadas** (`supabase migration list --linked`).
> Ver `docs/AUDITORIA_OPENCODE.md` para el detalle de la remediación de seguridad.

## Migraciones (`supabase/migrations/`)

| Archivo | Contenido |
|---|---|
| `20260928000000_init_schema.sql` | Enums, tablas, índices, triggers, funciones de negocio |
| `20260928000001_rls_policies.sql` | `is_admin()`, RLS + policies, grants estilo Supabase |
| `20260928000002_seed.sql` | 16 categorías, 12 marcas, 20 productos, 40 imágenes, colecciones, 10 tarifas, 2 cupones, 6 secciones home |
| `20260929000000_storage.sql` + `20260929000002_storage_admin_write.sql` | Bucket `product-images` público en lectura, escritura solo admin/backend |
| `20260929000001_discount_claim.sql` | `claim_discount_usage()` atómico |
| `20260929000003_notifications_log.sql` | `order_notifications` (idempotencia + auditoría) |
| `20260929000004_hardening.sql` | search_path fijo, `guard_profile_role`, EXECUTE backend-only, cierre IDOR orders/order_items, analytics sin spoofing, `get_guest_order` sin token |
| `20260929000005_storage_limits.sql` | Bucket: solo jpeg/png/webp, tope 5 MB |

Aplicar en Supabase real con `supabase db push` (CLI vinculada) o `psql` contra la
connection string. Orden: schema → RLS → seed → storage.
Local: `supabase start` (aplica migraciones + seed solo) y seguir
`supabase/tests/README.md` + smoke `supabase/tests/smoke_fase4.mjs`.

## Modelo

- **Identidad**: `profiles(id→auth.users)`, `addresses`. Trigger `on_auth_user_created`
  crea el perfil automáticamente al registrarse.
- **Catálogo**: `categories` (auto-jerárquicas), `brands`, `products`, `product_images`
  (una sola portada por producto vía índice único parcial), `collections` + `collection_products`,
  `favorites`.
- **Carrito**: `carts` (un carrito por `user_id`, o por `session_id` para invitados) + `cart_items`
  con snapshot informativo de precio (se revalida en backend al pagar).
- **Disponibilidad**: `products.stock` + `products.availability`.
  Flujo prenda única: `AVAILABLE → RESERVED → SOLD`. Multi-stock (`stock > 1`, ej: pañuelo seed)
  mantiene `AVAILABLE` hasta agotar.
- **Pedidos**: `orders` (con `order_number` legible `SHO-XXXXXXXX` y `guest_token` para invitados),
  `order_items` con **snapshot inmutable** (nombre, marca, talla, precio), `order_status_history`
  automático vía trigger. Transiciones permitidas impuestas por trigger
  (`check_order_transition`): ni siquiera admin puede saltar estados.
- **Pagos/despacho**: `payments` (con `idempotency_key` y `provider_payment_id` únicos),
  `shipping_rates` administrables por región/comuna/carrier, `shipments` (1 por pedido).
- **Descuentos**: `discounts` + `discount_usages` (1 cupón por pedido).
- **Analytics/home**: `analytics_events` (7 tipos), `home_sections` (hero, newcomers, trending…).
- **Notificaciones**: `order_notifications` (order_id, event, recipient,
  unique por pedido+evento → idempotencia) para emails transaccionales.
- Precios CLP como `integer`. UUIDs. `updated_at` automático (excepto logs inmutables).

## Búsqueda

- `products.search_vector` (tsvector español: nombre, descripción, color, talla, tags)
  mantenido por trigger + índice GIN; índice trigram en `name` para autocompletado;
  GIN en `tags`. Camino abierto a búsqueda semántica (pgvector / embeddings) sin
  cambiar la API: sería una columna/índice más sobre el mismo modelo.

## Funciones de negocio (backend como fuente de verdad)

| Función | Rol |
|---|---|
| `reserve_products(order_id, items jsonb)` | Reserva atómica: bloquea filas en orden (`FOR UPDATE`), descuenta stock, marca `RESERVED` si llega a 0, crea reservas con expiración +15 min. Falla con `INSUFFICIENT_STOCK` / `PRODUCT_UNAVAILABLE`. |
| `release_expired_reservations()` | Devuelve stock y revierte `RESERVED→AVAILABLE`. La llama cron/Edge cada minuto. Retorna nº liberadas. |
| `mark_order_paid(order_id)` | Solo `service_role` o admin. Idempotente (segunda llamada no-op). Exige reserva activa, consume reservas, marca `SOLD`, pasa a `PAID`. |
| `validate_discount_code(code, subtotal)` | Valida activo/vigencia/mínimo/límite; retorna monto (case-insensitive, tope = subtotal). |
| `refresh_trending_scores()` | Pesos: compra 10 · checkout 4 · add_to_cart 3 · favorito 2 · vista 1 · search 0.5, decaimiento exponencial semanal, ventana 30 días + base logarítmica de contadores. Llamarla por cron (ej: cada 15 min). |
| `get_guest_order(order_id, token)` | Pedido de invitado + ítems como JSON. Única vía de lectura guest (sin SELECT directo). |
| `is_admin()` / `can_write_order_items()` | Helpers SECURITY DEFINER para policies. |

## Storage

Bucket **`product-images`** (público, solo lectura). El seed guarda `storage_path`
(`products/<slug>/0N.png`); la app construye la URL pública:
`<SUPABASE_URL>/storage/v1/object/public/product-images/<storage_path>`.
Placeholders locales: `supabase/seed/placeholders/` (generados con
`node supabase/seed/make-placeholders.mjs`, 40 PNG válidos sin dependencias).
Subirlos al bucket con el mismo path. Crear el bucket (una vez, con service_role):

```sql
insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true);
```

más policy pública de lectura en `storage.objects` para ese bucket (ver dashboard
Storage o SQL de policies de storage).

## Cron sugerido (pg_cron / Edge schedulada)

- `select public.release_expired_reservations();` — cada minuto.
- `select public.refresh_trending_scores();` — cada 15 minutos.

## Tipos TypeScript

`packages/types/src/db.ts` espeja el schema (regenerar con
`supabase gen types typescript` cuando exista el proyecto remoto).
