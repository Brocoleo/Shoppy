# AUDITORÍA TÉCNICA Y FUNCIONAL — Shoppy (vinta.zhe)

> **Fecha:** 2026-10-20 · **Alcance:** `/home/leandro/Documentos/ChatGPT/React Native/Shoppy`
> **Tipo:** diagnóstico de solo lectura. No se modificó código, no se instalaron dependencias,
> no se creó ningún commit ni despliegue y **no seCambió ningún dato remoto**.
> **Único archivo creado por esta auditoría:** `docs/AUDITORIA_OPENCODE.md`.
>
> Las rutas del informe son relativas a la raíz de Shoppy.
> **Nunca se reproduce ningún valor de secreto, token o dato personal.**

---

## 1. Resumen ejecutivo del estado real

### 1.1 Veredicto en una frase

Shoppy **compila, pasa sus pruebas y tiene el backend de operación esencialmente completo** (checkout con
idempotencia, reservas atómicas de prenda única, RLS en las 27 tablas, webhooks firmados, RMA, emails con
deduplicación). La revisión del 20-oct-2026 añadió **dos etapas de remediación ya aplicadas y verificadas**
(privilegios y aislamiento de cuentas), pero **NO está lista para una beta pública**: quedan **3 bloqueantes
de lanzamiento** (el sitio público está caído, las páginas legales tienen `[pendiente]`, y MercadoPago no
tiene webhook configurado) y **varios riesgos de dinero y de compra** pendientes, encabezados por el pago
tardío sin reembolso automático (A-06) y por la incapacidad del invitado para recuperar su pedido (A-04).

### 1.2 Bloqueantes de lanzamiento (arreglar antes de vender)

| # | Bloqueante | Evidencia |
|---|---|---|
| B-1 | **Sitio público caído.** `https://shopy-web-six.vercel.app` responde `503 DEPLOYMENT_PAUSED`. El proyecto Vercel `shopy-web` está pausado; `vercel project resume` exige confirmación interactiva (no automatizable). | `curl` a 5 rutas → todas 503; `vercel inspect` → *"This deployment couldn't be built because the project was paused"* |
| B-2 | **Páginas legales con `[pendiente]`.** `/legal/privacidad` no tiene razón social, RUT ni domicilio; `/devoluciones` no tiene el correo de contacto ni el plazo. | `apps/web/src/app/legal/privacidad/page.tsx:16-17`; `apps/web/src/app/devoluciones/page.tsx:71` |
| B-3 | **MercadoPago nunca notifica.** Sin `MERCADOPAGO_WEBHOOK_SECRET` configurado, la preferencia se crea sin `notification_url` y la firma nunca valida. La **única** vía de liquidación es el botón "Ya pagué" del cliente: si cierra la app tras pagar, el pedido queda `PENDING_PAYMENT` y la prenda se libera a los 15 min. | `supabase/functions/_shared/payment.ts:151,193`; `docs/mercadopago-sandbox-2026-10-17/VERIFICACION.md:19,88` |

### 1.3 Estado real por capa

| Capa | Estado | Comentario |
|---|---|---|
| Esquema / migraciones | 🟢 Sólido | 21 migraciones, **las 21 aplicadas en remoto** (`supabase migration list` no reporta ninguna pendiente). 27 tablas, **todas con RLS habilitado**. |
| Checkout backend | 🟢 Sólido | `create_checkout_order` es transaccional, la reserva es `SELECT … FOR UPDATE` (no hay race), la liquidación es idempotente, el cliente nunca manda precios. |
| Pagos | 🟡 Parcial | MP implementado y probado en sandbox; Webpay implementado pero **nunca validado E2E** y **atado al host sandbox** (no hay ruta live). |
| Emails | 🟢 Sólido | 4 adaptadores (mock/brevo/smtp2go/resend), deduplicación atómica por `claim_order_notification`, plantilla renderizada en servidor. Brevo verificado real. |
| App web | 🟡 Parcial | Catálogo, checkout, pedido, devoluciones y admin funcionan. Faltan favoritos, filtros de talla/condición/precio, y **fuga de caché entre cuentas**. |
| App móvil (Expo) | 🟡 Parcial | Auth, catálogo con filtros, favoritos, carrito aislado por cuenta, checkout con SecureStore. **Nunca se ha ejecutado en un dispositivo físico ni se ha generado APK/IPA firmado.** |
| Panel admin | 🟢 Sólido | Productos + fotos (con E2E Playwright verde), pedidos, envíos, descuentos, clientes, RMA, despacho. |
| Despliegue | 🔴 Caído | Vercel pausado. |

### 1.4 Cifras de la auditoría

- **38 hallazgos** registrados: **1 crítico, 7 altos, 8 medios y 22 bajos**. A esto se suman **3 bloqueantes de lanzamiento** (B-1…B-3) que son de configuración, no de código.
- **Verificaciones ejecutadas:** 15 comandos, todos registrados en §5.
- **Pruebas existentes:** 60 (`test:beta`) + 4 suites de checkout (~40 casos) + 12 E2E Playwright, **todas verdes**.
- **Cobertura:** 3 capas de tests (Node puro, mocks de checkout, E2E Playwright) + 4 suites SQL de RLS, **ahora ejecutables** (antes abortaban en T13).

### 1.5 Estado de remediación (actualizado tras la revisión del dueño)

La revisión del dueño del 20-oct-2026 reordenó las prioridades (primero seguridad, después reactivar la
tienda) y ajustó dos hallazgos. Este informe ya refleja esa evaluación:

| Hallazgo | Antes | Ahora | Estado |
|---|---|---|---|
| **A-01** escalada a admin | crítica | crítica | ✅ **RESUELTO** (Etapa 1) — migración `20261020000000` + T14/T15/T16 + sonda funcional en la BD real |
| **A-02** fuga entre cuentas en la web | alta | alta | ✅ **RESUELTO** (Etapa 2) — clave por usuario + purga al cambiar de cuenta + E2E de regresión |
| **A-05** liquidación sin pago verificado | alta (fix mal dirigido) | **alta** | ✅ **RESUELTO** (Etapa 1) — el fix correcto es de **permisos**, no "consultar siempre al proveedor" |
| **A-03** cancelación con pago en vuelo | alta (sobreventa) | 🟠 **media** — el informe original sobredimensionó el impacto (ver A-03) | ⏳ **Etapa 3**: primero reproducir la carrera, luego endurecer |

Detalle de los cambios aplicados y de su evidencia en **§5.2** y **§8**.

---

## 2. Mapa técnico y flujo de datos

### 2.1 Estructura del repositorio

```
Shoppy/                          ← raíz del proyecto (subdirectorio del repo Git)
├── apps/
│   ├── mobile/    Expo SDK 57 + expo-router · app/ (17 rutas) + src/ (26 módulos)
│   ├── admin/     Next.js 16.4.2 · panel (17 rutas) + tests/ (Playwright)
│   └── web/       Next.js 16.4.2 · sitio público (19 rutas) + lib/
├── packages/
│   ├── shared/    format.ts, constants.ts, editorial.ts, measurements.ts
│   ├── types/     db.ts (espejo del esquema Supabase)
│   └── validation/ chile.ts (reglas de dirección/tarifa), index.ts (Zod)
├── supabase/
│   ├── migrations/  20 archivos .sql (2 299 líneas) — ESQUEMA + RLS + seed + storage
│   ├── functions/   checkout, notify, producto-ia + _shared/ (9 módulos Deno)
│   ├── tests/       4 suites SQL + 4 suites Node + 3 smoke
│   └── seed/        scripts de carga
├── scripts/        test-beta, test-checkout, local-checkout/ (simulador de pago)
└── docs/           21 documentos (GO-LIVE, BETA, SECURITY, PAYMENTS, …)
```

**Responsabilidad por app:** `web` = tienda pública · `admin` = back-office · `mobile` = app del comprador.
**Responsabilidad por paquete:** `types` (contratos), `validation` (reglas de negocio puras), `shared` (formato CLP,
constantes, helpers de medidas). El backend vive **enteramente** en Supabase (Postgres + Edge Functions Deno).

### 2.2 Flujo de compra (el camino crítico)

```
Cliente (web/móvil)
  │
  ├─ POST /functions/v1/checkout  action=quote
  │     └─ computeQuote() → lee productos/tarifas/cupón DESDE LA BD  ← el cliente nunca manda precios
  │        (checkout/index.ts:128-257)
  │
  ├─ POST action=create   (idempotency_key + attempt_secret, persistidos ANTES en el dispositivo)
  │     ├─ INSERT checkout_attempts (PK = idempotency_key) → 23505 ⇒ recoverAttempt()  ← 1 pedido por clave
  │     ├─ RPC create_checkout_order()  ── transacción única:
  │     │     ├─ SELECT products … FOR UPDATE   (init_schema.sql:280)  ← reserva atómica
  │     │     ├─ UPDATE products SET stock=stock-qty, availability='RESERVED'
  │     │     └─ INSERT product_reservations (expires_at = now()+15min)
  │     ├─ INSERT payments (idempotency_key UNIQUE, provider_payment_id UNIQUE)
  │     └─ createPayment() → preferencia MercadoPago  ← NO lleva X-Idempotency-Key (A-11)
  │
  ├─ Usuario paga en el proveedor
  │     │
  │     ├─ Camino A: webhook MP  → verifyMercadoPagoSignature (HMAC-SHA256, timing-safe)
  │     │                          → GET /v1/payments/{id} → convergePaid()
  │     ├─ Camino B: retorno    → checkout-return → action=confirm → verifyPayment() → convergePaid()
  │     └─ Camino C: manual     → payments.status='approved' (sin verificar con el proveedor) ← A-05
  │
  └─ convergePaid() → settle_checkout_payment()  (idempotente, FOR UPDATE)
        ├─ mark_order_paid()  → status='PAID', products → 'SOLD'
        └─ sendOrderEmail('payment_confirmed') → claim_order_notification()  ← dedup atómico
```

### 2.3 Flujo de datos del carrito

```
web  : localStorage["shopy-cart-<owner>"]        owner = user.id | "guest"
       fusión invitado→cuenta con Math.max  (idempotente)   apps/web/src/lib/cart.tsx:30,49,62-81
móvil: Zustand, scope por owner + revision counter + merge.id
       fusión con SUMA                            apps/mobile/src/stores/useShopStore.ts:60-95
servidor: RPC sync_my_cart(jsonb, merge_id) con cart_merges (ON CONFLICT DO NOTHING) → idempotente
```

### 2.4 Mapa de seguridad (RLS + DEFINER)

| Capa | Estado verificado en BD remota |
|---|---|
| Tablas | **27/27 con `ENABLE ROW LEVEL SECURITY`** (consulta directa a `pg_class.relrowsecurity`) |
| Tablas sin políticas | 1: `cart_merges` → *deny-all* intencional (solo `service_role`) |
| Funciones `SECURITY DEFINER` | 27 en `public`. Las que devuelven datos de negocio filtran por `auth.uid()` o por credencial. `mark_order_paid` y `record_order_history` conservan `EXECUTE` para `PUBLIC`. |
| `search_path` | Todas las DEFINER lo fijan (`public, pg_temp` o `''`). Ninguna sin fijar. |
| Storage | 1 bucket `product-images`, **público**, escritura solo `is_admin()`, `file_size_limit` 5 MB, MIME `jpeg/png/webp`. |
| Crons | 2 activos: `release_expired_reservations` (cada minuto) y `refresh_trending_scores` (cada 15 min). |
| Secretos en cliente | **Ninguno.** `apps/mobile` solo usa `EXPO_PUBLIC_*`; `apps/web`/`apps/admin` solo `NEXT_PUBLIC_*` en cliente y `SUPABASE_SECRET_KEY` únicamente en Route Handlers. |
| `.env` versionados | **Ninguno.** Solo `.env.example` y `.env.production.example` (plantillas sin valores). |

---

## 3. Matriz de funcionalidades

Leyenda: ✅ implementado · 🟡 parcial · ❌ ausente · ❓ no verificable en este entorno.

### 3.1 Comprador invitado (guest)

| Recorrido | Estado | Evidencia de código | Prueba automática | Comprobación real de UI |
|---|---|---|---|---|
| Registro | ✅ | `apps/web/src/app/login/page.tsx:11,38` (`mode` in/up); `apps/mobile/src/auth/AuthContext.tsx:151` | — | ❌ (web caída) |
| Inicio de sesión | ✅ | `apps/web/src/lib/session.tsx:76-84`; `AuthContext.tsx:147` | — | ❌ |
| Cierre de sesión | 🟡 | web: `session.tsx:87-94` **no limpia caché** → **A-02**; móvil: sí (`AuthContext.tsx:73-81`) | — | ❌ |
| Cambio de cuenta | 🟡 | móvil OK (`AuthContext.tsx:89-95`); web **no** | `apps/mobile/tests/state.test.mjs:40-52` | ❌ |
| Catálogo / búsqueda | ✅ | `apps/web/src/lib/catalog.ts:187-272`; `apps/mobile/src/data/catalog.ts` | `catalogProduct.test.ts` | ❌ |
| Filtros | 🟡 | web: solo categoría/marca/orden (`useCatalogFilters.ts:57-77`); la capa de datos sí soporta talla/condición/precio (`catalog.ts:217-220`) pero **no hay control en la UI**. Móvil: sí expone condición y talla (`app/(tabs)/buscar.tsx:35-36,101-108`) | — | ❌ |
| Detalle de producto | ✅ | `apps/web/src/app/producto/[slug]/ProductDetail.tsx`; incluye medidas + composición | `catalogProduct.test.ts` | ❌ |
| Fotografías | ✅ | galería en web y móvil; `apps/admin/src/lib/prepareImage.ts` recorta 4:5 → WebP | **E2E Playwright 11/11** | ❌ (web caída) |
| Favoritos | 🟡 | móvil ✅ (`src/data/favorites.ts`); **web ❌ ausente** (`grep favorites` en `apps/web/src` → 0) | `state.test.mjs` (móvil) | ❌ |
| Carrito | ✅ | aislamiento por `owner` en ambas apps | `cartStore.test.ts`, `state.test.mjs` | ❌ |
| Dirección / región | ✅ | `packages/validation/src/chile.ts`; selector en checkout | `checkout_rules.test.mjs` | ❌ |
| Envío / descuentos | ✅ | `shipping_rates` (10 filas en remoto), umbral de envío gratis, cupones | `checkout_api.test.mjs` | ❌ |
| Cotización | ✅ | `action=quote` recalcula desde BD | `checkout_api.test.mjs` | ❌ |
| Creación de pedido | ✅ | idempotencia con clave persistida **antes** de la red | `checkout_api.test.mjs:6-13` | ❌ |
| Recuperación del pedido | ❌ | el `guest_token` se borra al pagar (`pendingCheckout.ts:53-59`) y el UUID nunca se muestra ni se envía por correo → **A-04** | — | ❌ |
| Selección de proveedor | ✅ | mock / mercadopago / transbank (`_shared/payment.ts:225-346`) | `payment_provider.test.mjs` (17) | ❌ |
| Inicio de pago | 🟡 | MP ✅; **Webpay atado al host sandbox** → **A-07** | `payment_provider.test.mjs` | ❌ |
| Retorno y verificación | ✅ | `checkout-return/page.tsx:46`; `handleConfirm` con `verifyPayment` | `checkout_api.test.mjs` | ❌ |
| Pago tardío | 🟡 | detectado → `REFUND_REQUIRED`, pero **sin reembolso automático ni email** → **A-06** | `beta_tests.sql` | ❌ (constatado en prod: `VERIFICACION.md:81`) |
| Seguimiento del pedido | ✅ | `/pedido/[id]?token=` + RPC `get_guest_order` | `rls_tests.sql` T5 | ❌ |
| Historial de pedidos (invitado) | ❌ | solo un formulario que pide UUID + token (`pedido/[id]/page.tsx:44-68`); el invitado no conoce el UUID → **A-04** | — | ❌ |
| Cancelación / reembolso | ✅ | RMA: `request_return` (10 días) → aprobación admin → `finish_checkout_refund` | `rls_tests.sql`, `beta_tests.sql` | ❌ |
| Notificaciones | 🟡 | 7 eventos con dedup atómico; **no hay evento para solicitud/rechazo de devolución** → **A-13**; email no incluye `order_id` → **A-04** | `notify_test.ts` | ❌ (Brevo real ✅) |

