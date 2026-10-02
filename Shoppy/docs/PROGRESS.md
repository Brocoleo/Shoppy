# PROGRESS — Shopy

## Estado actual: Fase 10 — Hardening ✅ COMPLETADA (24 checks DB + Deno + typecheck + lint verdes)

## Fase 0 — Inspección ✅

- Fecha: 2026-09-28
- Directorio `Shoppy/` estaba **vacío** (0 archivos). Sin proyecto previo que preservar.
- Repo git raíz: `.../React Native/` (rama `master`, sin commits; `Shoppy/` untracked, `apostol/` es otro proyecto, no se tocó).
- Toolchain: Node v24.21.0, npm 11.19.0, red disponible.
- Decisión: crear monorepo desde cero dentro de `Shoppy/`.

## Fase 1 — Foundation ✅

### Creado

- **Monorepo npm workspaces** (`apps/*`, `packages/*`). Sin Turborepo/pnpm para no sobreingenierizar.
- **`apps/mobile` (`shopy-mobile`)**: Expo SDK 57 + Expo Router + TypeScript + React 19.2.3.
  Rebrand mínimo: nombre `Shopy`, slug/scheme `shopy`, `cl.shopy.app` (android/ios), home "Shopy · Ropa de segunda mano · Chile".
- **`apps/admin` (`shopy-admin`)**: Next.js 16.3.6 + TypeScript + Tailwind v4 + React 19.2.8.
  Metadata `Shopy Admin`, `lang="es"`.
- **`packages/types`**: Product, Category, Brand, Cart, Order, Address, OrderStatus, PaymentProvider I/O, etc.
- **`packages/validation`**: Zod v3 — `addressSchema`, `cartItemSchema`, `checkoutInputSchema`.
- **`packages/shared`**: `formatCLP()` (es-CL), `RESERVATION_MINUTES = 15`, categorías iniciales.
- **Tooling**: `tsconfig.base.json` (paths `@shopy/*`) + `tsconfig.json` (packages + functions);
  cada app usa su propio tsconfig (expo / next) con script `typecheck`.
  ESLint flat raíz (`no-explicit-any: error`); admin conserva su `eslint-config-next`.
- **Env**: `.env.example` (Supabase, `PAYMENT_PROVIDER=mock`, `EMAIL_PROVIDER=mock`, shipping manual).
- **Docs**: `README.md`, `ARCHITECTURE.md`, `DATABASE.md`, `PAYMENTS.md`, `SECURITY.md`.
- **`supabase/{migrations,functions,seed}/`**: estructura + convención de nombres, contenido real en Fase 2.

### Stack de datos instalado y validado (mobile)

`@supabase/supabase-js@2`, `@tanstack/react-query@5`, `zustand@5`,
`react-hook-form@7`, `zod@3` (mismo major que `@shopy/validation` para compatibilidad de tipos).
Admin lleva `supabase-js` + `zod`; RHF/Query se agregan en Fase 7 si hacen falta.

### Validaciones ejecutadas (todas verdes, 2026-09-28)

- `tsc` raíz (packages): ✅ exit 0
- `mobile typecheck`: ✅ exit 0
- `admin typecheck`: ✅ exit 0
- `eslint . --max-warnings 0`: ✅ exit 0 (se corrigieron 2 issues del template: import sin usar y `require()` de fuente → disable inline justificado, patrón estándar Expo/Metro)
- `admin lint` (eslint-config-next): ✅ exit 0
- `admin build` (Next 16 + Turbopack): ✅ compila y prerenderiza `/`
- `expo export --platform web`: ✅ bundle + 7 rutas estáticas

### Cómo ejecutar

```bash
npm install
cp .env.example .env   # completar cuando exista proyecto Supabase
npm run mobile         # Expo: QR con Expo Go, o `a` / `i` / `w`
npm run admin          # http://localhost:3000
npm run typecheck      # tsc global (raíz + mobile + admin)
npm run lint           # ESLint estricto
```

## Decisiones tomadas

