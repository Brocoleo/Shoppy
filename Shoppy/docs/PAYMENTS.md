# PAYMENTS — Shopy

> Estado Fase 8: `PaymentProvider` + 3 implementaciones
> (`supabase/functions/_shared/payment.ts`), selección por `PAYMENT_PROVIDER`.
> Default `mock`. Tests Deno: `payment_test.ts` (5 verdes).
> **Sin credenciales reales configuradas: opera en mock.**
>
> **Alcance del drop 1 (22-oct-2026):** solo **MercadoPago**, en modo `sandbox`.
> **Transbank/Webpay queda fuera de este lanzamiento** — el código está listo y probado en
> contrato, pero activarlo exige dar de alta una cuenta de pago.

## Interfaz

```ts
interface PaymentProvider {
  createPayment(input, idempotencyKey): Promise<{ providerPaymentId; checkoutUrl; status }>;
  verifyPayment(providerPaymentId, expectedAmountClp, orderId?): Promise<Status>;
  refundPayment(providerPaymentId, amountClp?): Promise<void>;
  handleWebhook({ headers, query, body }): Promise<{ orderId; status }>;
}
```

`verifyPayment` = "verificar/finalizar": para Transbank ejecuta el COMMIT;
para MP busca el pago aprobado; para mock aprueba. La idempotencia real vive
en DB (`payments.idempotency_key`, `mark_order_paid` convergente).

## Proveedores

### mock (default)
Sin cargos, stateless, `checkoutUrl: null`. El checkout confirma sincrónico.

### mercadopago (Checkout Pro)
- `create`: `POST /checkout/preferences` (items, payer email, `back_urls`,
  `notification_url`, `external_reference` = orderId) → `init_point`
  (redirect) + preference id.
- `verify`: `GET /v1/payments/search?external_reference=` → APPROVED si hay
  pago aprobado por el monto exacto.
- `webhook`: valida HMAC (`x-signature`/`x-request-id`, manifest oficial
  `id:{dataId};request-id:{xRequestId};ts:{ts};`, SHA-256 hex vs `v1`),
  luego `GET /v1/payments/{id}`. Responde 200/201 (reintentos MP si no).
  Requiere URL pública (`FUNCTIONS_PUBLIC_URL`); local no recibe webhooks
  (el flujo retorno+verify cubre dev).
- `refund`: `POST /v1/payments/{id}/refunds` (requiere payment id numérico
  del webhook, guardado en `raw_payload`).
- Env: `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`.

### transbank (Webpay Plus REST v1.2)
- `create`: `POST /rswebpaytransaction/api/webpay/v1.2/transactions`
  (`buy_order` = orderNumber ≤26, `session_id` = orderId, `amount`,
  `return_url`) → `{token, url}`. Token vive 5 min.
- `verify`: `PUT /transactions/{token}` (COMMIT) → APPROVED si
  `status=AUTHORIZED` y `response_code=0`.
- `refund`: `GET` estado → `POST /transactions/{token}/refunds`
  (`buy_order`, `authorized_amount`). Sin webhook (flujo return+commit).
- Hosts: TEST `https://webpay3gint.transbank.cl`,
  LIVE `https://webpay3g.transbank.cl`.
- Env: `TRANSBANK_ENVIRONMENT` (default TEST), `TRANSBANK_COMMERCE_CODE`,
  `TRANSBANK_API_KEY_SECRET`. En TEST sin env usa los códigos públicos de
  integración de la documentación oficial (solo sandbox); LIVE sin env falla
  explícito. Credenciales de integración TEST son públicas por diseño de TBK.

## Flujo checkout (`supabase/functions/checkout`)

`quote` (sin efectos) → `create` (pedido + reserva + pago pendiente +
`checkout_url` si hay redirect) → usuario paga en proveedor →
`confirm` (por retorno o botón "Ya pagué") o `webhook` (MP) → converge a PAID.
Mobile: `expo-web-browser` + deep link `shopy://checkout-return`.

## Reglas (vigentes desde Fase 6)

- Montos/stock revalidados en backend; cliente nunca decide.
- Confirmación solo vía backend; webhooks idempotentes y con firma.
- Nunca commitear secretos (solo `.env.example` + secrets del proyecto).