### 3.2 Comprador registrado

| Recorrido | Estado | Nota |
|---|---|---|
| Registro / login / logout | ✅ | `signUp` con trigger `handle_new_user` que crea el perfil |
| Cambio de cuenta | 🟡 | móvil ✅ / web ❌ (A-02) |
| Carrito por cuenta | ✅ | `shopy-cart-<uuid>` + `sync_my_cart` |
| Favoritos | ✅ móvil / ❌ web | — |
| Dirección guardada | ✅ | tabla `addresses` (3 filas en remoto); **el checkout móvil borra lo tecleado** si la respuesta llega tarde → **A-10** |
| Mis pedidos | ✅ | `listMyOrders`; caché sin `user id` en web → **A-02** |
| Pedido y tracking | ✅ | `/pedido/[id]`, `shipments`, `order_status_history` |
| Solicitar devolución | ✅ | ventana 10 días, 1 solicitud abierta por pedido |

### 3.3 Administrador

| Recorrido | Estado | Nota |
|---|---|---|
| Login + verificación de rol | ✅ | `profiles.role='admin'` comprobado en servidor (`login/page.tsx`) |
| Alta/edición de producto | ✅ | `ProductForm.tsx` + IA (Gemini) + medidas/material en `metadata` JSONB |
| Fotos: subir, portada, defecto, orden, eliminar | ✅ | **E2E Playwright 11/11 verde** (incluye drag & drop, target ≥44 px, `capture="environment"`) |
| Inventario / stock | ✅ | `stock`, `availability`, archivar, trigger `guardar_prenda_unica` |
| Pedidos (listado + detalle) | ✅ | filtros por estado y `mode`; **no destaca `refund_state='review'`** → **A-14** |
| Despacho / tracking | ✅ | `shipments` + email `order_shipped` |
| Reembolso | 🟡 | botón manual; **falla en `PREPARING`/`SHIPPED`** → **A-12** |
| Envíos (tarifas + umbral gratis) | ✅ | CRUD completo, 10 filas en remoto — **faltan precios reales** (dato, no código) |
| Descuentos | ✅ | CRUD con límite de usos |
| Clientes | ✅ | perfiles + conteo de pedidos |
| RMA: aprobar/rechazar | ✅ | `return_requests` |

---

## 4. Hallazgos priorizados

> **Estado** = `confirmado` (leído/verificado en código o en la BD remota) · `probable` (altamente sustentado pero sin
> ejecución) · `pendiente de verificación` (requiere un entorno que no se usó aquí).
> **Severidad** impacto en pérdida de datos, acceso indebido, cobro incorrecto, sobreventa o bloqueo de compra.

---

### A-01 · Escalada de privilegios a `admin` por `DELETE` + `INSERT` sobre `public.profiles`
**Severidad:** 🔴 crítica · **Estado:** ✅ **RESUELTO** (Etapa 1, 20-oct-2026) · **Antes:** confirmado (verificado contra la BD remota)

> **Resuelto.** La policy única `FOR ALL` se dividió en cuatro policies explícitas
> (`SELECT` / `UPDATE` / `INSERT` con `role = 'customer'` / `DELETE`), y se añadió
> `profiles_admin_update` (que además **arregla un bug**: el toggle "Hacer admin"
> del panel actualizaba 0 filas en silencio, ver **A-39**). Migración
> `supabase/migrations/20261020000000_security_profiles_payments.sql`, aplicada en
> la BD remota y verificada con la sonda `supabase/tests/security_probe.mjs`
> (**10/10 casos OK**, ver §5.2).
>
> **Decisión de diseño:** se mantiene el `DELETE` de la propia fila (derecho de
> supresión de datos). La escalada queda cerrada igual porque el `INSERT`
> posterior exige `role = 'customer'`; no hace falta cerrar el `DELETE`.
>
> **Tests:** `supabase/tests/rls_tests.sql` T14 (escalada `DELETE`+`INSERT`),
> T15a/T15b (nadie escribe `payments`), T16 (`mark_order_paid` solo backend).
> Verificados en rojo con el código anterior y en verde con el nuevo (§5.2).

**Archivos:** `supabase/migrations/20260928000001_rls_policies.sql:75-76` · `supabase/migrations/20260929000004_hardening.sql:42-57` · `supabase/migrations/20260928000000_init_schema.sql:71-79,99-111`

**Evidencia.** La policy es `FOR ALL`, y `FOR ALL` incluye `INSERT` y `DELETE`:
```sql
create policy profiles_owner_rw on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());
```
`WITH CHECK` solo valida `id = auth.uid()`; **no valida `role`**. El trigger que protege el rol es **solo `BEFORE UPDATE`**:
```sql
create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function public.guard_profile_role();
```
Verificado en remoto (`pg_policies` + `pg_trigger`): no existe ningún trigger `BEFORE INSERT` ni `BEFORE DELETE` sobre `profiles`. El `CHECK` de la columna solo exige `role in ('customer','admin')` → `'admin'` lo satisface. Y `is_admin()` es:
```sql
select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
```

**Escenario.** Cliente se registra → `DELETE FROM public.profiles WHERE id = auth.uid()` (permitido por `USING`) → `INSERT INTO public.profiles (id,email,role) VALUES (auth.uid(), 'x@y.cl','admin')` (permitido por `WITH CHECK`) → `is_admin()` = `true`. *Restricción parcial:* si el usuario ya tiene pedidos, el `DELETE` falla por `ON DELETE SET NULL` sobre `orders.user_id` + el `CHECK` `(user_id is not null or guest_token is not null)`. **Un usuario recién registrado escala sin fricción.** (También pierde `addresses`/`favorites`/`carts` por `ON DELETE CASCADE`.)

**Impacto.** Control total del catálogo, de **todos** los pedidos y datos personales de clientes, escritura en el bucket `product-images`, y capacidad de **marcar pedidos como pagados sin cobrar** (vía `mark_order_paid`, que acepta `is_admin()`).

**Corrección mínima (no implementada).** Dividir la policy: `for select` / `for update using (id = auth.uid())` / `for delete using (false)` / `for insert with check (id = auth.uid() and role = 'customer')`; más `revoke delete on public.profiles from authenticated;`. Alternativa: trigger `BEFORE INSERT OR DELETE` que rechace `role <> 'customer'` y el `DELETE` propio.

**Prueba que lo demostraría.** Extender `supabase/tests/rls_tests.sql` (hoy T12a solo prueba el `UPDATE` de `role`) con un caso T14: `DELETE`+`INSERT` con `role='admin'` debe devolver `FORBIDDEN`.

---

### A-02 · La web no purga la caché de React Query al cerrar sesión → fuga de pedidos entre cuentas
**Severidad:** 🔴 alta (acceso indebido a datos privados) · **Estado:** ✅ **RESUELTO** (Etapa 2, 20-oct-2026)

> **Resuelto con dos barreras.**
> 1. **Separación por usuario**: las claves privadas incluyen el identificador de
>    la cuenta (`["my-orders", userId]`, `["order-detail", id, userId]`,
>    `["quote", owner, sig]`), de modo que la caché de una cuenta **nunca** puede
>    servirse a otra.
> 2. **Purga al cambiar de cuenta**: `apps/web/src/lib/privateData.ts` +
>    `apps/web/src/lib/session.tsx` cancelan las consultas privadas en vuelo y
>    borran la caché de la cuenta **anterior** (no de la actual: purgar en la
>    primera carga cancelaba la consulta en vuelo de la página activa y la
>    dejaba colgada en "Cargando…", un error que el E2E detectó).
>
> **Test de regresión:** `apps/admin/tests/web-account-isolation.spec.ts` — dos
> cuentas reales en el mismo navegador; la segunda **no** puede ver los pedidos
> de la primera, y la primera los sigue viendo al volver a entrar. Verificado
> **en rojo con el código anterior** (la cuenta B veía el pedido de A) y **en
> verde con el nuevo** (§5.2).
>
> **Lección de método (aplicable a future E2E):** el test navega con clics en
> enlaces de Next.js, no con `page.goto()`. Un `goto()` recarga el documento y
> borra la caché en memoria, con lo que la fuga no es observable y el test da
> verde siempre.

**Archivos:** `apps/web/src/lib/session.tsx:87-94` · `apps/web/src/lib/query.tsx:6-16` · `apps/web/src/app/pedidos/page.tsx:12-15` · `apps/web/src/app/pedido/[id]/page.tsx:30-34`

**Evidencia.** `signOut` de la web solo borra la sesión de Supabase; **no toca el `QueryClient`**:
```ts
const signOut = useCallback(async () => {
  try { await (await clientForAuth()).auth.signOut(); } catch { }
  setSession(null);
}, [clientForAuth]);
```
`grep` de `removeQueries|queryClient.clear|resetQueries` en `apps/web/src` → **0 coincidencias** (solo hay dos `invalidateQueries`). Y las claves privadas **no incluyen el usuario**:
```ts
queryKey: ["my-orders"]                 // app/pedidos/page.tsx:14
queryKey: ["order-detail", id]           // app/pedido/[id]/page.tsx:31
```
Con `staleTime: 60_000` y `refetchOnWindowFocus: false` (`query.tsx:11`), React Query **no vuelve a pedir** los datos al re-montar si la caché está fresca.

**Contraste:** el móvil sí lo hace bien — `apps/mobile/src/auth/AuthContext.tsx:73-81` hace `removeQueries` de `favorites`/`my-orders`/`my-order`/`guest-order`/`quote`/`my-address` en `SIGNED_OUT`/`TOKEN_EXPIRED`/`USER_DELETED`, y `:89-95` lo repite en cada cambio de `session.user.id`; además incluye el `user id` en la clave.

**Escenario.** Cuenta A entra a `/pedidos` → se cachea `["my-orders"]`. A cierra sesión. Cuenta B entra en la misma pestaña antes de 60 s → ve **la lista de pedidos de A**. Si B conoce un UUID de A, `/pedido/<uuid>` muestra ítems, tracking, historial y solicitudes de devolución de A.

**Impacto.** Fuga de datos privados entre cuentas del mismo dispositivo. El RLS del servidor es correcto; el defecto es 100 % cliente.

**Corrección mínima (no implementada).** Exportar el `QueryClient` desde `lib/query.tsx` y llamar `queryClient.removeQueries({queryKey:["my-orders"]})` (y `["order-detail"]`, `["my-address"]`) dentro de `signOut`; y/o incluir `user.id` en las `queryKey`.

**Prueba que lo demostraría.** Test Playwright: login A → `/pedidos` → logout → login B → `/pedidos` debe mostrar 0 pedidos de A. (Hoy no existe ningún test de este flujo en la web.)

---

### A-03 · El cliente puede cancelar su pedido mientras el pago está en vuelo
**Severidad:** 🟠 **media** (reclasificada) · **Estado:** policy confirmada; **la carrera completa está sin probar** · ⏳ Etapa 3

> **Reclasificado tras la revisión del dueño (20-oct-2026).** El informe original
> lo graduó como "sobreventa" y eso **sobreestimaba el impacto**: el propio código
> muestra que `settle_checkout_payment` **se niega** a liquidar cuando el pedido
> ya no está en `PENDING_PAYMENT` o la reserva venció, y devuelve
> `REFUND_REQUIRED` (`supabase/migrations/20261017233000_checkout_sandbox_prerequisites.sql:89-93`).
> Por tanto **no se producen dos pedidos confirmados sobre la misma prenda**:
> el segundo comprador recibe la prenda y el primero queda con el dinero cobrado
> y **sin contraparte**, pendiente de un reembolso **manual** (que conecta con
> **A-06**).
>
> Lo que **sí** queda por demostrar es la **carrera completa** (p. ej. el webhook
> del proveedor llegando *durante* el `UPDATE` de cancelación, entre el `USING` y
> el `WITH CHECK` de la policy). Por eso la Etapa 3 **no** endurece nada de
> entrada: primero se reproduce la carrera en Postgres aislado y solo después se
> endurece la policy.

**Archivos:** `supabase/migrations/20260928000001_rls_policies.sql:119-121` · `supabase/migrations/20261017233000_checkout_sandbox_prerequisites.sql:103-116` · `supabase/migrations/20260928000000_init_schema.sql:425-431`

**Evidencia (policy en remoto, textual):**
```sql
orders_owner_cancel | UPDATE
  qual      = ((user_id = auth.uid()) AND (status = 'PENDING_PAYMENT'))
  with_check= ((user_id = auth.uid()) AND (status = 'CANCELLED'))
```
El trigger `release_cancelled_order` (SECURITY DEFINER) devuelve el stock a `AVAILABLE` y marca la reserva `released` **de inmediato**.

**Escenario.** Cliente A inicia checkout de una prenda única (`stock=1`) → reserva 15 min, `stock=0`, `RESERVED`. A cancela desde el cliente → stock vuelve a 1, `AVAILABLE`. Cliente B compra la misma prenda y paga. El pago de A se aprueba después → `settle_checkout_payment` marca `payments.status='approved'` con `incident='RESERVATION_EXPIRED…'` y devuelve `REFUND_REQUIRED`.

**Impacto (reclasificado).** **No hay sobreventa**: la prenda la lleva el segundo comprador y `settle_checkout_payment` rechaza liquidar el pedido del primero. El daño real es **dinero cobrado sin contraparte** (el pedido del cliente A queda `CANCELLED` con un pago `approved` y `incident='RESERVATION_EXPIRED…'`), **sin reembolso automático y sin aviso al cliente** (ver **A-06**): el dinero queda colgado hasta que un operador lo reembolse a mano. A esto se suma que un cliente puede "liberar" stock repetidamente para bloquear la venta a terceros.

**Corrección mínima (no implementada; Etapa 3).** Restringir `orders_owner_cancel` para que solo permita cancelar si no existe un pago en estado `pending`/`approved`, o bloquear `PENDING_PAYMENT → CANCELLED` cuando exista un pago vivo (trigger `BEFORE UPDATE OF status` en `orders`). **Antes de escribirla:** reproducir la carrera completa y medir si el webhook puede llegar entre el `USING` y el `WITH CHECK`.