- npm workspaces (no Turborepo/pnpm todavía).
- CLP como entero (`priceClp`), locale `es-CL`.
- Reserva temporal 15 min.
- Pagos/email/shipping desacoplados + `mock` por defecto; sin credenciales inventadas.
- Zod v3 en todo el monorepo (maduro, compatible con RHF).
- Versiones de scaffolds (Expo 57, Next 16, TS del template) no se tocan si funcionan.
- `no-explicit-any` como error ESLint global.

## Errores conocidos

- Ninguno. Warning menor de Node sobre `eslint.config.js` sin `"type": "module"` ya resuelto agregándolo al `package.json` raíz.

## Fase 10 — Hardening ✅ (2026-09-30)

Auditoría SQL solo-lectura encontró 6 familias de hallazgos; todos cerrados
sin cambiar comportamiento observable (el checkout siempre fue vía Edge Function
con service_role):

- **Escalada a admin** (`profiles_owner_rw` permitía `UPDATE role='admin'`):
  trigger `guard_profile_role()` — el toggle admin sigue funcionando.
- **RPC backend-only expuestas** (`grant execute on all functions`): revoke a
  anon/authenticated/public en `reserve_products`, `claim_discount_usage`,
  `release_expired_reservations`, `refresh_trending_scores`, `validate_discount_code`.
- **IDOR escritura** (`can_write_order_items` comprobaba `guest_token is not null`
  sin comparar): INSERT de `orders` revocado a clientes; `order_items` solo dueño
  autenticado de pedido propio `PENDING_PAYMENT`.
- **Analytics falseable** (`purchase` + `user_id` arbitrarios): policy restringe a
  eventos de catálogo con atribución propia o nula.
- **`get_guest_order` devolvía `guest_token`** (credencial en logs/proxies): ya no.
- **`search_path` mutable** en SECURITY DEFINER: fijado a `public, pg_temp`.
- Bucket `product-images`: solo jpeg/png/webp, tope 5 MB (`20260929000005`).
- Rate-limit en memoria (`_shared/ratelimit.ts` + test): checkout create 30/min,
  resto 60/min, webhook MP 300/min, notify 60/min; `verify_jwt`
  (`checkout=false`, `notify=true`) en `config.toml`.
- Suite DB ampliada T5b/T6b/T8d/T9b/T10c/T12 (24 checks, Postgres 16 efímero);
  stub local suma rol `service_role` + USAGE en esquema `auth`.
- Firma HMAC de webhooks MP: ya implementada y testeada desde Fase 8
  (`verifyMercadoPagoSignature` + test). Sin pendiente técnico.
- Cierre Fase 10 (2026-09-30, continuación): transporte checkout con timeout
  20 s + códigos `TIMEOUT`/`OFFLINE`; imágenes remotas migradas a `expo-image`
  (caché disco/memoria, `recyclingKey` en listas); `docs/PRODUCTION.md` con el
  checklist a producción. Resta solo lo bloqueado en el dueño (credenciales).

## Próximos pasos (requiere tu autorización)

- **Activación real de pagos/emails/carriers** (cuando entregues credenciales):
  secrets en proyecto, `PAYMENT_PROVIDER`/`EMAIL_PROVIDER`/`SHIPPING_PROVIDER`,
  sandbox primero (TBK TEST no pide credenciales propias).

---

## Fase 9 — Emails y shipping ✅ (2026-09-29)

### EmailProvider (`supabase/functions/_shared/email.ts`)

- Interfaz + `MockEmailProvider` (log, default) + `ResendEmailProvider`
  (HTTP directo, `RESEND_API_KEY` + `EMAIL_FROM`). Recovery de contraseña:
  nativo de Supabase Auth (Mailpit en local).
- 7 templates ES con branding mínimo (creado, pago, preparando, despachado
  con tracking, entregado, cancelado, reembolsado) con token guest cuando
  aplica. HTML escapado.
- Migración `20260929000003_notifications_log`: `order_notifications`
  (unique pedido+evento = idempotencia + auditoría, RLS admin/dueño-lectura).

### ShippingProvider (`supabase/functions/_shared/shipping.ts`)

