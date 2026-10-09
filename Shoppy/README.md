# Shopy — E-commerce chileno de ropa de segunda mano

Monorepo: app móvil (Expo), panel admin (Next.js), paquetes compartidos y Supabase.

> Estado: **Fase 10 — Hardening ✅** (ver `docs/PROGRESS.md`).

## Requisitos

- Node.js >= 20
- npm >= 10
- Cuenta Supabase (solo para proyecto remoto; en local basta Docker)
- Expo Go en el teléfono o emulador (para mobile)
- Xcode / Android Studio solo si compilas nativo (no necesario para Expo Go)

## Estructura

```text
apps/
  mobile/     # Expo + Expo Router + TypeScript (iOS/Android/Web)
  admin/      # Next.js + TypeScript (panel administrativo)
packages/
  types/      # Modelos TS compartidos (+ espejo del schema Supabase)
  validation/ # Schemas Zod (checkout, dirección, carrito)
  shared/     # Formato CLP, constantes, helpers
supabase/
  migrations/ # Migraciones SQL versionadas (schema → RLS → seed → storage)
  functions/  # Edge Functions (checkout confirm/notify)
  seed/       # Seed de desarrollo ~20 productos + placeholders
  tests/      # Suite RLS (24 checks) + smoke tests contra local/remoto
docs/
  ARCHITECTURE.md
  DATABASE.md
  PAYMENTS.md
  SECURITY.md
  PROGRESS.md
  PRODUCTION.md
  AGENT_SKILLS.md
.opencode/
  skills/     # Skills aplicadas en Fase 10 (supabase, api-security-review, …)
```

## Instalación

```bash
npm install
cp .env.example .env
# completar SUPABASE_URL y SUPABASE_ANON_KEY cuando exista el proyecto
```

## Ejecución

```bash
# Mobile (Expo)
npm run mobile
# escanear QR con Expo Go, o presionar `a` (Android) / `i` (iOS) / `w` (web)

# Admin (Next.js)
npm run admin
# abrir http://localhost:3000
```

## Variables de entorno

Ver `.env.example`. Nunca commitear secretos reales.
`SUPABASE_SERVICE_ROLE_KEY` solo en Edge Functions / scripts server-side,
jamás en mobile.

Providers desacoplados (mock por defecto, sin credenciales reales):
`PAYMENT_PROVIDER=mock` (mock | mercadopago | transbank),
`EMAIL_PROVIDER=mock` (mock | resend),
`SHIPPING_PROVIDER=manual` (manual | chilexpress | starken).

## Supabase / base de datos

- Migraciones versionadas en `supabase/migrations/` (schema → RLS → seed → storage).
- Tipos espejo en `packages/types/src/db.ts` (regenerar con
  `supabase gen types` cuando exista proyecto remoto).
- Suite de validación local sin proyecto remoto: `supabase/tests/README.md`
  (Postgres 16 en Docker + 24 checks RLS/reglas críticas + smoke 16/16,
  todo verde en Fase 10).
- **Desarrollo local con stack completo**: `supabase start` (API
  `http://127.0.0.1:54321`, Studio `:54323`), luego
  `node supabase/seed/upload-placeholders.mjs` con `SUPABASE_URL` y
  `SUPABASE_SECRET_KEY`, y `node supabase/tests/smoke_fase6.mjs` con
  `SUPABASE_URL` y `SUPABASE_ANON_KEY` (mismas vars sirven contra remoto).
- **Pendiente (requiere proyecto Supabase remoto + credenciales)**:
  `supabase db push`, crear bucket `product-images` + subir placeholders,
  configurar crons (`release_expired_reservations` cada minuto,
  `refresh_trending_scores` cada 15 min), re-correr tests contra remoto.
  Detalle: `docs/PRODUCTION.md`.
- Mobile lee `apps/mobile/.env` (`EXPO_PUBLIC_SUPABASE_URL`,
  `EXPO_PUBLIC_SUPABASE_ANON_KEY`); sin ellas opera con datos mock.
- Detalle del modelo: `docs/DATABASE.md`. Policies: `docs/SECURITY.md`.

## Scripts

| Comando | Descripción |
|---|---|
| `npm run mobile` | Expo dev server |
| `npm run mobile:android` / `:ios` / `:web` | Expo en plataforma específica |
| `npm run admin` | Next.js dev server |
| `npm run admin:build` | Build producción del panel |
| `npm run typecheck` | TypeScript global (mobile+admin+packages) |
| `npm run mobile:typecheck` / `admin:typecheck` | Typecheck por app |
| `npm run lint` | ESLint (`--max-warnings 0`) |
| `npm run lint:fix` | ESLint con autofix |

## Decisiones arquitectónicas

Ver `docs/ARCHITECTURE.md`. Resumen Fase 10:

- npm workspaces (simple, sin Turborepo por ahora).
- TanStack Query + Zustand + React Hook Form + Zod como estándar.
- PaymentProvider / EmailProvider / ShippingProvider desacoplados
  (interfaces reales desde Fase 6+; implementaciones mock vigentes).
- Precios solo en CLP (`priceClp: number`, enteros, sin decimales).
- Checkout: dueño exige JWT, invitado exige `guest_token` timing-safe
  (fix BOLA); `return_url` restringido a `shopy://|https://`.
- Funciones DEFINER con `search_path` fijo + guard de regresión T13.
- Backlog conocido: estados offline-paused con NetInfo
  (requiere dev build, no Expo Go).
