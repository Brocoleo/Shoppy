# GO-LIVE — Estado real y pasos para producción

> Documento vivo. Reemplaza/actualiza el checklist anterior: **el backend de
> operación está implementado**. Lo que falta es, sobre todo, **configuración y
> cuentas externas** (KYC MercadoPago, Brevo, tarifas reales). El dominio propio
> queda diferido: se lanza con la URL gratuita de Vercel.
>
> Última revisión de código: 19-oct-2026. Revisar `docs/PRODUCTION.md`
> (deploy Vercel) y `docs/PAYMENTS.md` (pagos) para detalle.

---

## 0. Resumen: código vs. configuración

| Área | Código | Falta |
|---|---|---|
| **Pagos (MP)** | ✅ completo (sandbox E2E probado) | Credenciales **live** + webhook prod + KYC |
| **Envíos (tarifas)** | ✅ `shipping_rates` + buckets 16 regiones + CRUD admin + selector checkout | Cargar **precios reales** por zona |
| **Envíos (tracking)** | ✅ `shipments` + “Despachar” admin + tracking para **cliente e invitado** | — |
| **Envío gratis** | ✅ `shipping_rates.free_from_clp` + checkout + admin (smoke E2E OK) | Cargar umbral real por zona |
| **Emails** | ✅ 7 eventos + Brevo/Resend + idempotencia (`order_notifications`) | `BREVO_API_KEY` + remitente verificado + `EMAIL_PROVIDER=brevo` |
| **Reservas / cron** | ✅ `release_expired_reservations` + `refresh_trending_scores` en `pg_cron` | Verificar `pg_cron` activo en Cloud |
| **Reembolsos / RMA** | ✅ `return_requests` + aprobación admin → reembolso MP → repone stock `AVAILABLE` + email (smoke OK) | Completar datos legales del texto |
| **Retiro en tienda** | ❌ | Opción pickup en checkout + notificación |
| **Dominio** | ⏸️ diferido ($0) | Se lanza con `https://shopy-web-six.vercel.app`; dominio propio cuando haya ventas |
| **Carrier en vivo** | ⚙️ esqueletos `chilexpress`/`starken` | Homologación API (opcional) |

**Conclusión:** es viable lanzar **con costo $0**, cargando tarifas reales,
activando Brevo (sin dominio) y MP live. El retiro en tienda no aplica (negocio
virtual) y el RMA ya está implementado; solo faltan las cuentas externas.

---

## 1. Fase 0 — URL pública y variables (sin dominio propio)

**Decisión: $0.** No se compra dominio para el drop 1. Se usa la URL gratuita
de producción de Vercel:

`https://shopy-web-six.vercel.app`

- [ ] `NEXT_PUBLIC_SITE_URL=https://shopy-web-six.vercel.app` (Production y Preview).
- [ ] Subir variables: `cp .env.production.example .env.production` → rellenar
      → `./scripts/setup-vercel-env.sh .env.production production`.
- [ ] `vercel --prod` y verificar que la URL carga con candado.

> El mismo `NEXT_PUBLIC_*` debe existir en **Preview** o los previews muestran
> “La tienda no está disponible” (ver `docs/PRODUCTION.md`).

**Dominio propio (diferido):** cuando el drop 1 genere ventas, comprar
`vintah.net` (~$10–15 USD/año) y apuntarlo a Vercel con
`A @ 76.76.21.21` + `CNAME www cname.vercel-dns.com`.

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
| `EMAIL_PROVIDER` | `brevo` o `smtp2go` | Al activar emails |
| `BREVO_API_KEY` o `SMTP2GO_API_KEY`, `EMAIL_FROM` | proveedor elegido | Al activar |
| `EMAIL_FROM_NAME` | `vintah.zhe` | Opcional |
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
- [ ] Definir **envío gratis por umbral** y cargarlo en `/admin/envios`
      (columna `shipping_rates.free_from_clp`; el checkout ya la aplica).
- [ ] Operar: en cada pedido pagado, botón **Despachar** en `/admin/pedidos/[id]`
      (carrier + nº seguimiento + URL https) → el cliente lo ve y se dispara email.

---

## 5. Fase 3 — Emails transaccionales ($0, sin dominio)

Hay **dos adaptadores** listos. Usa el que te deje crear cuenta gratis:

| Proveedor | Free | Remitente | Notas |
|---|---|---|---|
| **Brevo** (`EMAIL_PROVIDER=brevo`) | 300/día | verificar correo | La página de *pricing* es solo upsell: no pagues, el plan free ya está activo. |
| **SMTP2GO** (`EMAIL_PROVIDER=smtp2go`) | 1.000/mes | verificar correo | Sin tarjeta; sin dominio aplica 25/hora. |

Pasos (idénticos en ambos):
1. Crear cuenta gratis (sin tarjeta).
2. Verificar el remitente `leomir2656@icloud.com` (llega un enlace a ese correo).
3. Crear una **API key** y guardarla en `supabase/.env` (gitignored).
4. Secrets: `EMAIL_PROVIDER=brevo|smtp2go`, `EMAIL_FROM=leomir2656@icloud.com`,
   `EMAIL_FROM_NAME=vintah.zhe` + la key correspondiente
   (`BREVO_API_KEY` o `SMTP2GO_API_KEY`).
5. En live, `EMAIL_TEST_RECIPIENTS` vacío (el guard solo limita sandbox).

> Cuando compres dominio, se puede verificar en Brevo/SMTP2GO (mejor
> entregabilidad) o migrar a Resend. Los tres adaptadores se mantienen.

---

## 6. Fase 4 — Devoluciones / RMA (implementada ✅)

- [x] Tabla `return_requests` + RPC `request_return` (cliente, pedidos
      `DELIVERED`, ventana de 10 días, una solicitud abierta por pedido).
- [x] UI cliente “Solicitar devolución” en `/pedido/[id]` (estado de la solicitud).
- [x] Admin: aprobar/rechazar en `/pedidos/[id]` → `finish_checkout_refund`
      (reembolso MP) → `restore_order_products` repone la prenda única a
      `AVAILABLE` → email `order_refunded`. Idempotente (smoke verificado).
- [x] Política redactada en `/devoluciones` (Ley 19.496, retracto 10 días).
- [ ] Completar los datos legales `[pendiente]`, `[correo de contacto]` y
      `[plazo]` antes de publicar la política como definitiva.

> Nota: el reembolso de pedidos `PAID`/`DELIVERED` devuelve la prenda al
> catálogo. Los pedidos `SHIPPED`/`PREPARING` no admiten transición directa a
> `REFUNDED`; para esos casos, primero se marca `DELIVERED`.

---

## 7. Fase 5 — Retiro en tienda (opcional)

El negocio es **virtual** (no hay local): **no hace falta** implementar pickup.
Solo aplica si más adelante abres un punto de entrega. En ese caso:

- [ ] Opción “Retiro en tienda” en checkout.
- [ ] Marcar pedido “listo para retirar” → email `order_preparing`.

---

## 8. Fase 7 — Verificación post-deploy

- [ ] `pg_cron` activo en Cloud (`select * from cron.job;`).
- [ ] Smoke E2E: guest + con cuenta + cupón, en la URL de producción.
- [ ] Pago real aprobado → pedido `PAID` + email + tracking visible.
- [ ] Logs de Edge Functions sin `INTERNAL` en 24 h.

---

## Panel de propiedad (no técnico, entrega del dueño)

Credenciales MP **LIVE**, API key **Brevo** + remitente verificado, y credenciales
**carrier** (Chilexpress/Starken) si se activan.