- `ManualShippingProvider` (default): cotiza `shipping_rates` (las que el
  admin gestiona) y tracking desde `shipments`. `ChilexpressProvider` /
  `StarkenProvider`: esqueletos env-gated sin URLs inventadas.

### Función `notify` + hooks

- `POST /functions/v1/notify {order_id, event}` con JWT admin (401/403 si no);
  idempotente (`ALREADY_NOTIFIED`).
- Checkout envía `order_created` (al crear) y `payment_confirmed` (al confirmar),
  best-effort sin romper el flujo.
- Admin dispara el email del evento al avanzar estados (nota de confirmación).
- Mobile: link "Seguir en transportista ↗" (tracking_url) en detalle de pedido.

### Validación

- Deno: `notify_test.ts` **6/6** + `payment_test.ts` **5/5** (11 totales).
- Notify E2E: sent → repeat idempotente → 401 sin JWT → 403 customer.
- Smoke Fase 6 re-ejecutado **11/11** (con emails activos).
- `typecheck` ✅ · `eslint` raíz y Next ✅ · `next build` ✅ · `expo export` ✅ (19).
- Seed restaurado tras tests.

---

## Fase 8 — Payments ✅ (2026-09-29, sin credenciales: mock vigente)

### Adaptadores reales (código completo, por env, sin secretos inventados)

- `supabase/functions/_shared/payment.ts`: `MockPaymentProvider` (igual),
  **`MercadoPagoProvider`** (Checkout Pro: preferences + `init_point`,
  verify por `external_reference`, webhook HMAC-SHA256 con manifest oficial,
  refund) y **`TransbankProvider`** (Webpay Plus REST v1.2: create/commit vía
  verify/refund/status; hosts TEST/LIVE; TEST usa códigos públicos oficiales
  solo sin env; LIVE exige env o falla explícito).
- Interfaz extendida de forma compatible: `checkoutUrl`, `orderId?` en verify,
  `WebhookInput` (headers/query/body).
- Checkout: `create` acepta `return_url` y devuelve `checkout_url`;
  `confirm` pasa orderId; nueva acción `webhook` (MP, idempotente, 200/201,
  401 con firma mala; converge como confirm).
- Mobile: tras create con `checkout_url` abre `expo-web-browser`, retorno por
  deep link `shopy://checkout-return` (scheme ya existía) + botón "Ya pagué"
  (todo idempotente). Mock sin cambios visibles.

### Validación

- Deno instalado (`~/.deno`): `payment_test.ts` **5/5** (mock, factory,
  HMAC válida/manipulada/secret distinto/sin firma, TBK pre-red, LIVE sin env).
- `deno check checkout` ✅ · smoke mock Fase 6 re-ejecutado **11/11** ✅ ·
  `typecheck` ✅ · `lint` ✅ · `export` ✅ (19 rutas).
- E2E real (MP/TBK) pendiente de credenciales: documentado en `docs/PAYMENTS.md`
  (qué pedir, dónde ponerlo, orden de pruebas: TBK TEST → MP sandbox → LIVE).

### Decisiones

- `TRANSBANK_API_KEY` renombrado a `TRANSBANK_API_KEY_SECRET` (preciso).
- Sin SDKs de pago (fetch directo: menos peso, control total en edge).
- `FUNCTIONS_PUBLIC_URL` para `notification_url` (local no recibe webhooks MP).

---

## Fase 7 — Admin ✅ (2026-09-29)

### Panel `apps/admin` (Next.js 16, 15 rutas, gate solo-admin)

- Login email/password con verificación de rol; sidebar (Dashboard, Productos,
  Pedidos, Categorías, Marcas, Colecciones, Descuentos, Envíos, Home, Clientes).
- **Dashboard**: ventas hoy/7d/30d, ticket, prendas vendidas, barras 7 días
  (CSS, sin librerías pesadas), más vistos/guardados, stock ≤2, últimos pedidos.
- **Productos**: lista con búsqueda/filtro, crear, editar completo (marca,
  categorías, precio/anterior, condición, talla, color, SKU, stock,
  disponibilidad, publicado, tags, destacado), archivar, eliminar.
  Imágenes: upload a Storage, portada única, marcar defecto, reorden, eliminar.