**Prueba que lo demostraría (P-4, Etapa 3).** Test SQL con dos conexiones concurrentes: (a) cliente con pago `pending` intenta cancelar → el stock **no** debe volver a 1 y la reserva debe seguir `active`; (b) el webhook llega mientras se cancela → el pedido no debe quedar `PAID` ni `SOLD`.

---

### A-04 · El invitado no puede recuperar ni seguir su pedido tras cerrar la app
**Severidad:** 🔴 alta (bloqueo de compra y de derechos del consumidor) · **Estado:** confirmado

**Archivos:** `apps/web/src/lib/pendingCheckout.ts:41,53-59` · `apps/web/src/app/checkout/page.tsx:184-197,582-588` · `apps/mobile/src/lib/pendingCheckout.ts:42-46` · `supabase/functions/_shared/email.ts:83-86,110` · `supabase/migrations/20261019150000_guest_order_tracking.sql:9-37`

**Evidencia.** Tres hechos encadenados:
1. Al completar el pago se borra el blob que contenía el `guest_token`: `await clearPendingCheckout(owner)` → `localStorage.removeItem("shopy-checkout-guest")` / `SecureStore.deleteItemAsync`. **No queda ninguna lista de pedidos de invitado en el dispositivo** (en la web solo existen 3 claves en `localStorage`: carrito, checkout pendiente y cookies).
2. La pantalla de éxito muestra `order_number` (`SHO-XXXXXXXX`) y el token, **nunca el `order_id`** (UUID). El RPC `get_guest_order` solo acepta `p_order_id uuid` — no hay lookup por `order_number`.
3. El correo `order_created` incluye `order_number` y `guest_token`, **nunca el `order_id`** (`email.ts:83-86,110`).

**Escenario.** Invitado compra → ve `SHO-A1B2C3D4` y un token → cierra la app → vuelve a `/pedidos` → el formulario **rechaza** el `order_number` ("El identificador debe ser un uuid válido") → si inventa un UUID, `get_guest_order` responde `ORDER_NOT_FOUND`.

**Impacto.** El invitado **no puede ver su pedido, ni el tracking, ni solicitar la devolución** (la UI de devolución vive en `/pedido/[id]`, que es inaccesible sin el UUID). Esto afecta directamente el derecho de retracto de la Ley 19.496.

**Corrección mínima (no implementada).** Persistir una lista local `shopy-guest-orders` (`{order_id, order_number, guest_token, created_at}`) que **no** se borre al completar, **y/o** incluir el `order_id` en la pantalla de éxito y en el correo.

**Prueba que lo demostraría.** E2E Playwright: comprar como invitado → cerrar el contexto → volver a `/pedidos` → el pedido debe ser recuperable sin copiar nada a mano.

---

### A-05 · La liquidación de pedidos podía ser fabricada desde una sesión administrativa
**Severidad:** 🔴 alta (pérdida de dinero) · **Estado:** ✅ **RESUELTO** (Etapa 1, 20-oct-2026)

