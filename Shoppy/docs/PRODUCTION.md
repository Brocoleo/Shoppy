# PRODUCTION — Checklist Shopy

> Todo lo implementable sin credenciales está hecho (Fases 1–10). Este
> documento lista el camino a producción real y lo que se necesita del dueño.

## 1. Proyecto Supabase remoto

- [ ] Crear proyecto en Supabase Cloud (región cercana a Chile).
- [ ] `supabase link` + `supabase db push` (aplica migraciones 20260928–20260929,
      incluido hardening + límites del bucket).
- [ ] Verificar en el dashboard: trigger `profiles_guard_role`, bucket
      `product-images` (5 MB, jpeg/png/webp), policies en `orders`/`order_items`.
- [ ] Re-ejecutar `supabase/tests/rls_tests.sql` contra la rama de staging
      (con roles anon/authenticated, no como superuser).

## 2. Secrets (dashboard → Edge Functions → Secrets)

| Secret | Cuándo |
|---|---|
| `SUPABASE_URL` / service key | Automáticos en Cloud |
| `PAYMENT_PROVIDER` | `mock` hasta homologar; luego `mercadopago` o `transbank` |
| `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET` | Al activar MP (sandbox primero) |
| `FUNCTIONS_PUBLIC_URL` | URL pública para `notification_url` de MP |
| `TRANSBANK_ENVIRONMENT`, `TRANSBANK_COMMERCE_CODE`, `TRANSBANK_API_KEY_SECRET` | TEST funciona sin credenciales propias; LIVE exige las reales |
| `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM` | Al activar emails (verificar dominio `shopy.cl` en Resend) |

Jamás commitear estos valores (solo `.env.example`, sin secretos).

## 3. Pagos: orden de activación

1. `PAYMENT_PROVIDER=mock` — flujo completo sin dinero (ya validado por
   `smoke_fase6.mjs` en local).
2. Transbank TEST — usa códigos públicos de integración (sin credenciales).
3. Mercado Pago sandbox — credenciales de prueba + webhook con firma HMAC
   (ya verificada en `verifyMercadoPagoSignature`, testeada).
4. LIVE — credenciales productivas + `TRANSBANK_ENVIRONMENT=LIVE`.

## 4. Dominios y apps

- [ ] Dominio `shopy.cl` verificado en Resend (para `EMAIL_FROM`).
- [ ] `site_url` y redirect URLs de Auth apuntando al dominio real.
- [ ] Mobile: `EXPO_PUBLIC_SUPABASE_URL`/`_ANON_KEY` de producción + build
      con `eas build` (ya incluye `expo-image` con caché de disco).
- [ ] Admin: `NEXT_PUBLIC_*` de producción, deploy (Vercel u otro).

### Deploy web en Vercel (monorepo)

El proyecto Vercel `shopy-web` tiene **Root Directory = raíz del repo** (no `Shoppy/`).
Por eso la config del build vive en **`vercel.json` en la raíz del repo**; el
`Shoppy/vercel.json` se ignora en los deploys git (solo aplica si alguien fija
Root Directory = `Shoppy`).

- `outputDirectory`: `Shoppy/apps/web/.next` (relativo a la raíz del repo).
- `installCommand`/`buildCommand`: entran a `Shoppy/` y construyen el workspace `apps/web`.
- Sintoma de desalineación: build "success" pero **todas las rutas dan 404**
  (`x-vercel-error: NOT_FOUND`), incluidos los assets `/_next/*`. Significa que
  Vercel no encontró la app (Root Directory / `vercel.json` desalineados).
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` deben existir también
  en el entorno **Preview**; si faltan, los previews muestran
  "La tienda no está disponible en este momento" (el build no las inyecta).

## 5. Verificación post-deploy

- [ ] Smoke `fase6` adaptado a la URL productiva (guest + authed + cupón).
- [ ] Webhook MP real: pago sandbox aprobado → pedido `PAID` + email.
- [ ] Rate-limit 429 visible solo bajo abuso (no en uso normal).
- [ ] Logs de Edge Functions sin `INTERNAL` en 24 h.

## Bloqueado en el dueño (no técnico)

Entregar: credenciales MP o TBK LIVE, API key Resend + dominio verificado,
credenciales carriers (Chilexpress/Starken) si se activan, y cuentas de
deploy (EAS, hosting admin).