- **Pedidos**: lista con filtro, detalle (ítems, entrega, historial) y avance
  solo a estados permitidos (el trigger DB manda) + despacho (carrier/tracking).
- **Catálogos**: categorías (jerarquía), marcas, colecciones (miembros por slug).
- **Descuentos/Envíos/Home/Clientes**: CRUD completos; home edita JSON validado;
  clientes con conteo de pedidos y toggle admin (anti auto-democión).
- Comparte `@shopy/types` vía `transpilePackages`; TanStack Query en admin.

### Seguridad

- Nueva migración `20260929000002_storage_admin_write`: Storage escribible
  solo por admin (antes abierto — detectado y corregido en esta fase).
- `supabase/seed/make-admin.mjs`: crea/promueve admin inicial
  (local: admin@shopy.cl).

### Validación

- `typecheck` ✅ · `eslint` raíz ✅ · `eslint-config-next` ✅ (0 errores) ·
  `next build` ✅ (15 rutas).
- Escritura real verificada: crear producto + upload + eliminar como admin;
  anon bloqueado en Storage.
- Correcciones: JSX en `.ts` → `.tsx`, `</View>` en web, casts, y migración
  total a TanStack Query (el lint react-compiler de Next 16 prohíbe setState
  en effects y llamadas impuras en render).

---

## Fase 6 — Checkout ✅ (2026-09-29)

### Backend: Edge Function `checkout` (Deno, service key solo servidor)

- Acciones: `quote` (totales sin efectos) · `create` (valida todo en DB, crea
  pedido + snapshot + cupón atómico vía `claim_discount_usage`, guarda dirección,
  `reserve_products` 15 min con rollback, pago mock pendiente) · `confirm`
  (verifica mock, idempotente con `already`, converge pago aprobado→PAID,
  409 si la reserva venció).
- `_shared/payment.ts`: interfaz `PaymentProvider` + `MockPaymentProvider`
  stateless (idempotencia en DB, no en memoria de isolates). Reales en Fase 8.
- Nueva migración `20260929000001_discount_claim` (incremento atómico de usos).
- `supabase/.env` (gitignored) para `functions serve --env-file`
  (`PUBLIC_STORAGE_URL` corrige host interno kong en `image_url`).
- `tsconfig` excluye `supabase/functions` (runtime Deno; se valida con serve+smoke).

### Mobile

- `app/checkout.tsx` (3 pasos: dirección RHF+Zod con prefill, despacho con
  tarifas por región + cupón con quote en vivo, revisar/pagar) → éxito con
  número + token invitado → limpia carrito. Sin backend: aviso honesto.
- Carrito deriva a `/checkout` (bloquea si hay issues).
- `app/pedidos.tsx`: reales (authed) + rastreador invitado (id+token) + mock
  sin backend. `app/pedido/[id].tsx`: real/mock/guest (`?token=`).
- `src/lib/checkout.ts`: transporte tipado + `listShippingRates`,
  `listMyOrders`, `trackGuestOrder`, `getMyOrderDetail`.

### Validación

- `supabase/tests/smoke_fase6.mjs`: **ALL CHECKOUT SMOKE CHECKS PASSED**
  (11 checks: cupón-mínimo, quote, create+confirm guest, confirm idempotente,
  tracking, authed + dirección guardada + RLS dueño, doble-compra 409).
- `typecheck` ✅ · `eslint` ✅ · `expo export` ✅ (19 rutas).
- Bugs reales corregidos: mock con Map (isolates), `providerPaymentId` snake,
  `image_url` kong interno, `tsc` sobre Deno.
- Infra: volúmenes corruptos → borrados y `start` limpio; stack adelgazado
  (sin realtime/studio/analytics/mailpit) + `--ignore-health-check`
  (el CLI es impaciente bajo carga; los servicios calientan solos). Servir
  functions: `supabase functions serve checkout --no-verify-jwt --env-file supabase/.env`.

---

## Fase 5 — Carrito ✅ (2026-09-29)

### Persistencia + sincronización