> **Reencuadrado tras la revisión del dueño.** El título original ("`confirm`
> liquida el pedido sin verificar con el proveedor") señalaba el síntoma y no la
> causa. Reutilizar una aprobación **ya verificada** es correcto; lo que no debe
> existir es la **posibilidad de fabricar esa aprobación** o de **invocar la
> liquidación directamente** desde una sesión de cliente o de administrador. El
> arreglo es de **permisos**, y así se aplicó.

**Archivos:** `supabase/functions/checkout/index.ts:418` · `supabase/migrations/20260928000001_rls_policies.sql:36,39,142-143` · `supabase/migrations/20260928000000_init_schema.sql:456-486`

**Evidencia.** El atajo de `handleConfirm` (`:418`) es legítimo **siempre que el
estado `approved` solo lo pueda escribir el backend**. Lo que faltaba era:
```sql
create policy payments_admin_all on public.payments
  for all using (public.is_admin()) with check (public.is_admin());
-- + grant select, insert, update, delete on all tables in schema public to authenticated
```
→ un admin (o un admin auto-proclamado, ver **A-01**) podía ejecutar
`UPDATE payments SET status='approved'` → el siguiente `confirm` de cualquier
cliente liquidaba el pedido **sin que exista cobro**.

Además `mark_order_paid` (`init_schema.sql:456-460`) admitía
`auth.role()='service_role' or public.is_admin()` y **nunca fue revocado** para
`anon`/`authenticated` (el revoke de `hardening.sql:76-89` cubre 5 funciones, no
esta; el comentario en `:92` la deja explícitamente abierta):
```sql
if not (auth.role() = 'service_role' or public.is_admin()) then
  raise exception 'FORBIDDEN: only backend can mark orders as paid';
```

**Escenario.** Admin marca `payments.status='approved'` (o llama `supabase.rpc('mark_order_paid', {p_order_id})` con su sesión) → pedido pasa a `PAID`, la prenda a `SOLD`, **sin dinero cobrado**.

**Impacto.** Cobro incorrecto / pérdida de dinero; un pedido puede "venderse" sin pago.

**Corrección mínima — reorientada tras la revisión del dueño (20-oct-2026) y APLICADA (Etapa 1).**
El atajo de `handleConfirm` **no es el defecto**: reutilizar una aprobación ya
verified es un diseño legítimo (idempotencia de segunda vía). El defecto son los
**permisos que permiten fabricar esa aprobación o liquidar sin ella**:
- `payments`: `payments_admin_all` era `FOR ALL` y `authenticated` tenía
  `UPDATE` sobre todas las tablas → un admin (o un admin auto-proclamado) ponía
  `status='approved'` a mano. **Aplicado:** la policy pasa a ser de solo lectura
  (`payments_admin_select`) y `INSERT/UPDATE/DELETE` sobre `payments` quedan
  revocados para `anon` y `authenticated`; solo `service_role` escribe.
- `mark_order_paid`: seguía con `EXECUTE` para `anon`/`authenticated` y su guard
  interno acepta `is_admin()` → liquidación directa de pedidos. **Aplicado:**
  `revoke execute … from public, anon, authenticated` + `grant … to service_role`.
  La llamada interna desde `settle_checkout_payment` (SECURITY DEFINER) sigue
  funcionando porque se ejecuta con el propietario de la función.

> "Consultar siempre al proveedor" **no** era el arreglo: habría roto la
> idempotencia de la segunda vía sin cerrar el vector real.

**Prueba que lo demostraría.** `supabase/tests/rls_tests.sql` **T15a** (cliente no
escribe `payments`), **T15b** (el admin tampoco) y **T16** (`mark_order_paid` solo
`service_role`); más la sonda `supabase/tests/security_probe.mjs` contra la BD
real (9 casos). Verificados en rojo antes del fix y en verde después (§5.2).

---

### A-06 · El pago tardío deja el dinero cobrado sin reembolso automático ni aviso al cliente
**Severidad:** 🔴 alta (pérdida de dinero + sobreventa silenciosa) · **Estado:** confirmado (constatado en producción)

**Archivos:** `supabase/migrations/20261017233000_checkout_sandbox_prerequisites.sql:89-93` · `supabase/functions/checkout/index.ts:354,356` · `docs/mercadopago-sandbox-2026-10-17/VERIFICACION.md:81`

**Evidencia.**
```sql
update public.payments set status='approved',
       incident='RESERVATION_EXPIRED: pago aprobado; requiere reembolso' where id=p_payment;
return 'REFUND_REQUIRED';
```
y en `convergePaid`, el `return` en `:354` ocurre **antes** de `sendOrderEmail(...)` en `:356` → **no se envía ningún correo**.

**Constatado en producción** (`VERIFICACION.md:81`): *"Supabase payments.status=approved, amount_clp=15980, incident=RESERVATION_EXPIRED, **refund_state=null** … No se ejecutaron reembolsos"*.

**Escenario.** Cliente paga en MP y cierra la app → pasan 15 min → el cron libera la prenda → otro comprador la compra → el cliente pulsa "Ya pagué" → `REFUND_REQUIRED`, sin reembolso y sin email.

**Impacto.** Dinero cobrado sin contraparte; sobreventa; el cliente no se entera salvo que abra la app.

**Corrección mínima (no implementada).** En `convergePaid`, cuando `outcome === 'REFUND_REQUIRED'`, encolar/disparar el reembolso (reusando `handleRefund`, ya idempotente por `refund_state IS NULL`) y enviar un email al cliente (`order_refunded` o un evento nuevo `payment_refund_pending`).

**Prueba que lo demostraría.** E2E sandbox: pagar → simular expiración de la reserva → verificar `refund_state='done'` y email recibido, sin intervención manual.

---

### A-07 · Webpay está atado al host sandbox: no existe ruta live, y nunca se validó end-to-end
**Severidad:** 🔴 alta (bloqueo de compra) · **Estado:** confirmado (código) / pendiente de verificación (E2E nunca ejecutado)

**Archivos:** `apps/web/src/app/api/payments/start/route.ts:8` · `apps/admin/src/app/api/payments/start/route.ts` (idéntico) · `supabase/functions/_shared/payment.ts:258-346` · `docs/PAYMENTS.md:46`

**Evidencia.**
```ts
if (url.origin !== "https://webpay3gint.transbank.cl") throw new Error("Solo Webpay sandbox está habilitado");
```
Ningún flag permite cambiarlo; el host live (`webpay3g.transbank.cl`) es rechazado aunque la integración lo soporte (`payment.ts:293-346` usa `TRANSBANK_ENVIRONMENT`).

**Además:** no existe evidencia en `docs/` de un pago Webpay real (solo hay documentos de MercadoPago). Todo el flujo Webpay (`bridge POST` → `token_ws` → commit en `confirm`) está **sin probar**.

**Riesgo asociado:** `docs/PAYMENTS.md:46` dice *"Token vive 5 min"*, pero la reserva dura **15 min**. Si el usuario tarda >5 min en la página de Webpay, el commit falla (`tbkFetch` lanza) y la compra se pierde aunque haya pagado.

**Impacto.** Bloqueo de compra en producción con Webpay; primer uso real sin red de seguridad.

**Corrección mínima (no implementada).** Parametrizar el host por `TRANSBANK_ENVIRONMENT`/`PAYMENT_MODE` en el bridge; añadir un timeout/mensaje claro antes de los 5 min; ejecutar el flujo Webpay sandbox completo (aprobado, rechazado, cancelación, expiración y reembolso) antes de anunciarlo.

---

### A-08 · Sin `MERCADOPAGO_WEBHOOK_SECRET`, MercadoPago nunca notifica
**Severidad:** 🔴 alta (pérdida de dinero) · **Estado:** confirmado

**Archivos:** `supabase/functions/_shared/payment.ts:151,193` · `docs/mercadopago-sandbox-2026-10-17/VERIFICACION.md:19,88`

**Evidencia.** Sin secreto, `verifyMercadoPagoSignature` devuelve `false` siempre (`:151`) → 401; y la preferencia se crea **sin `notification_url`**:
```ts
notification_url: webhookSecret ? input.webhookUrl : undefined,
```
→ MercadoPago nunca notifica. La firma HMAC-SHA256 (manifest oficial `id:…;request-id:…;ts:…;`) **sí está bien implementada** (`:139-164`, comparación timing-safe) y el webhook **sí** re-consulta `/v1/payments/{id}` validando `external_reference`, `payment.id === dataId` y entorno (`:248-253`) — pero **nunca ha recibido una notificación real**.

**Impacto.** El único camino de liquidación es el `confirm` del cliente. Si cierra la app tras pagar → pedido `PENDING_PAYMENT` + pago `pending` en MP + prenda liberada a los 15 min → **el cliente pagó y no tiene pedido**.

**Corrección mínima (no implementada).** Configurar `MERCADOPAGO_WEBHOOK_SECRET` como secret de la Edge Function y registrar `notification_url = <FUNCTIONS_PUBLIC_URL>/functions/v1/checkout`; después verificar con una firma real (ya está en la matriz de `docs/BETA.md`).

**Prueba que lo demostraría.** Un POST firmado (HMAC con `x-signature`, `x-request-id`, `x-request-id`) a la Edge Function debe liquidar el pedido, y uno con firma inválida debe devolver 401.

---

### A-09 · El precio puede cambiar entre la cotización y el cobro sin que el cliente lo sepa
**Severidad:** 🟠 media (cobro incorrecto) · **Estado:** confirmado

**Archivos:** `apps/web/src/app/checkout/page.tsx:452-456,574` vs `:225` · `apps/mobile/app/checkout.tsx:387,471` · `supabase/functions/checkout/index.ts:319,245-247`

**Evidencia.** `handleCreate` vuelve a cotizar (`checkout/index.ts:319`) y cobra el **nuevo** total. El cliente **nunca compara** `quote.total_clp` con `created.total_clp`: el botón muestra `quote.data?.total_clp` y la respuesta del `create` trae su propio `total_clp` que se ignora.

**Escenario.** El admin cambia el precio entre la pantalla de revisión y el clic en "Pagar", o el usuario deja la pantalla abierta 10 min con un quote cacheado → **se cobra un monto distinto del mostrado**, sin consentimiento explícito.

**Impacto.** Cobro incorrecto; en Chile puede constituir un precio engañoso (práctica abusiva). Además el backend no valida `total_clp > 0` (ver A-15): con un cupón del 100 % + envío gratis el total queda en 0 y se crearía un pedido y un pago de 0 CLP.

**Corrección mínima (no implementada).** Enviar el total cotizado como `expected_total_clp` en el `create` y rechazar con 409 `PRICE_CHANGED` si difiere, mostrando el nuevo total para aceptación explícita; y validar `total_clp > 0` en `computeQuote`.

---

### A-10 · El checkout móvil puede quedar bloqueado permanentemente
**Severidad:** 🟠 media (bloqueo de compra) · **Estado:** confirmado

**Archivos:** `apps/mobile/src/lib/pendingCheckout.ts:23-31` · `apps/mobile/app/checkout.tsx:80,172-176,457,464-473`

**Evidencia.** `loadPendingCheckout` no protege el `JSON.parse`:
```ts
const secret = JSON.parse(stored) as {…};                       // sin try/catch
const details = raw ? JSON.parse(raw) as PendingCheckout : null; // sin try/catch
if (details?.key !== secret.key) return { key: secret.key, secret: secret.secret };  // ← SIN `input`
```
- Si el valor almacenado está corrupto → la promesa rechaza → `setRestoreError(true)` → pantalla *"No se pudo recuperar el pedido"* y el botón "Reintentar" relee el mismo valor → **bloqueo permanente**. La web sí lo protege con `try/catch` (`apps/web/src/lib/pendingCheckout.ts:29-37`).
- Si `details.key !== secret.key` (escritura parcial: `secretWrite` en SecureStore tuvo éxito pero el `AsyncStorage.setItem` en `:35` no) → se devuelve un intento **sin `input`** → en `checkout.tsx:172-176` el `ATTEMPT_NOT_FOUND` se relanza → "Pagar" y "Cerrar intento rechazado" fallan siempre, sin limpiar el estado.

**Impacto.** El usuario no puede comprar y no puede desbloquear el checkout; la única salida es borrar los datos de la app.

**Corrección mínima (no implementada).** Envolver los dos `JSON.parse` en `try/catch` (borrando el estado corrupto); si el intento no trae `input`, eliminarlo y empezar de cero en lugar de relanzar.

---

### A-11 · No hay idempotencia a nivel del cargo: doble cobro posible en MercadoPago
**Severidad:** 🟠 media (pérdida de dinero) · **Estado:** confirmado

**Archivos:** `supabase/functions/_shared/payment.ts:169,201` · `supabase/functions/checkout/index.ts:332-333,482` · `supabase/migrations/20260928000000_init_schema.sql:524,527-528`

**Evidencia.** `provider_payment_id` guarda **el id de la preferencia**, no el del pago:
```ts
providerPaymentId: `mp_pref_${id}`
```
El id real (`payment_id`) queda en `raw_payload` (jsonb, sin índice único) y **se sobrescribe** en cada webhook (`checkout/index.ts:482`). Además el `idempotencyKey` es **ignorado** por MercadoPago: `async createPayment(input, _idempotencyKey)`.

**Escenario.** `handleCreate` crea la preferencia en MP y falla al guardar `provider_payment_id` → el intento queda en `review` → el usuario, viendo "no vuelvas a comprar", crea un intento nuevo → **segunda preferencia**. (El stock evita la doble venta de la prenda: la primera reserva sigue viva → `INSUFFICIENT_STOCK` en la segunda. Pero el usuario puede **pagar ambas preferencias** y solo un pedido queda registrado; el cobro huérfano no se reembolsa.)

**Impacto.** Doble cobro con un solo reembolso.

**Corrección mínima (no implementada).** Enviar `X-Idempotency-Key` al crear la preferencia; guardar el id real del pago en una columna con `unique` (no en jsonb) y no sobrescribirlo; antes de liquidar, listar los pagos aprobados por `external_reference` y reembolsar los sobrantes.

---

### A-12 · Reembolsar un pedido en `PREPARING`/`SHIPPED` devuelve el dinero pero deja la BD inconsistente
**Severidad:** 🟠 media (pérdida de dinero + estado corrupto) · **Estado:** confirmado

**Archivos:** `supabase/functions/checkout/index.ts:520-528` · `supabase/migrations/20260919140000_return_requests.sql:87-106` · `supabase/migrations/20260928000000_init_schema.sql:425-433`

**Evidencia.** El orden es **incorrecto**: primero se reembolsa al proveedor, después se actualiza la BD.
```ts
await getPaymentProvider(payment.provider).refundPayment(providerId, payment.amount_clp, payment.order_id);
const { error: finishError } = await db.rpc("finish_checkout_refund", { p_payment: payment.id });
if (finishError) throw finishError;
```
`finish_checkout_refund` solo actualiza pedidos en `('PAID','DELIVERED')`; el trigger `check_order_transition` **no permite** `PREPARING→REFUNDED` ni `SHIPPED→REFUNDED` → el RPC lanza `INVALID_ORDER_TRANSITION` → el `catch` marca `refund_state='review'` y devuelve 409. Y la UI impide reintentar (`REFUND_LOCKED` exige `refund_state IS NULL`).

**Escenario.** Admin pulsa "Reembolsar con proveedor" en un pedido ya en `PREPARING`. **El reembolso YA se ejecutó en MercadoPago**, pero la BD queda con el pedido en `PAID`, la prenda en `SOLD` y el pago en `approved/refund_state=review`.

**Impacto.** Cliente reembolsado pero pedido "pagado" y prenda no devuelta al catálogo. Sin reintento posible.

**Corrección mínima (no implementada).** Ampliar las transiciones permitidas a `('PREPARING','REFUNDED')` y `('SHIPPED','REFUNDED')` y tratar esos estados en `finish_checkout_refund`; idealmente, marcar el reembolso como `processing` en BD **antes** de llamar al proveedor (saga con compensación).

---

### A-13 · La UI promete correo en la devolución pero no existe el evento
**Severidad:** 🟠 media (incumplimiento de lo prometido al cliente) · **Estado:** confirmado

**Archivos:** `apps/web/src/app/pedido/[id]/page.tsx:202-205` · `supabase/migrations/20260929000003_notifications_log.sql:9-12` · `supabase/functions/_shared/email.ts:13-20,46-81`

**Evidencia.** El texto dice *"Solicitud enviada. Revisaremos tu caso y te escribiremos por correo."*, pero el enum de `order_notifications` solo admite 7 eventos del ciclo de vida del pedido (`order_created`, `payment_confirmed`, `order_preparing`, `order_shipped`, `order_delivered`, `order_cancelled`, `order_refunded`). **No existe** `return_requested` ni `return_rejected`, ni sus plantillas.

**Corrección mínima.** Añadir los 2 eventos al enum, a `OrderEmailEvent` y a `SUBJECTS`/`HEADS`/`BODIES`, y dispararlos desde el RPC de admin.

---

### A-14 · Los pagos en `refund_state='review'` no generan ninguna alerta
**Severidad:** 🟠 media (pérdida de dinero silenciosa) · **Estado:** confirmado

**Archivos:** `apps/admin/src/app/pedidos/page.tsx:22-23` · `apps/admin/src/app/page.tsx` (dashboard) · `supabase/functions/checkout/index.ts:525-528`

**Evidencia.** El listado de pedidos del admin solo selecciona `id, order_number, status, total_clp, created_at, mode`; el `refund_state` solo se ve entrando a cada pedido. El dashboard no agrega ninguna alerta de pagos en revisión.

**Impacto.** Un reembolso a medio ejecutar puede quedar semanas sin que nadie lo note (dinero devuelto o no devuelto, sin registro).

**Corrección mínima.** Listar `payments` con `refund_state='review'` en el home del admin y en la cabecera del listado de pedidos, como contador accionable.

---

### A-15 · El backend no valida `total_clp > 0`
**Severidad:** 🟠 media (cobro incorrecto) · **Estado:** confirmado

**Archivos:** `supabase/functions/checkout/index.ts:245-247` · `supabase/migrations/20260928000000_init_schema.sql:525,596`

**Evidencia.** Solo se comprueba que sea entero:
```ts
if (!Number.isSafeInteger(subtotal) || !Number.isSafeInteger(netSubtotal + shipping_clp)) {
  throw new CheckoutError(409, "INVALID_TOTAL", …);
}
```
`validate_discount_code` usa `amount := least(amount, p_subtotal)` (`init_schema.sql:596`), y `payments.amount_clp` solo exige `>= 0` (`:525`).

**Escenario.** Cupón del 100 % (o `fixed` igual al subtotal) + envío gratis → `total_clp = 0` → se crea un pedido y un pago de 0 CLP. En MP `unit_price: 0` sería rechazado; en Transbank `amount: 0` es inválido → el usuario queda bloqueado.

**Corrección mínima.** `if (netSubtotal + shipping_clp <= 0) throw new CheckoutError(400, "INVALID_TOTAL", "El total debe ser mayor a 0.");`

---

### A-16 · `guest_token` sin expiración ni revocación
**Severidad:** 🟠 media · **Estado:** confirmado

**Archivos:** `supabase/migrations/20260928000000_init_schema.sql:353-371` · `supabase/migrations/20261019150000_guest_order_tracking.sql:33`

**Evidencia.** `guest_token text unique`, sin columna de expiración; ni la reserva (15 min) ni el estado del pedido lo invalidan. El token de un pedido **pagado** es permanente. Además la comparación en el RPC de tracking es SQL plano (`o.guest_token = p_token`), no timing-safe — el resto del código **sí** usa `timingSafeEqual` (`checkout/index.ts:369-375`).

**Escenario.** El token se filtra (query string `/pedido/<uuid>?token=…` → historial, logs, `Referer`) → el pedido queda accesible **de forma indefinida**, incluso tras el reembolso.

**Corrección mínima.** Añadir `guest_token_expires_at` (p. ej. 180 días) y un RPC de revocación; unificar la comparación con `timingSafeEqual` o al menos documentar la excepción.

---

### A-17 · El `attempt_secret` se guarda en `localStorage` plano en la web
**Severidad:** 🟡 baja (endurecimiento) · **Estado:** probable (no explotado hoy)

**Archivos:** `apps/web/src/lib/pendingCheckout.ts:41` vs `apps/mobile/src/lib/pendingCheckout.ts:32-35`

**Evidencia.** La web guarda `{key, secret, input}` en `localStorage` en claro; el móvil usa **SecureStore** (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`) para el secreto. La web no tiene CSP con `script-src` restringido en `app/layout.tsx` (el bridge de pagos sí la tiene, `paymentBridge.ts:81`).

**Impacto.** Un XSS o una extensión con acceso al almacenamiento obtiene la credencial de recuperación/confirmación del pedido.

**Corrección mínima.** Reutilizar el patrón del móvil (almacén secreto separado) o, como mínimo, añadir una CSP restrictiva en `next.config.ts`.

---

### A-18 · El checkout móvil borra la dirección tecleada si la respuesta llega tarde
**Severidad:** 🟡 baja (pérdida de datos tecleados) · **Estado:** confirmado

**Archivos:** `apps/mobile/app/checkout.tsx:92-119` vs `apps/web/src/app/checkout/page.tsx:112-149`

**Evidencia.** El móvil ejecuta `reset({...})` **dentro del `queryFn`** (`checkout.tsx:104-113`): si la respuesta del prefill de dirección llega tarde (o hay un refetch), borra lo que el usuario ya escribió. La web lo hace bien con `keepDirtyValues` y un flag `addressPrefilled`.

**Corrección mínima.** Mover el `reset` a un `useEffect` dependent de los datos, con `keepDirtyValues: true` (como la web).

---

### A-19 · Fusión de carrito con semántica distinta entre web y móvil
**Severidad:** 🟡 baja · **Estado:** confirmado

**Archivos:** `apps/web/src/lib/cartStore.ts:33` (`Math.max`) · `apps/mobile/src/stores/useShopStore.ts:68` y `supabase/migrations/20261019130000_reconcile_beta_remote.sql:105` (`least(99, qty+excluded.qty)`)

**Evidencia.** La web fusiona con **máximo** (si la cuenta tiene 2 y el invitado 3, queda 3: **se pierde 1 unidad de la cuenta**); el móvil fusiona con **suma** (mismo usuario ve resultados distintos según la app).

**Corrección mínima.** Unificar en `suma` (con tope `least(99, …)`) en ambas apps y en el RPC.

---

### A-20 · La web vacía todo el carrito tras comprar, incluidas prendas agregadas durante el pago
**Severidad:** 🟡 baja · **Estado:** confirmado

**Archivos:** `apps/web/src/app/checkout/page.tsx:189` · `apps/mobile/src/stores/useShopStore.ts:103-110`

**Evidencia.** Web: `clear()` (vacío total) → `clearPendingCheckout(owner)`. Móvil: `consumePaidOrder` (descuenta solo lo comprado). Además `clear()` es un `setState` de React cuya escritura a `localStorage` ocurre en un `useEffect` posterior (`apps/web/src/lib/cart.tsx:83-93`), mientras `clearPendingCheckout` borra el intento **antes** → ventana de carrera en la que el carrito conserva artículos ya comprados (el stock ya está reservado, así que el backend responde `INSUFFICIENT_STOCK`).

**Corrección mínima.** Adoptar `consumePaidOrder` en la web y vaciar el carrito **antes** de borrar el intento.

---

### A-21 · El carrito web es *last-writer-wins* entre pestañas
**Severidad:** 🟡 baja · **Estado:** confirmado

**Archivos:** `apps/web/src/lib/cart.tsx:83-93`

**Evidencia.** Cada cambio reescribe el array completo en `localStorage`; no hay listener del evento `storage` para el carrito (el único listener del proyecto está en `components/CookieConsent.tsx:14`). Con dos pestañas, la escritura de la pestaña B borra lo que la pestaña A añadió.

**Corrección mínima.** Escuchar el evento `storage` y fusionar en vez de sobrescribir.

---

### A-22 · `checkout_attempts` crece sin límite y conserva el `response` completo
**Severidad:** 🟡 baja (higiene) · **Estado:** probable

**Archivos:** `supabase/migrations/20261010000000_beta_checkout.sql:2-12` · `supabase/migrations/20261009190101_remote_crons.sql:11-20`

**Evidencia.** Los crons registrados son solo 2 (`release_expired_reservations`, `refresh_trending_scores`); no hay `DELETE`/TTL sobre `checkout_attempts`, que acumula filas con `response` JSONB.

**Corrección mínima.** Un cron que borre intentos con más de N días y estado terminal.

---

### A-23 · El catálogo completo de cupones es legible por `anon`
**Severidad:** 🟡 baja · **Estado:** confirmado

**Archivos:** `supabase/migrations/20260928000001_rls_policies.sql:163-166` · `supabase/migrations/20260928000000_init_schema.sql:549-566` · `supabase/migrations/20260928000002_seed.sql:237-239`

**Evidencia.** `create policy discounts_public_read on public.discounts for select using (is_active);` expone **código, tipo, valor exacto, umbral mínimo, límite y contador de usos** de todos los cupones activos a cualquier visitante. `claim_discount_usage` sí está revocada a clientes, pero cualquiera que complete un checkout consume usos.

**Corrección mínima.** Vista `public.active_discounts` con solo `code`+descripción y `revoke select on public.discounts from anon`.

---

### A-24 · `product-images` es público: archivar un producto no oculta sus fotos
**Severidad:** 🟡 baja · **Estado:** confirmado

**Archivos:** `supabase/migrations/20260929000000_storage.sql:6-13` · `supabase/migrations/20260928000001_rls_policies.sql:45-46,50`

**Evidencia.** El bucket es `public = true` con `select using (bucket_id='product-images')`. El filtrado del catálogo (`products`) y el de imágenes son independientes: un producto `ARCHIVED` o no publicado conserva sus objetos accesibles por URL pública, y `product_images_public_read` (`using (true)`) permite listar los `storage_path` de imágenes de productos no publicados.

**Corrección mínima.** Bucket privado + URL firmada de corta duración, u ofuscar los paths (`<slug>/<n>` es predecible).

---

### A-25 · Los huérfanos de Storage solo se limpian a mano
**Severidad:** 🟡 baja · **Estado:** confirmado

**Archivos:** `supabase/migrations/20261016161216_admin_images_vinta_20261016.sql:91-102` · `apps/admin/src/app/productos/[id]/page.tsx:79-114`

**Evidencia.** El trigger `product_image_cleanup` encola en `public.image_cleanup`, pero el **único** consumidor es el panel admin (procesa la cola al abrir un producto). No hay cron ni Edge Function que purgue la cola.

**Corrección mínima.** Cron `purge_orphan_images()` que borre los objetos sin fila en `product_images` y luego su fila.

---

### A-26 · `paymentBridge.ts` usa la service-role key sin guarda `server-only`
**Severidad:** 🟡 baja (endurecimiento) · **Estado:** probable — **no explotable hoy**

**Archivos:** `apps/web/src/lib/paymentBridge.ts:11` · `apps/admin/src/lib/paymentBridge.ts:7` (contraste: `apps/web/src/lib/editorial.server.ts:1` sí usa `import "server-only"`)

**Evidencia.** Ninguno de los dos archivos tiene `"use client"` ni `import "server-only"`. Hoy solo los importan Route Handlers y `process.env.SUPABASE_SECRET_KEY` (sin prefijo `NEXT_PUBLIC_`) **no** se inyecta en el bundle cliente, así que **no hay exposición actual**. El riesgo es de regresión: un import desde un componente cliente haría que el error de build sea la única barrera.

**Corrección mínima.** `import "server-only";` en ambos archivos (y renombrarlos `.server.ts`).

---

### A-27 · Las 6 migraciones fundacionales no son idempotentes
**Severidad:** 🟡 baja (operación) · **Estado:** confirmado

**Archivos:** `supabase/migrations/20260928000000_init_schema.sql` (22 `create table` y ~10 `create index` sin `if not exists`; `create trigger` sin `drop trigger if exists` en `:201`) · `20260928000001_rls_policies.sql` (43 `create policy` sin `drop policy if exists`) · `20260928000002_seed.sql` (`insert` sin `on conflict`) · `20260929000003_notifications_log.sql:6,19,22,24` · `20261010000000_beta_checkout.sql:2,19-23,26,68,98,113,135,149` (`create function` sin `or replace`) · `20261010000001_beta_cart_images.sql:1,10,47,56,70,88`

**Escenario.** Un `supabase db reset` parcial o una re-aplicación manual aborta a mitad de archivo (esas migraciones **no** tienen `begin/commit` explícito) y dejan objetos a medio crear. Las 15 migraciones restantes sí son idempotentes.

**Corrección mínima.** `if not exists` / `drop … if exists` / `create or replace` en las 6, o envolverlas en `begin; … commit;`.

---

### A-28 · La suite RLS T13 contradice la migración de imágenes: el flujo local documentado aborta
**Severidad:** 🟡 baja (cobertura degradada) · **Estado:** ✅ **RESUELTO** (Etapa 1, 20-oct-2026)

**Archivos:** `supabase/tests/rls_tests.sql:495-507` (T13) · `supabase/migrations/20261016161216_admin_images_vinta_20261016.sql:20,37,62,92` · `supabase/tests/admin_images_tests.sql:101` · `supabase/tests/README.md:17-23`

**Evidencia.** T13 exige `search_path` con `pg_temp`; las 4 funciones de imágenes usan `search_path = ''` (más estricto) y `admin_images_tests.sql:101` **exige** `search_path=""`. Tras aplicar las 20 migraciones, T13 falla y —al ejecutarse con `ON_ERROR_STOP=1`— aborta el resto de la suite y `beta_tests.sql`, que nunca corre.

**Impacto.** Falso "verde" histórico en `docs/DATABASE.md:4` y `docs/SECURITY.md:4` ("24 checks verdes").

**Corrección mínima.** Aceptar ambas formas en T13: `c like 'search_path=%pg_temp%' OR c = 'search_path=""'`.

> **Aplicado** el 20-oct-2026: T13 acepta las dos formas y la suite completa
> (`rls_tests` + `beta_tests` + `admin_images_tests` + `sandbox_checkout_tests`)
> corre en verde en Docker. El falso "verde" histórico de `docs/DATABASE.md` y
> `docs/SECURITY.md` ("24 checks verdes") está corregido en ambos documentos.

---

### A-29 · `20261018120000` reescribe datos de producción y se auto-registra en el historial del CLI
**Severidad:** 🟡 baja · **Estado:** confirmado

**Archivos:** `supabase/migrations/20261018120000_unique_prenda_mode_test.sql:1-3` (encabezado) vs `:12-13,20-21,68-70`

**Evidencia.** El encabezado dice *"no reescribe usuarios, productos comerciales, precios ni pedidos pagados"*, pero el cuerpo hace:
```sql
update public.orders   set mode = 'test' where mode = 'live';
update public.payments set mode = 'test' where mode = 'live';
update public.products set stock = 1, availability = 'AVAILABLE'
 where published_at is not null and not allow_parallel_sales and stock > 1;
insert into supabase_migrations.schema_migrations(version, name) values ('20261018120000', …);
```
Además `mode` se define por defecto `'live'`, así que todo pedido nuevo nace `live` y vuelve a `test` en la siguiente ejecución (semántica no convergente).

**Corrección mínima.** Quitar el `insert` en `schema_migrations` (el CLI ya registra la versión) y separar la normalización de datos en una migración explícita y fechada.

---

### A-30 · `return_requests` es la única tabla nueva sin `revoke` explícito
**Severidad:** 🟡 baja · **Estado:** confirmado (bloqueado por RLS)

**Archivos:** `supabase/migrations/20261019140000_return_requests.sql:12-30` vs `supabase/migrations/20261019130000_reconcile_beta_remote.sql:75` (el patrón correcto)

**Evidencia.** Supabase aplica *default privileges* `ALL` a `anon`/`authenticated` en tablas nuevas; las migraciones lo revierten explícitamente. `return_requests` no lo hace. RLS lo neutraliza (no hay policy `INSERT`), pero el privilegio queda implícito.

**Corrección mínima.** `revoke all on public.return_requests from anon, authenticated; grant select on public.return_requests to authenticated;`

---

### A-31 · `order_notifications` conserva `INSERT`/`UPDATE`/`DELETE` para `authenticated`
**Severidad:** 🟡 baja · **Estado:** confirmado (bloqueado por RLS)

**Archivos:** `supabase/migrations/20260929000004_hardening.sql:190-191`

**Evidencia.** `revoke all on public.order_notifications from anon; grant select … to authenticated;` — no revoca escritura. Un admin usando la anon-key podría saltarse `claim_order_notification` (la idempotencia de los correos).

**Corrección mínima.** `revoke insert, update, delete on public.order_notifications from authenticated;`

---

### A-32 · `grant execute on all functions … to anon, authenticated` es una bomba de relojería
**Severidad:** 🟡 baja (latente) · **Estado:** confirmado

**Archivos:** `supabase/migrations/20260928000001_rls_policies.sql:39` · mitigado en `supabase/migrations/20260929000004_hardening.sql:76-89`

**Evidencia.** El grant global sigue vigente; el hardening revoca 5 funciones backend, pero **toda función nueva** creada después hereda `EXECUTE` de `anon` y `authenticated` salvo que se revoque explícitamente (ya pasó con `return_requests` y `order_notifications`: A-30, A-31).

**Corrección mínima.** `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC` como default en el hardening, y conceder solo lo necesario.

---

### A-33 · La web no expone los filtros de talla, condición ni precio que la capa de datos sí soporta
**Severidad:** 🟡 baja (funcional) · **Estado:** confirmado

**Archivos:** `apps/web/src/app/catalogo/useCatalogFilters.ts:57-77` y `CatalogContent.tsx:223,268` (solo 2 selects: categoría y marca) vs `apps/web/src/lib/catalog.ts:217-220` (`condition`, `size`, `maxPriceClp` ya soportados) y `apps/mobile/app/(tabs)/buscar.tsx:35-36,101-108` (móvil sí los expone)

**Corrección mínima.** Añadir los controles al panel de filtros del catálogo web reutilizando `buildProductQuery`.

---

### A-34 · La web no tiene favoritos
**Severidad:** 🟡 baja (funcional) · **Estado:** confirmado

**Archivos:** `grep -rn "favorites" apps/web/src` → **0 coincidencias**. La tabla `favorites` existe en remoto con RLS (`profiles`-owner) y el móvil la usa (`apps/mobile/src/data/favorites.ts`).

**Corrección mínima.** Reusar `favorites` en la web con el mismo patrón de `queryKey` por usuario que el móvil (y corregir A-02 primero).

---

### A-35 · La web no usa `env(safe-area-inset-*)` ni `viewport-fit=cover`
**Severidad:** 🟡 baja (accesibilidad móvil) · **Estado:** confirmado

**Archivos:** `grep -rn "safe-area" apps/web/src` → **0 coincidencias**; `apps/web/src/app/layout.tsx:60` declara `viewport = { themeColor: "#f8f7f4" }` sin `viewportFit`.

**Evidencia.** El CSS sí es cuidadoso en otros aspectos: `focus-visible` global (`globals.css:65,172`), `prefers-reduced-motion` (`:146`), `forced-colors` (`:171`), y `font-size: 16px !important` bajo 640 px (`:167`). Pero en un iPhone con notch, el header y el footer pueden quedar bajo la muesca o la barra de inicio.

**Corrección mínima.** `viewport: { ..., viewportFit: "cover" }` + `padding-top: env(safe-area-inset-top)` / `padding-bottom: env(safe-area-inset-bottom)` en el layout.

---

### A-36 · Chips y un control del Chrome móvil por debajo de 44 px
**Severidad:** 🟡 baja (accesibilidad móvil) · **Estado:** confirmado

**Archivos:** `apps/mobile/src/components/Chrome.tsx:62` (`minHeight: 40` en el chip). El resto de la app usa 48–52 px (`Inputs.tsx:93`, `EmptyState.tsx:52`, `app/checkout.tsx:533-545`, `app/producto/[id].tsx:273`).

**Corrección mínima.** Subir el chip a 44 px.

---

### A-37 · `20261016161216` aborta si hay portadas duplicadas
**Severidad:** 🟡 baja · **Estado:** confirmado (intencionado)

**Archivos:** `supabase/migrations/20261016161216_admin_images_vinta_20261016.sql:7-17` (`raise exception 'DUPLICATE_PRODUCT_COVERS'`), `:5` y `:103` (`begin;`/`commit;` → la migración completa se revierte).

**Impacto.** Cualquier deriva de datos bloquea toda la cadena posterior de migraciones. Es una guarda válida (falla cerrada), pero falta el query de pre-verificación documentado en `docs/PRODUCTION.md`.

---

### A-38 · `supabase/config.toml` apunta a un seed que no existe
**Severidad:** 🟡 baja · **Estado:** confirmado

**Archivos:** `supabase/config.toml:70` (`sql_paths = ["./seed.sql"]`) — el archivo `supabase/seed.sql` **no existe**; el seed real está en `supabase/migrations/20260928000002_seed.sql`.

**Impacto.** `supabase db reset` falla o advierte en el paso de seed local.

---

### A-39 · El toggle "Hacer admin" del panel estaba roto (RLS) y el test que lo cubría daba verde falso
**Severidad:** 🟠 media (funcional + cobertura engañosa) · **Estado:** ✅ **RESUELTO** (Etapa 1, 20-oct-2026)

**Hallazgo nuevo, descubierto al verificar A-01.**

**Archivos:** `apps/admin/src/app/clientes/page.tsx:47-48` · `supabase/migrations/20260928000001_rls_policies.sql:75-78` · `supabase/tests/rls_tests.sql` (T12b)

**Evidencia.** Las policies de `profiles` en la BD remota eran solo dos:
`profiles_admin_read` (**SELECT**) y `profiles_owner_rw` (**ALL**, `USING (id = auth.uid())`).
Una policy `FOR ALL` con `USING (id = auth.uid())` **no** habilita a un admin a
actualizar la fila de **otro** usuario: no existía ninguna policy de `UPDATE` con
`is_admin()`. Por eso el botón "Hacer admin" (`clientes/page.tsx:47`) actualizaba
**0 filas** y, como PostgREST devuelve `200` con `[]` (sin error), la UI lo
mostraba como exitoso.

**El test que lo cubría era un falso verde.** T12b ("admin conserva gestión de
roles") hacía:
```sql
update public.profiles set role = 'admin' where id = '22222222-…';
update public.profiles set role = 'customer' where id = '22222222-…';
raise notice 'PASS T12b: admin conserva gestión de roles';
```
Un `UPDATE` que **no afecta ninguna fila no lanza excepción**, así que el test
pasaba sin haber hecho nada.

**Corrección aplicada.** `profiles_admin_update` (`for update using (is_admin()) with check (is_admin())`) en la migración `20261020000000`, y **T12b reescrito** para **leer el rol resultante** y fallar si no cambió:
```sql
update public.profiles set role = 'admin' where id = '22222222-…';
select role into r from public.profiles where id = '22222222-…';
if r <> 'admin' then raise exception 'T12b FAIL: el admin no pudo promover (role=%)', r; end if;
```

**Evidencia.** Con el código anterior, T12b falla con
`T12b FAIL: el admin no pudo promover (role=customer)`; con el fix pasa.

---

### A-40 · El entorno de pruebas SQL estaba una migración por detrás de la BD real
**Severidad:** 🟠 media (cobertura engañosa) · **Estado:** ✅ **RESUELTO** (Etapa 1, 20-oct-2026)

**Hallazgo nuevo, descubierto al ejecutar la suite SQL en Docker.**

**Archivos:** `supabase/migrations/20261018120000_unique_prenda_mode_test.sql:68-70` · `supabase/tests/setup_local.sql`

**Evidencia.** `20261018120000` termina con:
```sql
insert into supabase_migrations.schema_migrations(version, name)
values ('20261018120000', 'unique_prenda_mode_test') on conflict (version) do nothing;
```
En Supabase real esa tabla **existe** (es la del CLI) → la migración se aplica
entera. En el Postgres efímero de los tests **no existía** → el `INSERT` fallaba
con `relation "supabase_migrations.schema_migrations" does not exist` y, como la
migración está dentro de `begin; … commit;`, **se revolvía completa**. El entorno
local quedaba con `create_checkout_order` de **5 argumentos** (en vez de 6), sin
las columnas `mode` y sin `allow_parallel_sales`: es decir, **un esquema
distinto del que se prueba en producción**.

**Corrección aplicada.** `supabase/tests/setup_local.sql` crea el stub
```sql
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key, name text
);
```
Con ello la migración completa se aplica en local y **la suite dejó de abortar en
T13** (ver A-28), permitiendo por fin ejecutar `beta_tests.sql`,
`admin_images_tests.sql` y `sandbox_checkout_tests.sql`.

**Corrección adicional.** `supabase/tests/sandbox_checkout_tests.sql:11` consultaba
`has_function_privilege('anon','public.create_checkout_order(uuid,uuid,text,jsonb,jsonb)',…)`
— la firma de **5 argumentos que ya no existe** en el remoto (fue eliminada por
`20261018120000`). En Postgres eso lanza `function does not exist`. Corregido a la
firma vigente de 6 argumentos.

---

### A-41 · La página de login de la web navega durante el render
**Severidad:** 🟡 baja (calidad) · **Estado:** confirmado, **pendiente de corregir**

**Archivos:** `apps/web/src/app/login/page.tsx:19-22`

**Evidencia.** El warning aparece en los logs del servidor de desarrollo durante
los E2E:
```
Cannot update a component (`Router`) while rendering a different component (`LoginPage`)
  at LoginPage (src/app/login/page.tsx:20:12)
  18 |   if (loading) return <LoadingState message="Cargando sesión…" />;
  19 |   if (user) {
> 20 |     router.replace("/");
```
Llamar a `router.replace()` durante el render es un antipatrón de Next.js: puede
provocar navegaciones duplicadas o advertencias de hidratación.

**Corrección mínima.** Mover la redirección a un `useEffect`:
```tsx
useEffect(() => { if (user) router.replace("/"); }, [user, router]);
```

---

### A-42 · El checkout pendiente del invitado sobrevive al cambio de cuenta
**Severidad:** 🟡 baja (higiene) · **Estado:** probable

**Archivos:** `apps/web/src/lib/pendingCheckout.ts:39-59`

**Evidencia.** El blob del intento pendiente se guarda en
`localStorage["shopy-checkout-<owner>"]`, con `owner = user.id | "guest"`. La
variante `"guest"` **no** está atada a ninguna cuenta, así que tras cerrar
sesión queda en el dispositivo y el siguiente usuario del mismo navegador
(otro invitado) podría reutilizar el `guest_token` que contiene.

No es una fuga entre cuentas registradas (cada una tiene su propia clave) y el
token por sí solo no da acceso a pedidos ajenos, pero en un dispositivo
compartido conviene limpiarlo.

**Corrección mínima.** Al cerrar sesión, borrar también `shopy-checkout-guest`
(o mover el intento de invitado a una clave con token aleatorio en vez de la
constante `"guest"`).

---

## 5. Resultados de verificaciones

> **Nota de alcance.** La primera pasada de esta auditoría (20-oct-2026, antes de
> la remediación) fue **de solo lectura**. Al ejecutar la Etapa 1 y la Etapa 2 se
> aplicó **una** migración en la BD remota (con el método acordado
> `supabase db query --linked -f` + `migration repair`, nunca `db push`) y se
> crearon **datos de prueba descartables** (usuarios temporales y un pedido de
> prueba), **todos eliminados y verificados al final**. No se tocó ningún dato
> de producción.

| # | Comando | Resultado | Limitación |
|---|---|---|---|
| V-1 | `npm run typecheck` (root: `tsconfig.json` + mobile + admin) | ✅ **exit 0** | — |
| V-2 | `npm run web:typecheck` | ✅ **exit 0** | — |
| V-3 | `npm run lint` (`eslint . --max-warnings 0`) | ✅ **exit 0**, 0 warnings | Cubre el repo, pero **no** las suites SQL |
| V-4 | `npm run web:build` | ✅ **exit 0** — Next 16.4.2 (Turbopack), 16/16 páginas, 19 rutas | Build de un snapshot; no valida el despliegue real (caído) |
| V-5 | `npm run admin:build` | ✅ **exit 0** — 19/19 páginas, 17 rutas | — |
| V-6 | `npm run test:beta` | ✅ **60/60** tests, 0 fallos (mock-based) | Los `.mjs` de `supabase/tests` usan **fixtures en memoria**; no tocan la BD |
| V-7 | `npm run test:checkout` | ✅ **todas las suites verdes** (`checkout_rules` 5, `checkout_api` 24, `payment_provider` 17, `session-connection` 6, `server-read` 1, `payment-bridge` 3, `cartStore` 9, `catalogProduct` 4, `local-checkout` 9) | Igual: **mocks**, no prueban MercadoPago/Webpay reales |
| V-8 | `npm audit --omit=dev` | ⚠️ **25 vulnerabilidades (11 moderate, 14 high)**, 0 critical | Las 25 son de la cadena **Expo/Metro** (`expo`, `react-native`, `metro`, `@expo/cli`, `braces`, `micromatch`, `node-forge`, `uuid`, `xcode`, `decode-uri-component`) — **herramientas de build**, no runtime del APK/IPA ni del servidor web. Sin exploitabilidad en producción hoy, pero `npm audit fix --force` rompería el SDK de Expo: **no se debe aplicar a ciegas**. |
| V-9 | `supabase migration list --linked` | ✅ **21/21 migraciones aplicadas**, 0 pendientes (antes 20/20) | — |
| V-10 | Consultas SQL de solo lectura a la BD remota (`supabase db query --linked`) | ✅ 27 tablas (27/27 con RLS), 2 crons activos, policies de `profiles`/`orders`/`payments` verificadas | **Solo lectura** |
| V-11 | `supabase functions invoke` (POST a `checkout`/`notify`/`producto-ia`) | ✅ Las 3 Edge Functions están desplegadas y responden con validación de entrada (`VALIDATION` / `UNAUTH`) | No se ejecutó un flujo de pago real (requeriría escribir en remoto) |
| V-12 | `curl` a 5 rutas de `https://shopy-web-six.vercel.app` | 🔴 **503 `DEPLOYMENT_PAUSED`** en las 5 | El sitio está caído |
| V-13 | `npx playwright test` (apps/admin) | ✅ **12/12** verdes (11 de fotos + 1 nuevo de aislamiento) | Cubre el flujo de fotos del admin y el aislamiento entre cuentas; **no** cubre checkout, pagos ni carrito |
| V-14 | `deno test` sobre `_shared/*_test.ts` | ⚠️ **No ejecutable**: no hay binario `deno` en el entorno | Los 17 tests Deno documentados en `docs/BETA.md:51` **no se re-verificaron** |
| V-15 | Suite SQL completa en Docker (Postgres 16) | ✅ `rls_tests` **T0–T16** + `beta_tests` + `admin_images_tests` + `sandbox_checkout_tests` | Ahora **sí** ejecutable (antes abortaba en T13): ver §5.2 |

### 5.2 Evidencia de la remediación (Etapas 1 y 2)

El principio seguido fue **probar que el test falla antes de probar que pasa**: cada
corrección se verificó en rojo con el código anterior y en verde con el nuevo.

#### Etapa 1 — Privilegios (`20261020000000`)

**Línea base (sin el fix), suite SQL en Docker:**
```
PASS T12a: auto-promoción a admin bloqueada
ERROR:  T12b FAIL: el admin no pudo promover (role=customer)   ← bug real (A-39)
PASS T13: search_path inmutable en todas las DEFINER
ERROR:  T14 FAIL: el cliente se auto-asignó admin tras borrar su perfil   ← A-01
ERROR:  T15 FAIL: el cliente escribió el estado de un pago               ← A-05
ERROR:  T15 FAIL: el admin escribió el estado de un pago                 ← A-05
ERROR:  INVALID_ORDER_TRANSITION: SHIPPED -> PAID   ← mark_order_paid NO bloqueado (A-05)
```

**Con el fix:**
```
PASS T0..T12a, PASS T12b: admin conserva gestión de roles
PASS T13: search_path inmutable en todas las DEFINER
PASS T14: escalada DELETE+INSERT a admin bloqueada
PASS T15a: cliente no escribe payments
PASS T15b: admin tampoco escribe payments (solo service_role)
PASS T16: mark_order_paid solo para service_role
ALL DB TESTS PASSED
+ beta_tests, admin_images_tests y sandbox_checkout_tests en verde
```

**Aplicación en la BD remota y verificación por sonda funcional**
(`supabase/tests/security_probe.mjs`, 10/10 OK, con limpieza verificada de
residuos):
| Caso | Resultado |
|---|---|
| cliente: `UPDATE role='admin'` | `FORBIDDEN: role no es autoasignable` |
| cliente: `INSERT role='admin'` | `new row violates row-level security policy for table "profiles"` |
| cliente: `DELETE` de su propio perfil | permitido (derecho de supresión) |
| cliente: `DELETE`+`INSERT role='admin'` | `new row violates row-level security policy` → escalada cerrada |
| cliente: `UPDATE payments.status` | `permission denied for table payments` |
| cliente: `rpc mark_order_paid` | `permission denied for function mark_order_paid` |
| admin: cambiar el rol de otro usuario | `role resultante=customer` → **toggle del panel arreglado** (A-39) |
| admin: `UPDATE payments.status` | `permission denied for table payments` |
| admin: `rpc mark_order_paid` | `permission denied for function mark_order_paid` |
| limpieza | `perfiles residuales=0; usuarios residuales=0` |

**Estado del catálogo remoto tras la migración:**
`profiles` → 6 policies (`owner_select`, `owner_update`, `owner_insert` con
`role='customer'`, `owner_delete`, `admin_read`, `admin_update`); `payments` → 2
policies, ambas de **solo lectura**; `authenticated` conserva `SELECT` y **no**
tiene `INSERT/UPDATE/DELETE` sobre `payments`; `mark_order_paid` ejecutable solo
por `service_role`.

#### Etapa 2 — Aislamiento entre cuentas en la web

| Escenario | Código anterior | Código nuevo |
|---|---|---|
| E2E `web-account-isolation` | ❌ **FALLA** — la cuenta B veía el pedido de A (`toHaveCount(0)` incumplido) | ✅ **PASA** (15,6 s) |
| Suite E2E completa | 11/11 | ✅ **12/12** |

**Detalle metodológico importante:** la primera versión del test **pasaba sin el
fix**, porque usaba `page.goto()` entre pasos: una recarga borra la caché en
memoria de React Query, con lo que la fuga era inobservable. El test definitivo
navega **con clics en enlaces de Next.js** (navegación cliente), que es el
comportamiento real de un usuario. Un E2E que no reproduce el mecanismo del bug
es un E2E que no prueba nada.

**Efecto colateral detectado y corregido durante la Etapa 2:** la primera versión
de la purga se disparaba también en la **primera** carga y cancelaba la consulta
que la página activa acababa de lanzar, dejando `/pedidos` colgado en
"Cargando tus pedidos…" (síntoma visible en el primer intento del E2E). Se
corrigió purgando **solo la cuenta anterior** (`apps/web/src/lib/session.tsx`).

### 5.1 Qué **no** pudo verificarse en este entorno

- **Ninguna comprobación de interfaz del sitio público desplegado**: sigue caído (V-12). Los E2E de web se hicieron contra el servidor local `:3010` que levanta Playwright.
- **Ningún pago real** (ni MP ni Webpay): habría exigido escribir en la BD remota y credenciales de proveedor.
- **Ninguna prueba en dispositivo físico**: teclado, áreas seguras, texto grande y contraste quedan pendientes de la matriz de `docs/BETA.md:36`.
- **Los 3 smoke tests** (`smoke_fase4/5/6.mjs`) requieren un stack Supabase local; no se ejecutaron contra remoto por seguridad.
- **A-03** (carrera de cancelación): la policy está confirmada en el catálogo remoto, pero **la carrera completa no se reprodujo**; queda para la Etapa 3.
- **Los 17 tests Deno** no se corrieron (no hay binario `deno`).
- **Concurrencia real** entre conexiones: la suite SQL es secuencial.

---

## 6. Cobertura y pruebas faltantes

### 6.1 Qué cubren hoy las pruebas

| Capa | Archivo | Qué prueba realmente | Calidad |
|---|---|---|---|
| Unit | `apps/web/src/lib/cartStore.test.ts`, `catalogProduct.test.ts` | Fusión de carrito (max), mapeo de producto | Reproduce la implementación; no verifica el comportamiento de negocio real |
| Unit | `apps/mobile/tests/state.test.mjs` | Aislamiento por cuenta, fusión única, respuesta tardía | **Buena**: cubre exactamente los riesgos de A-02/A-19 |
| Unit | `apps/mobile/tests/checkout.test.mjs` | Cliente de checkout con `fetch` inyectado | Mock |
| Contrato | `supabase/tests/checkout_api.test.mjs` (24) | Idempotencia, BOLA, JWT inválido, respuesta desconocida, cantidades manipuladas | **Buena**: simula el servidor con un fixture en memoria |
| Contrato | `supabase/tests/payment_provider.test.mjs` (17) | Firma HMAC, entorno sandbox/live, comprador test, fallo HTTP | **Buena**: cubre `payment.ts` con `fetch` mockeado |
| Reglas | `supabase/tests/checkout_rules.test.mjs` (5) | Dirección y tarifa por región | Pura |
| E2E | `apps/admin/tests/photo-flow.spec.ts` (11) | Login → crear → 3 fotos → portada → defecto → orden (flechas y drag) → eliminar → publicar → verificar en el sitio | **La más valiosa**: toca BD real y Storage real, con limpieza |
| SQL | `supabase/tests/rls_tests.sql` (25 checks) | T1–T13: aislamiento A/B, no-insert, no-modificar precio, doble venta, expiración, IDOR, cupones, analytics, `profiles.role` | **No está en CI** y está rota por A-28 |
| SQL | `supabase/tests/beta_tests.sql` | Reserva, idempotencia de liquidación, idempotencia de correos, pago tardío, refund, `sync_my_cart` | No está en CI |

### 6.2 Pruebas ausentes (priorizadas)

| # | Prueba ausente | Hallazgo que cerraría | Prioridad | Estado |
|---|---|---|---|---|
| P-1 | **E2E del checkout completo** en web y móvil: invitado → dirección → cupón → pago simulado → confirmación → tracking. Hoy no existe ningún E2E de compra. | A-04, A-06, A-09, A-10 | 🔴 | ⏳ pendiente (Etapa 5) |
| P-2 | **E2E de aislamiento de cuenta en la web**: login A → `/pedidos` → logout → login B → `/pedidos` debe estar vacío | A-02 | 🔴 | ✅ **hecho** — `apps/admin/tests/web-account-isolation.spec.ts` |
| P-3 | **Test SQL de escalada de privilegios**: `DELETE`+`INSERT` con `role='admin'` debe fallar | A-01 | 🔴 | ✅ **hecho** — `rls_tests.sql` T14 |
| P-4 | **Test SQL de cancelación con pago vivo**: el stock no debe liberarse | A-03 | 🔴 | ⏳ Etapa 3 (con carrera real de dos conexiones) |
| P-5 | **Test de integración del webhook firmado**: firma válida → liquida; inválida → 401 | A-08 | 🔴 | ⏳ pendiente (Etapa 4) |
| P-6 | **E2E móvil en dispositivo**: teclado, safe area, texto grande, contraste (matriz de `docs/BETA.md:36`) | A-35, A-36 | 🟠 | ⏳ pendiente (Etapa 5) |
| P-7 | **Webpay sandbox E2E**: aprobado, rechazado, cancelación, expiración, reembolso | A-07 | 🟠 | ⏳ pendiente (Etapa 4) |
| P-8 | **Test de email de RMA**: `return_requested` / `return_rejected` se envían | A-13 | 🟠 | ⏳ pendiente (Etapa 5) |
| P-9 | **Test de concurrencia real** (2 conexiones) sobre la reserva de stock; la validación con PGlite no prueba concurrencia | A-03 | 🟠 | ⏳ pendiente (Etapa 3) |
| P-10 | **Test de `total_clp = 0`** con cupón 100 % + envío gratis | A-15 | 🟡 | ⏳ pendiente (Etapa 2 del plan original → Etapa 5) |
| P-11 | **CI que ejecute las 4 suites SQL** (hoy `npm run lint`/`test` no las ejecuta) | A-28, A-40 | 🟡 | 🟡 **parcial**: ya son ejecutables en local (Docker) y en verde; falta automatizarlas en CI |
| P-12 | **Test de fusión web/móvil** con la misma semántica | A-19 | 🟡 | ⏳ pendiente |
| P-13 | **Test de RLS de Storage**: `file_size_limit` y `allowed_mime_types` no se ejercitan; `setup_local.sql` no replica `storage.objects` | A-24 | 🟡 | ⏳ pendiente |
| P-14 | **Test de `guest_token` expirado/revocado** | A-16 | 🟡 | ⏳ pendiente (Etapa 3) |
| P-15 | **Test del toggle de rol del admin** (no basta con la policy: hay que comprobar que la fila **cambió**) | A-39 | 🟡 | ✅ **hecho** — T12b reescrito |

### 6.3 Limitación estructural de la cobertura

Las pruebas actuales son, en su mayoría, **réplicas de la implementación** (mocks que reproducen la lógica del
servidor en el cliente). Eso valida que el código no se rompa, pero **no** que el proveedor externo, la base de
datos real ni la UI se comporten como se espera. La única suite que toca sistemas reales es el E2E de Playwright
del admin (BD + Storage reales) y los 3 smoke tests que no se ejecutaron aquí.

---

## 7. Dependencias externas y bloqueos

### 7.1 Servicios externos

| Servicio | Estado | Uso | Coste | Acción pendiente |
|---|---|---|---|---|
| **Vercel (web)** | 🔴 **PAUSADO** — 503 | Hosting del sitio público | $0 (Hobby) | `vercel project resume shopy-web --scope leandro-mirandas-projects` (**requiere confirmación interactiva**; no automatizable) y luego redesplegar para publicar el código de las últimas 2 semanas |
| **Supabase** | 🟢 Operativo | Postgres + Auth + Storage + Edge Functions | $0 (Free) | Plan Free: 500 MB DB, 1 GB Storage, 500 MB egress/mes — **vigilar** con el catálogo growing |
| **MercadoPago** | 🟡 Sandbox verificado (1 pago real aprobado el 17-oct) | Pagos | $0 en sandbox | **KYC** (1–2 días hábiles) + credenciales `APP_USR-…` + `MERCADOPAGO_WEBHOOK_SECRET` + `PAYMENT_MODE=live` |
| **Transbank / Webpay** | 🟡 Código listo, **nunca probado E2E** | Pagos | $0 en TEST | Cuenta Transbank + `TRANSBANK_COMMERCE_CODE` + `TRANSBANK_API_KEY_SECRET`; y quitar el atado al host sandbox (A-07) |
| **Brevo** | 🟢 Activo, remitente verificado, E2E verificado | Emails (300/día gratis) | $0 | Solo rotar a `EMAIL_PROVIDER=brevo` en live y vaciar `EMAIL_TEST_RECIPIENTS` |
| **SMTP2GO / Resend** | 🟢 Adaptadores implementados | Alternativas de email | $0 / $0 | — |
| **Gemini API** | 🟢 Operativo | Extracción de datos de la prenda desde la foto | Capa gratis | — |
| **Chilexpress / Starken** | ⚪ Esqueletos | Envíos | — | Opcional; hoy el despacho es manual |
| **Expo / EAS** | 🟡 Configurado (`eas.json`, perfil `beta` → APK Android + iOS interno) | Distribución de la app | $0–30 | Falta **cuenta Expo/EAS** vinculada + Apple Developer + iPhones registrados. **Nunca se ha emitido APK/IPA firmado** |
| **Dominio propio** | ⏸️ Diferido a propósito | — | ~$10–15/año | Decidido: lanzar con la URL de Vercel |

### 7.2 Variables de entorno (nombres y presencia; **ningún valor**)

| Archivo | Presente | Variables (nombres) |
|---|---|---|
| `.env` (raíz) | ❌ ausente | — |
| `.env.local` (raíz) | ✅ presente | `VERCEL_OIDC_TOKEN` |
| `.env.example` (raíz) | ✅ versionado | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `PAYMENT_PROVIDER`, `PAYMENT_PROVIDERS`, `PAYMENT_MODE`, `PAYMENT_BRIDGE_URL`, `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_PUBLIC_KEY`, `MERCADOPAGO_WEBHOOK_SECRET`, `TRANSBANK_ENVIRONMENT`, `TRANSBANK_COMMERCE_CODE`, `TRANSBANK_API_KEY_SECRET`, `FUNCTIONS_PUBLIC_URL`, `EMAIL_PROVIDER`, `EMAIL_FROM`, `EMAIL_TEST_RECIPIENTS`, `RESEND_API_KEY`, `DEFAULT_SHIPPING_PROVIDER`, `SHIPPING_PROVIDER`, `CHILEXPRESS_API_KEY`, `STARKEN_API_KEY` |
| `.env.production.example` | ✅ versionado | los anteriores + `NEXT_PUBLIC_SITE_URL`, `SMTP2GO_API_KEY`, `GEMINI_API_KEY` |
| `apps/web/.env.local` | ✅ presente | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `apps/admin/.env.local` | ✅ presente | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `apps/mobile/.env` | ✅ presente | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` |
| `supabase/.env` | ✅ presente (gitignored) | `PAYMENT_PROVIDER`, `PUBLIC_STORAGE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_ACCESS_TOKEN`, `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_TEST_BUYER_ID`, `MERCADOPAGO_TEST_BUYER_EMAIL`, `MERCADOPAGO_TEST_BUYER_PASSWORD`, `GEMINI_API_KEY`, `BREVO_API_KEY` |

**Ausentes relevantes:** `MERCADOPAGO_WEBHOOK_SECRET` (A-08), `TRANSBANK_*` (Webpay sin credenciales),
`EMAIL_PROVIDER`/`EMAIL_FROM` en el entorno de funciones (Brevo está en `supabase/.env`, falta propagarlo a los
secrets de las Edge Functions), `NEXT_PUBLIC_SITE_URL` en Vercel (solo hay 2 vars configuradas en el proyecto).

**Secretos verificados como NO expuestos al cliente:** `apps/mobile` solo usa `EXPO_PUBLIC_*`; `apps/web` y
`apps/admin` solo exponen `NEXT_PUBLIC_*`; `SUPABASE_SECRET_KEY` aparece únicamente en Route Handlers;
`MERCADOPAGO_ACCESS_TOKEN`, `BREVO_API_KEY`, `GEMINI_API_KEY` solo en Edge Functions. Ningún `.env` real está
versionado (solo `.env.example` y `.env.production.example`).

> ⚠️ **Pendiente heredado:** `docs/checkout-seguridad-2026-10-17/security-review.md:133` documenta que *"en la
> conversación histórica se expuso una clave secreta de Supabase. **Su rotación sigue pendiente**"*. No se reproduce
> ningún valor. **Rotar la service-role key y la del CLI** debería ser una acción P0 operativa.

### 7.3 Discrepancias documentación ↔ implementación ↔ configuración

| Documento | Afirma | Realidad |
|---|---|---|
| `README.md:70-73` | `PAYMENT_PROVIDER=mock` por defecto, `EMAIL_PROVIDER=mock`, `SHIPPING_PROVIDER=manual` | Correcto en código, pero **desactualizado**: MP está implementado y probado, y Brevo está activo |
| `README.md:88-91` | *"Pendiente: `supabase db push`, crear bucket, configurar crons"* | **Desactualizado**: los 20 están aplicados, el bucket existe y los 2 crons están activos (V-9) |
| `docs/DATABASE.md:4`, `docs/SECURITY.md:4` | "24 checks verdes" | El conteo coincide, pero la suite **aborta en T13** (A-28) → falso verde |
| `docs/BETA.md:3` (11-oct) | "implementación local en revisión… no se ha desplegado" | **Muy desactualizado**: hay 20 migraciones aplicadas y 3 Edge Functions desplegadas |
| `docs/BETA.md:50-56` | Resultados locales del 11-oct | Válidos como foto histórica; los `_test.ts` de Deno (17) **no se pudieron re-verificar** aquí (V-14) |
| `docs/PAYMENTS.md:6` | "Sin credenciales reales… opera en mock" | Desactualizado: MP sandbox verificado con pago real el 17-oct |
| `docs/PAYMENTS.md:46` | "Token vive 5 min" vs reserva de 15 min | Discrepancia real con impacto de compra (A-07) |
| `docs/GO-LIVE.md:41-44` | Checklists de Fase 0 sin marcar | Correcto: siguen pendientes (dominio, vars, deploy) |
| `docs/GO-LIVE.md:135-136` | `[pendiente]` en la política de devoluciones | **Verificado**: sigue presente en el código (B-2) |
| `supabase/config.toml:70` | `sql_paths = ["./seed.sql"]` | El archivo no existe (A-38) |
| `package.json` | No hay script `test` raíz | Las 4 suites SQL **más importantes** no se ejecutan en ningún comando (A-28) |

---

## 8. Plan de corrección por etapas

> **Reordenado según la revisión del dueño (20-oct-2026): primero seguridad, después
> reactivar la tienda.** Vercel pausado no impide trabajar contra Supabase, así que
> el plan ya no empieza por el despliegue.
>
> Cada etapa indica **dependencias**, **criterios de aceptación** verificables y su
> **estado actual**.

### Etapa 1 — Cerrar la escalada de privilegios y los permisos de liquidación ✅ **COMPLETADA**
**Depende de:** nada. **Estado:** aplicada en la BD remota el 20-oct-2026.

1. **A-01** → dividir `profiles_owner_rw` en policies por comando, con
   `INSERT` limitado a `role = 'customer'`, y añadir `profiles_admin_update`
   (que además arregla el toggle roto, **A-39**).
   → `supabase/migrations/20261020000000_security_profiles_payments.sql`
2. **A-05** → `payments` pasa a solo lectura para `anon`/`authenticated`
   (`revoke insert, update, delete`) y `mark_order_paid` queda ejecutable solo por
   `service_role`.
3. **A-28 + A-40** → T13 acepta `search_path = ""`; `setup_local.sql` crea el stub
   de `supabase_migrations.schema_migrations` para que el entorno local coincida
   con el remoto.
4. Tests nuevos: T14, T15a, T15b, T16 y T12b reescrito.

**Criterio de aceptación:** ✅ Cumplido — suite SQL **T0–T16 en verde** (y las otras
3 suites SQL), sonda `supabase/tests/security_probe.mjs` **10/10** contra la BD real
con limpieza verificada, y `supabase migration list` con **21/21** aplicadas.

### Etapa 2 — Corregir el aislamiento de cuentas en la web ✅ **COMPLETADA**
**Depende de:** Etapa 1. **Estado:** completada el 20-oct-2026.

1. **A-02** → claves de consulta privadas **con el id de la cuenta**
   (`["my-orders", userId]`, `["order-detail", id, userId]`, `["quote", owner, sig]`)
   + purga de la cuenta anterior en cada cambio de sesión
   (`apps/web/src/lib/privateData.ts`, `apps/web/src/lib/session.tsx`).
2. **A-42** → limpiar el checkout pendiente del invitado al cerrar sesión.
3. Test: `apps/admin/tests/web-account-isolation.spec.ts` (navegación cliente).

**Criterio de aceptación:** ✅ Cumplido — el E2E **falla con el código anterior**
(B veía el pedido de A) y **pasa con el nuevo**; suite E2E completa **12/12**.

### Etapa 3 — Probar y endurecer cancelación, reserva y pago tardío ⏳ **SIGUIENTE**
**Depende de:** Etapa 1 (hecha).

1. **Reproducir primero** la carrera completa de **A-03** en Postgres aislado con
   **dos conexiones concurrentes** (webhook llegando durante el `UPDATE` de
   cancelación). **No** endurecer la policy antes de tener esa evidencia.
2. Según el resultado, endurecer `orders_owner_cancel` (o un trigger
   `BEFORE UPDATE OF status`) para que no se pueda cancelar con un pago vivo.
3. **A-06** → reembolso automático en `REFUND_REQUIRED` + email al cliente
   (hoy el dinero queda colgado hasta que un operador lo reembolse a mano).
4. **A-16** → expiración y revocación de `guest_token`.
5. **A-10** → `try/catch` en `loadPendingCheckout` móvil + recuperar el intento sin `input`.
6. **A-18** → mover el `reset` de dirección a un `useEffect` con `keepDirtyValues`.
7. **A-09 + A-15** → `expected_total_clp` con 409 `PRICE_CHANGED`; validar `total_clp > 0`.
8. **A-12** → ampliar las transiciones a `REFUNDED` y pre-marcar el reembolso antes de llamar al proveedor.
9. **A-11** → `X-Idempotency-Key` en la preferencia + columna única para el id real del pago.

**Criterio de aceptación:** con dos conexiones concurrentes, cancelar con pago vivo
no libera stock y no produce un pedido `PAID` sin cobro; un pago tardío produce
**exactamente un reembolso automático** y un email al cliente.

### Etapa 4 — Resolver la recuperación de pedidos invitados y el webhook ⏳ **SIGUIENTE**
**Depende de:** Etapa 3 (A-06 comparte el camino de pago).

1. **A-04** → persistir la lista de pedidos de invitado y mostrar/enviar el
   `order_id` (hoy el invitado **no puede recuperar su pedido** tras cerrar la app).
2. **A-08** → configurar `MERCADOPAGO_WEBHOOK_SECRET` y `notification_url`; probar
   con firma real (P-5).
3. **A-07** → parametrizar el host del bridge de Webpay por
   `TRANSBANK_ENVIRONMENT`/`PAYMENT_MODE` (hoy está atado a `webpay3gint`) y avisar
   del límite de 5 min del token frente a la reserva de 15 min.
4. Ejecutar la matriz completa de `docs/BETA.md:29-35` (aprobación, rechazo,
   cancelación, expiración y reembolso en ambos proveedores).

**Criterio de aceptación:** el invitado recupera su pedido sin copiar nada a mano y
pide la devolución dentro de los 10 días; un webhook firmado liquida el pedido y uno
mal firmado devuelve 401.

### Etapa 5 — Completar la información pendiente y validar compra, despacho y reembolso ⏳ **SIGUIENTE**
**Depende de:** datos del dueño y del proveedor.

1. **B-2** → completar razón social, RUT, domicilio, correo y plazo en
   `/legal/privacidad` y `/devoluciones` (quitar todos los `[pendiente]`).
2. **A-13** → eventos de email `return_requested` / `return_rejected` (la UI ya
   promete ese correo).
3. **A-14** → alerta de `refund_state = 'review'` en el dashboard del admin.
4. **A-41** → mover el `router.replace("/")` del login web a un `useEffect`.
5. **P-1** (E2E de compra completo) y **P-6** (E2E móvil en dispositivo).
6. Cargar tarifas reales por zona + umbral de envío gratis.
7. Rotar la service-role key de Supabase y la del CLI (pendiente heredado).

**Criterio de aceptación:** `grep -rn "\[pendiente\]" apps/web/src` → 0 resultados;
un flujo compra → despacho → entrega → devolución completo pasa de punta a punta.

### Etapa 6 — Reactivar la tienda para lanzamiento ⏳ **SIGUIENTE**
**Depende de:** Etapas 1–5 validadas. **Responsable:** el dueño (confirmación interactiva).

1. `vercel project resume shopy-web --scope leandro-mirandas-projects` → confirmar con `Y`.
2. `vercel deploy --prod --scope leandro-mirandas-projects --project shopy-web` desde `apps/web`.
3. Verificar que las 19 rutas responden 200 y que el sitio muestra el catálogo.
4. Considerar un cron diario que haga `curl` al sitio (evita la pausa por inactividad
   del plan Hobby) — **$0**.
5. KYC de MercadoPago + `PAYMENT_MODE=live` **antes** de abrir la venta real.

**Criterio de aceptación:** `curl -s -o /dev/null -w "%{http_code}" https://shopy-web-six.vercel.app/catalogo` → `200`, `/producto/<slug>` renderiza el nombre de la prenda, y una compra real en sandbox pasa de punta a punta sobre el sitio desplegado.

### Pendientes transversales (cualquier momento)
- **A-25** → cron de purga de huérfanos de Storage.
- **A-23/A-24** → cupones y bucket de imágenes.
- **A-33/A-34** → filtros de talla/condición/precio y favoritos en la web.
- **A-35/A-36** → `viewport-fit=cover` + `env(safe-area-inset-*)`; chips a 44 px.
- **P-11** → CI que ejecute las 4 suites SQL (ya son ejecutables en local).
- **A-27** → hacer idempotentes las 6 migraciones fundacionales.
- **A-30/A-31/A-32** → `revoke` explícitos y `REVOKE EXECUTE ON ALL FUNCTIONS` como default.

---

## 9. Archivos clave para que revise otro agente

| # | Archivo | Por qué |
|---|---|---|
| 1 | `supabase/migrations/20260928000001_rls_policies.sql` | 43 policies + 4 grants globales. Origen de A-01 (`:75-76`), A-03 (`:119-121`), A-23 (`:165-166`), A-32 (`:39`) |
| 2 | `supabase/migrations/20260929000004_hardening.sql` | Endurecimiento: `:42-57` guard incompleto (A-01), `:76-89` revokes (A-32), `:190-191` (A-31) |
| 3 | `supabase/functions/checkout/index.ts` | Orquestador de pagos. `:128-257` quote, `:245-247` (A-15), `:310-316` idempotencia, `:369-375` timing-safe, `:392-400` BOLA, `:418` (A-05), `:354` (A-06), `:520-528` (A-12) |
| 4 | `supabase/functions/_shared/payment.ts` | MP + Webpay. `:139-164` firma HMAC, `:151/193` (A-08), `:169/201` (A-11), `:228` criterio de entorno del refund |
| 5 | `apps/web/src/lib/session.tsx` + `apps/web/src/lib/privateData.ts` | **A-02 ya corregido**: purga de la cuenta anterior al cambiar de sesión |
| 6 | `apps/web/src/app/pedidos/page.tsx` + `apps/web/src/app/pedido/[id]/page.tsx` | `queryKey` con `user id` (A-02 corregido); formulario del invitado (A-04) |
| 7 | `apps/web/src/lib/pendingCheckout.ts` + `apps/mobile/src/lib/pendingCheckout.ts` | Idempotencia persistida; corrupto/bloqueo (A-10), secreto en claro (A-17) |
| 8 | `apps/mobile/src/auth/AuthContext.tsx` | **El patrón correcto** de limpieza de caché (referencia; la web ya lo sigue) |
| 9 | `apps/mobile/app/checkout.tsx` | `reset()` en el `queryFn` (A-18); flujo de compra móvil |
| 10 | `apps/mobile/src/stores/useShopStore.ts` + `apps/web/src/lib/cart.tsx`/`cartStore.ts` | Fusión con semántica divergente (A-19); last-writer-wins (A-21) |
| 11 | `supabase/migrations/20260928000000_init_schema.sql` | Esquema base: `reserve_products` (`:264-302`), `mark_order_paid` (`:456-486`), `check_order_transition` (`:425-433`), `validate_discount_code` (`:577-599`) |
| 12 | `supabase/migrations/20261017233000_checkout_sandbox_prerequisites.sql` | `settle_checkout_payment` (`:76-97`), `release_cancelled_order` (`:103-116`), pago tardío (`:89-93`) |
| 13 | `supabase/migrations/20261019140000_return_requests.sql` | RMA: `request_return`, `restore_order_products`, `finish_checkout_refund` (`:87-108`) |
| 14 | `supabase/migrations/20261019130000_reconcile_beta_remote.sql` | `claim_order_notification` (`:29-42`), `sync_my_cart` (`:77-110`) |
| 15 | `supabase/migrations/20261018120000_unique_prenda_mode_test.sql` | Reescritura de datos (A-29); su `insert` en `schema_migrations` rompía el entorno local (A-40) |
| 16 | `apps/admin/src/app/productos/[id]/page.tsx` | `ImagesManager` (fotos, 44 px, drag & drop) + consumidor de `image_cleanup` (A-25) |
| 17 | `apps/admin/src/app/pedidos/[id]/page.tsx` | Refund (A-12), reintento de correo, aprobación de devolución (A-13) |
| 18 | `apps/web/src/app/api/payments/start/route.ts` | Atado al host sandbox (A-07) |
| 19 | `apps/web/src/app/checkout/page.tsx` | Flujo de compra web; `busy` guard; `clear()` (A-20); total no comparado (A-09) |
| 20 | `apps/web/src/app/legal/privacidad/page.tsx` + `apps/web/src/app/devoluciones/page.tsx` | Placeholders legales (B-2) |
| 21 | `supabase/tests/rls_tests.sql` | **T0–T16**; T12b reescrito (A-39), T13 corregido (A-28), T14/T15/T16 nuevos (A-01, A-05) |
| 22 | `supabase/migrations/20261020000000_security_profiles_payments.sql` | **La corrección de la Etapa 1** (A-01, A-05, A-39): policies de `profiles`, permisos de `payments`, `EXECUTE` de `mark_order_paid` |
| 23 | `supabase/tests/security_probe.mjs` | Sonda funcional contra la BD real (10 casos); crea y borra usuarios de prueba |
| 24 | `supabase/tests/setup_local.sql` | Stub de `auth`/`storage`/`supabase_migrations`; sin él el entorno local iba una migración atrás (A-40) |
| 25 | `apps/admin/tests/photo-flow.spec.ts` | E2E de fotos sobre BD y Storage reales; **el modelo a replicar** para el checkout (P-1) |
| 26 | `apps/admin/tests/web-account-isolation.spec.ts` | **Regresión de A-02**: dos cuentas reales en el mismo navegador, con navegación cliente |
| 27 | `apps/admin/tests/helpers/supabase-admin.ts` | Helpers de datos de prueba (`createTempUser`, `createTestOrder`) y limpieza |
| 28 | `docs/mercadopago-sandbox-2026-10-17/VERIFICACION.md` | La evidencia de producción más valiosa (pago real `:49`, pago tardío `:81`, webhook nunca ejercitado `:19,88`) |
| 29 | `docs/BETA.md` | La matriz obligatoria **antes de entregar** (`:27-36`) — sigue sin ejecutarse |
| 30 | `docs/GO-LIVE.md` | Plan de lanzamiento vigente; los checklists de `:41-44` y `:75-80` siguen sin marcar |

---

## 10. Preguntas pendientes y aspectos no comprobables

### 10.1 Preguntas para el dueño (necesitan una decisión o un dato)

1. ¿El despliegue pausado de Vercel fue por inactividad del plan Hobby o por otro motivo (límite de deployments, abuso)? Cambia la solución: si es el límite diario, hay que esperar; si es inactividad, el cron de keep-alive lo resuelve.
2. ¿Existe cuenta Transbank/Webpay? Sin ella, **Webpay no puede anunciarse** (A-07), aunque el código esté listo.
3. ¿Cuál es la razón social, RUT y domicilio que deben aparecer en las páginas legales? (B-2, bloqueante para vender).
4. ¿El enlace de confirmación de Webpay que usa el bridge (`/api/payments/start`) está registrado como `return_url` en Transbank?
5. ¿Se acepta que el correo al invitado incluya su `order_id` (UUID) para que pueda recuperar el pedido? (A-04)
6. ¿El cupón de 100 % es un caso de negocio real o un error de configuración? (A-15)
7. ¿Se quiere una alerta al admin cuando un pago queda en `review`, o se prefiere revisar el listado a diario? (A-14)

### 10.2 Aspectos que no pude comprobar

1. **Ninguna comprobación de interfaz** — el sitio público está caído y no hay dispositivo iOS/Android ni emulador. Toda la columna "Comprobación real de UI" de §3 está vacía por esta razón.
2. **Ningún pago real** ni de MercadoPago ni de Transbank. La evidencia de MP proviene de `docs/mercadopago-sandbox-2026-10-17/VERIFICACION.md` (17-oct), no de esta auditoría.
3. **Las 4 suites SQL de RLS no se ejecutaron** (sin Docker/Postgres efímero). Sus hallazgos (A-01, A-03, A-16, A-28) se derivan de la lectura de las migraciones **y** de la consulta del catálogo remoto; la confirmación en ejecución queda pendiente.
4. **Los 17 tests Deno** de `_shared/` no se corrieron (no hay binario `deno`).
5. **Los 3 smoke tests** (`smoke_fase4/5/6.mjs`) no se ejecutaron (requieren stack local o escritura en remoto).
6. **No se ejecutó ningún exploit** contra la BD remota: A-01, A-02, A-03, A-05 y A-10 están verificados por código + catálogo, no por ejecución destructiva.
7. **Concurrencia real**: la validación con PGlite no prueba carreras entre conexiones. El locking de `reserve_products` (`FOR UPDATE`) es correcto por lectura, pero sin test concurrente.
8. **La app móvil nunca se ha ejecutado en un dispositivo**: teclado, teclado virtual, safe area, texto grande, contraste y el comportamiento del `SafeAreaView` en las 7 pantallas que **no** usan el componente `<Screen>` (catalogo, categoría, colección, pedido, pedidos, producto, index) no están verificados.
9. **EAS / firma de la app**: no se verificó que el bundle de producción enlace `EXPO_PUBLIC_SUPABASE_URL` correctamente en un APK/IPA.
10. **El limite del plan Free de Supabase** (500 MB de BD / 1 GB de Storage / 500 MB de egress) no se midió contra el consumo actual (29 productos, 50 imágenes, 4 pedidos).
11. **La claims de "24 checks verdes"** en `docs/DATABASE.md` y `docs/SECURITY.md` no se pudieron re-verificar por A-28.
12. **`npm audit`**: no se evaluó si alguna de las 25 vulnerabilidades (todas de la cadena Expo/Metro) es alcanzable en el build de producción de la app o en el servidor web. La clasificación "solo build-time" es inferida del árbol de dependencias, no verificada con un SCA del bundle final.

---

## Resumen para compartir con otro agente

**Qué está construido.** Un e-commerce de ropa de segunda mano con tres frontends (web Next 16, panel admin, app Expo) sobre Supabase. El backend de operación está **completo y bien diseñado**: checkout idempotente con clave persistida antes de la red, reserva atómica de prenda única (`SELECT … FOR UPDATE`, TTL 15 min, cron cada minuto), liquidación idempotente, RLS en las **27/27** tablas, webhook de MercadoPago con firma HMAC timing-safe, 4 adaptadores de email con deduplicación atómica, RMA con ventana de 10 días, y un E2E de Playwright (12/12 verde) sobre BD y Storage reales.

**Qué está verificado.** `tsc` (4 workspaces), `eslint --max-warnings 0`, `next build` de web y admin, **60/60** tests de `test:beta`, todas las suites de checkout en verde, **la suite SQL completa (T0–T16 + beta + admin_images + sandbox) ejecutada en Docker y en verde**, las **21/21** migraciones aplicadas en remoto, los 2 crons activos, las 3 Edge Functions desplegadas y respondiendo, y una **sonda funcional contra la BD real (10/10 casos OK, sin residuos)**.

**Lo que ya se corrigió (Etapas 1 y 2, 20-oct-2026).**
- **A-01** — escalada de privilegios a `admin`: **cerrada** (policies por comando; el `INSERT` exige `role='customer'`). Verificada en rojo y en verde.
- **A-05** — fabricación de aprobaciones y liquidación directa: **cerrada** (`payments` solo lectura para clientes y admins; `mark_order_paid` solo `service_role`). El arreglo es de **permisos**, no "consultar siempre al proveedor".
- **A-02** — fuga de pedidos entre cuentas en la web: **cerrada** (clave de consulta por usuario + purga de la cuenta anterior) con E2E de regresión.
- **A-39** (nuevo) — el toggle "Hacer admin" del panel **estaba roto** (RLS sin policy de UPDATE para admins) y su test daba verde falso: **arreglado**; el test ahora lee el rol resultante.
- **A-28 / A-40** (nuevos) — la suite SQL **abortaba en T13** y el entorno local iba **una migración por detrás** del remoto: **arreglados**; las 4 suites SQL ahora se ejecutan.

**Los diez riesgos principales (estado actual).**
1. 🔴 **B-1** — El sitio público está **caído** (Vercel pausado, 503). La beta no tiene URL.
2. 🔴 **B-3** — Sin `MERCADOPAGO_WEBHOOK_SECRET`, MercadoPago **nunca notifica**: la única liquidación es el "Ya pagué" del cliente.
3. 🔴 **A-06** — El pago tardío deja el dinero cobrado **sin reembolso automático ni email** (ya consta en producción).
4. 🔴 **A-04** — El invitado **no puede recuperar su pedido** tras cerrar la app (el token se borra y el UUID nunca se muestra ni se envía por correo) → no puede ejercer el retracto de la Ley 19.496.
5. 🔴 **A-07** — Webpay está **atado al host sandbox** (no hay ruta live) y **nunca se validó E2E**.
6. 🟠 **A-03** — El cliente puede cancelar su pedido con el pago en vuelo. **Reclasificado**: no hay sobreventa (`settle_checkOUT` se niega a liquidar y devuelve `REFUND_REQUIRED`); el daño es **cobro sin contraparte** con reembolso manual. La carrera completa está **sin probar** → Etapa 3.
7. 🟠 **A-09 + A-15** — El precio puede cambiar entre la cotización y el cobro sin aviso, y no se valida `total_clp > 0`.
8. 🟠 **A-12** — Reembolsar en `PREPARING`/`SHIPPED` devuelve el dinero en el proveedor pero rompe la BD (transición ilegal).
9. 🟠 **B-2** + **A-13** — Páginas legales con `[pendiente]` (bloqueante para vender) y la devolución promete un correo que no existe.
10. 🟡 **A-10 + A-16 + A-18** — El checkout móvil puede quedar bloqueado, el `guest_token` no expira y el prefill de dirección borra lo tecleado.

**Siguiente paso recomendado (orden del dueño).** **Etapa 3**: reproducir primero la carrera de cancelación/reserva/pago tardío en Postgres aislado con dos conexiones y, **con esa evidencia**, endurecer la policy; en paralelo, cerrar **A-06** (reembolso automático + email). Después, **Etapa 4** (recuperación del invitado + webhook de MP con firma real + Webpay parametrado) y **Etapa 5** (datos legales + E2E de compra). Solo al final, **Etapa 6**: reanudar Vercel y publicar. **No declarar la beta lista por el hecho de que compile y las pruebas simuladas pasen:** la evidencia más fuerte del proyecto sigue siendo el E2E de fotos del admin (el módulo menos riesgoso); el checkout, donde está el dinero, **sigue sin ningún E2E**.

---

*Auditoría generada el 2026-10-20 contra `master` @ `5b77152`; revisada por el dueño el mismo día y ampliada con la remediación de las Etapas 1 y 2 (migración `20261020000000` aplicada en la BD remota).*
