# GO-LIVE — Estado real y pasos para producción

> Documento vivo. Reemplaza/actualiza el checklist anterior: **el backend de
> operación está implementado**. Lo que falta es, sobre todo, **configuración y
> cuentas externas** (DNS, KYC MercadoPago, Resend, tarifas reales, SII).
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
| **Emails** | ✅ 7 eventos + Resend + idempotencia (`order_notifications`) | `RESEND_API_KEY` + dominio verificado + `EMAIL_PROVIDER=resend` |
| **Reservas / cron** | ✅ `release_expired_reservations` + `refresh_trending_scores` en `pg_cron` | Verificar `pg_cron` activo en Cloud |
| **Reembolsos / RMA** | ✅ `return_requests` + aprobación admin → reembolso MP → repone stock `AVAILABLE` + email (smoke OK) | Completar datos legales del texto |
| **Retiro en tienda** | ❌ | Opción pickup en checkout + notificación |
| **Facturación SII** | ✅ registro DTE en el pedido (folio/PDF) | Emitir en el **Portal MiPyme** del SII (gratis) y registrar |
| **Dominio** | ⚙️ Vercel linkeado (`shopy-web`) | Apuntar `vintah.net` + `NEXT_PUBLIC_SITE_URL` |
| **Carrier en vivo** | ⚙️ esqueletos `chilexpress`/`starken` | Homologación API (opcional) |

**Conclusión:** es viable lanzar sin escribir más backend, cargando tarifas
reales, activando Resend y MP live, y emitiendo boletas en el Portal MiPyme del
SII (gratis). El retiro en tienda no aplica (negocio virtual) y el RMA ya está
implementado; solo faltan los datos legales y las cuentas externas.

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
- [ ] Definir **envío gratis por umbral** y cargarlo en `/admin/envios`
      (columna `shipping_rates.free_from_clp`; el checkout ya la aplica).
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

## 8. Fase 6 — Facturación electrónica SII ($0 con el Portal MiPyme)

**Contexto verificado (19-oct-2026):** en Chile **todo** DTE (boleta/factura) es
obligatorio desde la primera venta, sin umbral de volumen. **Facturama es
mexicano (CFDI)** y **no** emite documentos chilenos. El sistema **gratuito y
oficial** del SII es el **Portal MiPyme**.

Opciones reales:

| Ruta | Costo | Automatización | Notas |
|---|---|---|---|
| **Portal MiPyme (SII)** | **$0 para siempre** | Manual (web) | Oficial, válido, sin certificación propia. **Recomendado para el piloto.** |
| LibreDTE self-hosted | $0 software + **servidor** (~$5 USD/mes) | Total (API REST) | Único $0 *automático*; rompe el techo $0 por el VPS. |
| FacBox / BaseAPI / SimpleAPI | Gratis con límites que **excluyen boletas** o vencen a 1 año | Total (API REST) | No sirven como “definitivo $0” para B2C. |

**Certificado digital (aclaración oficial, FAQ SII 22/07/2026):**

- **Boletas electrónicas** (venta a consumidor): el *Sistema de Emisión de
  Boletas del SII* **NO requiere certificado digital** → costo real **$0**.
  Se emiten desde el sitio o desde la app móvil **e-Boleta**.
- **Facturas** (B2B): sí requieren certificado digital (costo anual aparte).

**Plan del piloto ($0, sin servidor):**

- [ ] Tener **inicio de actividades** vigente con giro de comercio al por menor
      (la firma electrónica **no** se necesita para boletas).
- [ ] Inscribirse en el **Sistema de Emisión de Boletas** del SII (gratis).
- [ ] Por cada pedido `PAID`, emitir la **boleta (39)** y dejarla enviada al
      correo del cliente.
- [ ] Registrarla en el admin → pedido → **Boleta / DTE** (tipo + folio + URL
      del PDF). El cliente la ve en su ficha de pedido.
- [ ] El upstream del pago ya dispara `payment_confirmed` para los emails.

**Automatización futura (opcional):** cuando el volumen lo justifique, levantar
LibreDTE en un servidor y emitir por API; el modelo ya está preparado
(`orders.dte_provider`), sin migración adicional.

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