- Zustand `persist` (AsyncStorage, `shopy-store-v1`): carrito y favoritos guest
  sobreviven cierre/reinicio/navegación.
- `src/data/cartSync.ts`: `pull/push/merge` contra `carts/cart_items`
  (snapshot `unit_price_clp` con precio vigente de backend).
- `AuthContext`: al login fusiona invitado→cuenta (suma, tope 99) y adopta el
  resultado; suscrito a cambios con write-through debounce 800ms (con firma
  anti-loops); al salir, el carrito local persiste como invitado.
- `validateCart()`: revalida precio/stock/disponibilidad contra backend por línea
  (`ok | adjusted | out_of_stock | unavailable`) + subtotal; hook
  `useValidatedCart` (stale 30s). El carrito resuelve productos vía catálogo
  (funciona mock y Supabase) y muestra avisos + bloqueo honesto si hay issues.

### Validación

- `supabase/tests/smoke_fase5.mjs`: **ALL CART SMOKE CHECKS PASSED** (12 checks:
  crear carrito, upsert, snapshot=precio backend, delete stale, aislamiento A/B
  total — B no ve/modifica/inserta —, anon bloqueado).
- `typecheck` ✅ · `eslint` ✅ · `expo export` ✅ (18 rutas).
- Nota: un export falló por correrlo desde la raíz (Metro tomó otro root);
  siempre exportar desde `apps/mobile`.

---

## Fase 4 — Catálogo real ✅ (2026-09-29)

### Backend local (Supabase CLI + Docker, sin credenciales remotas)

- `supabase start`: stack local en `http://127.0.0.1:54321` (API) / `:54323` (Studio).
  Migraciones + seed se aplicaron solos (20 productos, 40 imágenes).
- Nueva migración `20260929000000_storage`: bucket público `product-images` + policies.
- `supabase/seed/upload-placeholders.mjs`: sube los 40 PNG (upsert, reusable en remoto).
- Claves NUEVAS de la CLI (`sb_publishable_/sb_secret_`); supabase-js 2.117 las soporta.
- `apps/mobile/.env` (gitignored) apunta al local; `.env.example` documenta remoto.

### Mobile conectado

- `src/lib/supabase.ts`: cliente con sesión persistente (AsyncStorage);
  `isSupabaseConfigured` alterna mock ↔ real sin cambiar pantallas.
- `src/data/SupabaseCatalogRepository.ts`: misma interfaz que el mock —
  listado/orden, detalle + imágenes (URLs públicas de Storage), búsqueda
  full-text español (`search_vector`, plain/AND), filtros (categoría+sub,
  marca, condición, talla, precio), categorías, marcas, colecciones, tallas.
- `CatalogProduct.remoteImages`; `src/data/images.ts` unifica cover/galería
  (remoto prefiere, mock cae a placeholders). Hero, cards, detalle, carrito y
  pedido usan helpers.
- `trackProductView` (product_view anon, no-op sin backend) en detalle.
- **Auth**: `AuthContext` (email/password, sesión persistente, Google/Apple en Fase 6).
- **Favoritos sincronizados**: `useFavoriteIds/useToggleFavorite` (remoto con
  optimistic update si hay sesión, local si no); merge local→remoto al login
  (upsert ignore-duplicates); badge y pantallas migradas.
- **Perfil real**: formulario RHF+Zod (login/registro, errores), cerrar sesión,
  menú; pedidos siguen mock (reales en Fase 6).

### Validación

- `supabase/tests/smoke_fase4.mjs`: **ALL SMOKE CHECKS PASSED** (14 checks:
  listado 20, brand embed, textSearch ES + AND, taxonomías, colección, detalle,
  imágenes, anon-no-escribe, storage 200, analytics anon, signup/signin,
  favorito remoto). Reusable en remoto con env vars.
- `typecheck` (3 proyectos) ✅ · `eslint --max-warnings 0` ✅ ·
  `expo export web` con backend activo ✅ (18 rutas, sin warnings de rutas).
- Fallos transitivos por stack tibio (schema-cache PostgREST, healthcheck 2s bajo
  carga con 2 stacks) — no son bugs; reintentar tras calentar.

