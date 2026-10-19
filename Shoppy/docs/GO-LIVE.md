# GO-LIVE — Estado real y pasos para producción

> Documento vivo. Reemplaza/actualiza el checklist anterior: **gran parte del
> backend de operación ya está implementado**. Lo que falta es, sobre todo,
> **configuración y cuentas externas**, más 3 features acotadas.
>
> Última revisión de código: 19-oct-2026. Revisar `docs/PRODUCTION.md`
> (deploy Vercel) y `docs/PAYMENTS.md` (pagos) para detalle.

---

## 0. Resumen: código vs. configuración

| Área | Código | Falta |
|---|---|---|
| **Pagos (MP)** | ✅ completo (sandbox E2E probado) | Credenciales **live** + webhook prod + KYC |
| **Envíos (tarifas)** | ✅ `shipping_rates` + buckets 16 regiones + CRUD admin + selector checkout | Cargar **precios reales** por zona |
| **Envíos (tracking)** | ✅ tabla `shipments` + botón “Despachar” admin + cliente ve tracking | — |
| **Emails** | ✅ 7 eventos + Resend + idempotencia (`order_notifications`) | `RESEND_API_KEY` + dominio verificado + `EMAIL_PROVIDER=resend` |
| **Reservas / cron** | ✅ `release_expired_reservations` + `refresh_trending_scores` en `pg_cron` | Verificar `pg_cron` activo en Cloud |
| **Reembolsos** | ⚙️ RPC `finish_checkout_refund` existe | Flujo RMA cliente (solicitud) + política real |
| **Retiro en tienda** | ❌ | Opción pickup en checkout + notificación |
| **Facturación SII** | ❌ | Integración (LibreDTE/Facturama) |
| **Dominio** | ⚙️ Vercel linkeado (`shopy-web`) | Apuntar `vintah.net` + `NEXT_PUBLIC_SITE_URL` |
| **Carrier en vivo** | ⚙️ esqueletos `chilexpress`/`starken` | Homologación API (opcional) |

**Conclusión:** es viable lanzar sin escribir más backend, cargando tarifas
reales, activando Resend y MP live. Pickup, RMA y SII son incrementos.

---

## 1. Fase 0 — Dominio, DNS y variables (bloqueante)

- [ ] **DNS `vintah.net` → Vercel** (`shopy-web`):
  - `A  @  76.76.21.21`
  - `CNAME  www  cname.vercel-dns.com`
  - (Si el registrador es Cloudflare: proxy OFF o “DNS only” hasta validar.)
- [ ] Añadir `vintah.net` y `www.vintah.net` en Vercel → Project → Domains.
- [ ] `NEXT_PUBLIC_SITE_URL=https://vintah.net` (Production **y** Preview).
- [ ] Subir variables: `cp .env.production.example .env.production` → rellenar
      → `./scripts/setup-vercel-env.sh .env.production production`.
- [ ] `vercel --prod` y verificar que `https://vintah.net` carga con candado.

> El mismo `NEXT_PUBLIC_*` debe existir en **Preview** o los previews muestran
> “La tienda no está disponible” (ver `docs/PRODUCTION.md`).

---

## 2. Secrets de Supabase (Edge Functions)

Dashboard → Project Settings → Edge Functions → Secrets, o
`supabase secrets set --env-file .env.production` con el CLI linkeado.

| Secret | Valor | Cuándo |
|---|---|---|
| `PAYMENT_PROVIDER` / `PAYMENT_PROVIDERS` | `mercadopago` | Al activar |
| `PAYMENT_MODE` | `live` | Al activar live |
| `MERCADOPAGO_ACCESS_TOKEN` / `_PUBLIC_KEY` / `_WEBHOOK_SECRET` | live | Tras KYC |
| `FUNCTIONS_PUBLIC_URL` | `https://evzlqwiipdjgtrqjlwba.supabase.co/functions/v1` | Ya |
| `EMAIL_PROVIDER` | `resend` | Al activar emails |
| `RESEND_API_KEY`, `EMAIL_FROM` | Resend | Al activar |
| `GEMINI_API_KEY` | capa gratis | Ya (rotada) |

---

## 3. Fase 1 — MercadoPago LIVE

- [ ] Completar KYC en MercadoPago (RUT, cuenta bancaria). 1–2 días hábiles.
- [ ] Copiar credenciales **productivas** (`APP_USR-...`) a secrets y `.env.production`.
- [ ] `PAYMENT_MODE=live`.
- [ ] Webhook productivo → `https://<functions>/payments/return` (o el bridge web
      `/api/payments/return` según el diseño actual; revisar `docs/PAYMENTS.md`).
- [ ] Prueba real: compra mínima y **reembolso** de verificación.

---

## 4. Fase 2 — Envíos (solo datos reales)

El motor existe. Pasos:

- [ ] Definir **precios por zona** (costo real courier + margen) y cargarlos en
      `/admin/envios`. Zonas ya soportadas (`_shared/chile.ts`):
      `Metropolitana · Valparaíso · Biobío · Araucanía · Los Lagos · OTRAS`.
- [ ] Definir si habrá **envío gratis** por umbral (hoy no está modelado;
      requiere columna `free_from_clp` + uso en checkout). → feature nueva.
- [ ] Operar: en cada pedido pagado, botón **Despachar** en `/admin/pedidos/[id]`
      (carrier + nº seguimiento + URL https) → el cliente lo ve y se dispara email.

---

## 5. Fase 3 — Emails transaccionales (activar)

- [ ] Crear cuenta **Resend** (gratis 3k/mes) y verificar el dominio
      `vintah.net` (registros SPF + DKIM en DNS).
- [ ] `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM=pedidos@vintah.net`.
- [ ] En live, `EMAIL_TEST_RECIPIENTS` vacío (el guard solo limita sandbox).
- [ ] Probar los 7 eventos con un pedido sandbox.

---

## 6. Fase 4 — Devoluciones / RMA (feature nueva)

- [ ] Redactar la **política real** (hoy `/devoluciones` es borrador) con la
      Ley 19.496 (retracto 10 días).
- [ ] UI cliente “Solicitar devolución” sobre pedidos `PAID`/`SHIPPED`.
- [ ] Admin: aprobar/rechazar → `finish_checkout_refund` (MP) + reponer stock a
      `AVAILABLE` + email `order_refunded`.

---

## 7. Fase 5 — Retiro en tienda (feature nueva)

- [ ] Opción “Retiro en tienda” en checkout (Santiago / Rancagua).
- [ ] Marcar pedido “listo para retirar” → email `order_preparing`.

---

## 8. Fase 6 — Facturación electrónica SII (feature nueva)

- [ ] Elegir **LibreDTE** (self-host, $0) o **Facturama** (free tier).
- [ ] Emitir boleta/factura al `payment_confirmed` y adjuntar PDF en el email.

---

## 9. Fase 7 — Verificación post-deploy

- [ ] `pg_cron` activo en Cloud (`select * from cron.job;`).
- [ ] Smoke E2E: guest + con cuenta + cupón, en `https://vintah.net`.
- [ ] Pago real aprobado → pedido `PAID` + email + tracking visible.
- [ ] Logs de Edge Functions sin `INTERNAL` en 24 h.

---

## Panel de propiedad (no técnico, entrega del dueño)

Credenciales MP **LIVE**, API key **Resend** + dominio verificado, credenciales
**carrier** (Chilexpress/Starken) si se activan, y decisión sobre **facturación
electrónica**.
