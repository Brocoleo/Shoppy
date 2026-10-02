# Shopy — E-commerce chileno de ropa de segunda mano

Monorepo: app móvil (Expo), panel admin (Next.js), paquetes compartidos y Supabase.

> Estado: **Fase 1 — Foundation** (ver `docs/PROGRESS.md`).

## Requisitos

- Node.js >= 20
- npm >= 10
- Cuenta Supabase (para Fase 2+)
- Expo Go en el teléfono o emulador (para mobile)
- Xcode / Android Studio solo si compilas nativo (no necesario para Expo Go)

## Estructura

```text
apps/
  mobile/     # Expo + Expo Router + TypeScript (iOS/Android/Web)
  admin/      # Next.js + TypeScript (panel administrativo)
packages/
  types/      # Modelos TS compartidos
  validation/ # Schemas Zod (checkout, dirección, carrito)
  shared/     # Formato CLP, constantes, helpers
supabase/
  migrations/ # Migraciones SQL versionadas (Fase 2)
  functions/  # Edge Functions (pagos/webhooks, Fase 8)
  seed/       # Seed de desarrollo ~20 productos (Fase 2)
docs/
  ARCHITECTURE.md
  DATABASE.md
  PAYMENTS.md
  SECURITY.md
  PROGRESS.md
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
`service_role` solo en Edge Functions / server-side, jamás en mobile.

## Supabase / base de datos

- Migraciones versionadas en `supabase/migrations/` (schema → RLS → seed → storage).
- Tipos espejo en `packages/types/src/db.ts`.
- Suite de validación local sin proyecto remoto: `supabase/tests/README.md`
  (Postgres 16 en Docker + 12 grupos de tests RLS/reglas críticas).
- **Desarrollo local con stack completo**: `supabase start` (API
  `http://127.0.0.1:54321`, Studio `:54323`), luego
  `node supabase/seed/upload-placeholders.mjs` con `SUPABASE_URL` y
  `SUPABASE_SECRET_KEY`, y `node supabase/tests/smoke_fase4.mjs` con
  `SUPABASE_URL` y `SUPABASE_ANON_KEY` (mismas vars sirven contra remoto).
- Mobile lee `apps/mobile/.env` (`EXPO_PUBLIC_SUPABASE_URL`,
  `EXPO_PUBLIC_SUPABASE_ANON_KEY`); sin ellas opera con datos mock.
- Detalle del modelo: `docs/DATABASE.md`. Policies: `docs/SECURITY.md`.

## Scripts

| Comando | Descripción |
|---|---|
| `npm run mobile` | Expo dev server |
| `npm run admin` | Next.js dev server |
| `npm run typecheck` | TypeScript global (mobile+admin+packages) |
| `npm run lint` | ESLint |

## Decisiones arquitectónicas

Ver `docs/ARCHITECTURE.md`. Resumen Fase 1:

- npm workspaces (simple, sin Turborepo por ahora).
- TanStack Query + Zustand + React Hook Form + Zod como estándar (instalación real en Fase 3+).
- PaymentProvider / EmailProvider / ShippingProvider desacoplados (interfaces en Fase 6+).
- Precios solo en CLP (`priceClp: number`, enteros, sin decimales).