### Decisiones / deuda

- Claves locales en `.env.example` (inútiles fuera de localhost, sirven de ejemplo).
- Pedidos mock hasta Fase 6; colecciones `ofertas/novedades` siguen existiendo
  como categorías (compatibilidad con Home).
- `getCollection` usa join `collections!inner(slug)` (requiere PostgREST ≥ v12;
  el local trae v16).
- Para remoto: `supabase link` + `db push`, crear bucket (migración incluida),
  correr upload + smoke con keys del dashboard; crons Fase 2 pendientes.

---

## Fase 3 — Mobile UI ✅ (2026-09-28)

### Rutas (Expo Router, 18 estáticas verificadas)

- Tabs: Inicio, Buscar, Favoritos (badge), Carrito (badge), Perfil.
- Stack: `/catalogo`, `/categoria/[slug]`, `/coleccion/[slug]`,
  `/producto/[id]`, `/pedidos`, `/pedido/[id]`.
- Home editorial: hero configurable, recién llegados, tendencias, categorías,
  marcas destacadas, Selección Shopy, ofertas, footer CLP/despacho.

### Arquitectura UI (lista para Fase 4 sin reescribir pantallas)

- `src/theme/tokens.ts`: paleta BN/grises (light+dark), espaciado, tipografía,
  `formatCLP`. Marca en tokens, no hardcodeada.
- `src/data/catalog.ts`: 20 productos mock espejo del seed (mismos ids/slugs/precios)
  + categorías, marcas, colecciones, 2 pedidos mock con timeline.
- `src/data/repository.ts`: interfaz `CatalogRepository` + mock con latencia,
  búsqueda multi-token, filtros (categoría/sub, marca, condición, talla, precio)
  y orden (tendencia/novedades/precio±). Fase 4 = nueva implementación, mismos hooks.
- `src/query/`: QueryClient (stale 60s, retry 1) + hooks por pantalla.
- `src/stores/useShopStore.ts`: zustand carrito + favoritos (en memoria;
  persistencia AsyncStorage + sync en Fase 5/4).
- Componentes: ProductCard (badge condición, "Pieza única", corazón),
  Skeletons, EmptyState, ConditionBadge, Chip, SearchBar, QtyStepper, ProductRail.
- Detalle producto: galería paginada con etiqueta "Foto de detalle" en defectos,
  specs, tags, relacionados. Pedido: timeline + tracking.
- Iconos `@expo/vector-icons` (cross-platform; expo-symbols era iOS-only).
- Sin URLs externas: 40 placeholders copiados a `assets/placeholders/`
  (mapa en `src/data/productImages.ts`).

### Validación

- `typecheck` raíz+mobile+admin ✅ · `eslint --max-warnings 0` ✅.
- `expo export --platform web` ✅: 18 rutas con render estático exitoso
  (cada pantalla se ejecutó sin crashear en build).
- Correcciones: tipos ColorValue/DimensionValue/Palette, `require()` 100% literales
  (Metro no acepta wrappers dinámicos), 6 pantallas movidas dentro de `app/`
  (el export las detectó como faltantes).

### Decisiones / deuda explícita

- `formatCLP` duplicado en tokens (evita riesgo Metro con `@shopy/shared`;
  consolidar resolución de workspaces en Fase 4).
- Checkout/Auth/Direcciones muestran aviso honesto "Fase 6/4" (no placeholders rotos).
- `Themed.tsx`/`Colors.ts` del template se conservan (inofensivos).
- Ejecutar: `npm run mobile` (Expo Go) — probado vía export web; probar en
  dispositivo en Fase 4 con datos reales.

---

## Fase 2 — Database ✅ (2026-09-28)

### Migraciones (`supabase/migrations/`)

- `20260928000000_init_schema`: 21 tablas, 6 enums, índices (GIN search/trigram/tags),
  `search_vector` por trigger (columna GENERATED imposible: `to_tsvector` no es
  inmutable), `order_number` auto, historial de estados auto, guard de transiciones.
- Funciones: `reserve_products` (atómica, +15 min), `release_expired_reservations`,
  `mark_order_paid` (solo service_role/admin, idempotente), `validate_discount_code`,
  `refresh_trending_scores` (pesos compra 10 … search 0.5, decaimiento semanal),
  `get_guest_order` (RPC con token), `is_admin`, `can_write_order_items`.
- `20260928000001_rls_policies`: RLS en 22 tablas + matriz de policies + grants.
- `20260928000002_seed`: 16 categorías, 12 marcas, **20 productos CLP** (19 stock 1,
  1 stock 3), 40 imágenes, 2 colecciones, 10 tarifas, 2 cupones, 6 secciones home.

### Validación en Postgres 16 real (Docker, `supabase/tests/`)

**ALL DB TESTS PASSED** — 12 grupos: seed íntegro · aislamiento A/B (anti-IDOR) ·
anon no escribe catálogo · precios inmutables · PAID solo backend · guest con token ·
anti doble-venta · expiración revierte · pago idempotente + transiciones ·
cupones · analytics · trending. Ver `supabase/tests/README.md` para re-ejecutar.

### Bugs encontrados y corregidos durante la validación

- Columna GENERATED con `to_tsvector` → trigger clásico.
- FKs hacia tablas creadas después (`orders`, `shipping_rates`) → reorden.
- Policy con subquery sobre `orders` invisible a anon → helper SECURITY DEFINER.
- CTE `weighted` fuera de scope en 2º UPDATE → función en un solo statement.
- Tests: `RESET ALL` no revierte `SET ROLE` (se usa `RESET ROLE`); fixture T8 sin
  `order_items` (flujo real siempre los tiene).

### Tipos y docs

- `packages/types/src/db.ts`: espejo TS del schema (regenerar con
  `supabase gen types` cuando exista proyecto remoto).
- `docs/DATABASE.md` (modelo, funciones, storage, cron), `docs/SECURITY.md`
  (matriz RLS + garantías), `supabase/{seed,tests}/README.md`, sección Supabase en `README`.
- `typecheck` (raíz+mobile+admin) y `eslint --max-warnings 0` verdes.

### Decisiones tomadas

- `shipments` como tabla (carrier/tracking), no columnas en orders (tipos app hacen join).
- Guest sin SELECT tabular: solo RPC con token.
- Cupones legibles si activos; validación crítica solo en `validate_discount_code`.
- Bucket `product-images` público; placeholders PNG locales (40, generador sin deps).
- Sin pgvector todavía (camino documentado); sin `service_role` en cliente.

### Aplicación de skills (2026-10-02, orden AGENT_SKILLS.md)

- `supabase`: conformidad verificada (TO selectivo ya aplicado en hardening,
  EXECUTE revocado, DO de search_path cubre las 12 DEFINER); T13 añadido como
  guard de regresión (24/24) + stub `storage` en `setup_local.sql` (el suite
  efímero no corría las migraciones 20260929*).
- `api-security-review`: hallado BOLA en `confirm` (sin prueba de propiedad;
  en mock cualquiera marcaba PAID gratis y filtraba `guest_token`). Fix:
  dueño exige JWT, invitado exige `guest_token` timing-safe; `return_url`
  restringido a `shopy://|https://`; HMAC MP pasado a `timingSafeEqual`.
  `notify` auditado limpio. Smoke 16/16 con 4 checks BOLA nuevos.
- `pr-review`/`test-driven-development`: RED (smoke BOLA + T13) antes de cada
  fix; sin duplicación nueva; suites estables extendidas, no reemplazadas.
- `expo-data-fetching`: hooks conformes (retry 1, skeletons, `isPending`
  anti-doble-submit); backlog: estados offline-paused (`fetchStatus`) con
  NetInfo (requiere dev build, no Expo Go).
- `vercel-react-best-practices`: admin verificado (Promise.all, sin barrels);
  sin cambios.

### Pendiente (requiere proyecto Supabase remoto + tus credenciales)

- `supabase db push`, crear bucket `product-images` + subir placeholders,
  configurar crons (`release_expired_reservations` cada minuto,
  `refresh_trending_scores` cada 15 min), re-correr tests contra remoto.
