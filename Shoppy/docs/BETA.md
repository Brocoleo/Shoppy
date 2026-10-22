# Beta Shoppy: activación y validación

> **Estado al 22 de octubre de 2026.** El código está desplegado y verificado en el **sandbox de
> Supabase** (migraciones aplicadas, catálogo con 28 prendas, E2E 13/13 contra la BD y el Storage
> reales). **No** está resuelto: el sitio público sigue **caído** (Vercel pausado → `503`), faltan la
> **identidad legal** de la tienda, el **KYC de Mercado Pago** y el **secreto de su webhook**, y no
> hay **APK/IPA** firmados. Las exportaciones de Expo son bundles, no aplicaciones instalables. Las
> pruebas simuladas no validan a Mercado Pago, Webpay ni el envío real de correo.
>
> **Alcance del drop 1 (decisión del dueño, 22-oct-2026):** techo **$0**, cobro **solo con
> MercadoPago**, publicación **solo en GitHub** (sin redespliegue en Vercel por ahora) y **Transbank
> fuera** (requiere alta de cuenta de pago). Detalle en `docs/AUDITORIA_OPENCODE.md` §1.2 y §7.1.

## Accesos y trámites pendientes

Lo que de verdad bloquea el drop 1 (nada de esto se cierra desde el código):

| # | Qué falta | Dónde se resuelve | Por qué bloquea |
|---|---|---|---|
| 1 | Razón social, RUT, domicilio, correo de contacto y plazo de devolución | el dueño, en `apps/web/src` (marcado `[pendiente]`) | Sin identidad legal no se puede vender en Chile |
| 2 | **KYC de Mercado Pago** (cuenta de negocio verificada) | el dueño, en el panel de Mercado Pago | Sin cuenta verificada el cobro no se liquida |
| 3 | **`MERCADOPAGO_WEBHOOK_SECRET`** | el dueño, en el panel de Mercado Pago | Sin el secreto no se valida el webhook firmado: el pago no se acredita solo y queda el botón «Ya pagué» del cliente |
| 4 | Remitente verificado del proveedor de correo | el dueño, en Brevo/SMTP2GO/Resend | Sin remitente verificado no salen los correos de pedido |

**Ya resuelto** (vuelve a ser pendiente solo si algo se borra): acceso administrativo al sandbox,
migraciones aplicadas, credenciales de Mercado Pago en modo sandbox, fotos propias cargadas por el
admin y el catálogo poblado. Para publicar además la **app móvil** harían falta proyecto Expo/EAS,
Apple Developer y dispositivos iPhone registrados.

Los secretos se configuran en cada plataforma, nunca en Git ni en mensajes.

## Activación en orden

1. Respaldar el Supabase remoto y registrar las versiones actuales de funciones, administrador y app para reversión. Revisar las dos migraciones `20261010000000_beta_checkout.sql` y `20261010000001_beta_cart_images.sql`. Aplicar migraciones incrementales sin resetear datos.
2. Configurar secretos de funciones según `.env.example`. Mantener `PAYMENT_MODE=sandbox`. En el drop 1 se activa **solo `PAYMENT_PROVIDERS=mercadopago`** con `PAYMENT_PROVIDER=mercadopago` (Transbank queda implementado pero fuera de este lanzamiento: exige alta de cuenta de pago). Para el correo, `EMAIL_PROVIDER=brevo` o `smtp2go` funcionan sin dominio propio y sin costo; `resend` exige dominio verificado. `FUNCTIONS_PUBLIC_URL` admite el origen de Supabase o su ruta `/functions/v1`; `PAYMENT_BRIDGE_URL` es el origen HTTPS del administrador.
3. Desplegar las funciones checkout y notify junto con sus módulos compartidos. Verificar el endpoint de proveedores. La app nueva requiere estas migraciones y funciones; no distribuirla antes.
4. Desplegar administrador en HTTPS. Configurar variables públicas de Supabase y `SUPABASE_SECRET_KEY` exclusivamente en servidor. Registrar el webhook Mercado Pago y su secreto. Las rutas `/api/payments/start` y `/api/payments/return` reciben identificadores opacos; Webpay se inicia mediante POST. El retorno del navegador nunca acredita el pago.
5. Para correos, configurar `EMAIL_PROVIDER` (`brevo` o `smtp2go` para el drop 1: sin dominio propio), `EMAIL_FROM` y la clave del proveedor (`BREVO_API_KEY` o `SMTP2GO_API_KEY`), más `EMAIL_TEST_RECIPIENTS` con destinatarios de prueba. Probar cada transición del pedido. No se enviaron correos externos durante esta implementación.
6. Vincular Expo/EAS al proyecto real, configurar identificadores de aplicación y firma, registrar iPhones y usar el perfil `beta` de `apps/mobile/eas.json`. Generar Android APK e iOS interno. Conservar la versión previa. Probar enlaces de retorno en los binarios instalados.
7. Cargar fotos propias desde administración (JPG, PNG o WebP de hasta 5 MB). El catálogo de muestra conserva su etiqueta de demostración.

## Verificaciones reproducibles

Desde Shoppy: `npm run test:beta`, `npm run typecheck`, `npm run lint` y `npm --workspace apps/admin run build -- --webpack`.

Con Deno: `deno check supabase/functions/checkout/index.ts supabase/functions/notify/index.ts` y `deno test --allow-env supabase/functions/_shared/payment_test.ts supabase/functions/_shared/notify_test.ts supabase/functions/_shared/ratelimit_test.ts`.

En una base local desechable aplicar `supabase/tests/setup_local.sql`, todas las migraciones en orden, `supabase/tests/rls_tests.sql` y `supabase/tests/beta_tests.sql`. No ejecutar fixtures sobre el Supabase remoto. La validación local mediante PGlite no prueba concurrencia entre conexiones reales.

## Matriz obligatoria antes de entregar

Estado al 22-oct-2026: ✅ verificado en el sandbox · 🟡 a medias · ⛔ bloqueado por un trámite externo.

| Caso | Cómo se verifica | Estado |
|---|---|---|
| Aprobación de pago: monto, moneda y pedido | MercadoPago real + webhook firmado → pedido `PAID` | ⛔ falta KYC y el secreto del webhook |
| Rechazo, cancelación y expiración | contratos del simulador local + E2E | ✅ |
| Reembolso real contra el proveedor | MercadoPago | ⛔ requiere cuenta verificada |
| Doble toque, webhook duplicado, respuesta perdida y cierre de app | `checkout_api` + simulador local | ✅ un pedido, un descuento de inventario |
| Dos compradores de la última unidad | E2E de compra (reserva la prenda única) | ✅ sin sobreventa |
| Reserva vencida y pago tardío | simulador local: reembolso automático y revisión manual | ✅ (simulado, sin proveedor real) |
| Invitado y dos cuentas: restauración, fusión única, cambio de cuenta y cierre de sesión | E2E de aislamiento entre cuentas + tests del móvil | ✅ |
| Pago pendiente: continuar, verificar, retorno sin bucles | E2E de compra (pedido `PENDING_PAYMENT`) | 🟡 falta el retorno desde el proveedor |
| Fotos: subida, reintento, portada, orden y eliminación | E2E de fotos (11 casos) | ✅ cola de limpieza revisada |
| Correos: pedido, pago, preparación, despacho, entrega, cancelación y reembolso | plantillas y deduplicación en código | 🟡 los 17 tests Deno no se han ejecutado (no hay binario `deno`) |
| Android e iPhone instalados | — | ⛔ no hay binarios firmados |

Usar datos de prueba identificables y limpiar únicamente esos datos. Registrar versiones, dispositivo, fecha, pedido y resultado de cada caso.

## Recuperación operativa

Un resultado desconocido al crear un pago o reembolso queda en revisión: comprobar el proveedor antes de repetir operaciones. Las notificaciones en envío incierto o fuera de la ventana de idempotencia de 23 horas requieren comprobar Resend antes de reenviar. La compra confirmada no se revierte por un fallo de correo.

El carrito antiguo permanece disponible para recuperación explícita; nunca se atribuye automáticamente a una cuenta desconocida. Los secretos de pedidos se guardan en SecureStore en Android/iOS. La recuperación de secretos tras reiniciar no está implementada para web.

Para revertir, restaurar los despliegues anteriores compatibles, conservando las tablas y pedidos nuevos. No eliminar columnas ni restablecer el proyecto remoto como mecanismo de reversión.

## Estado verificado el 22 de octubre de 2026

- E2E del admin: **13/13** verdes contra la BD y el Storage reales (`E2E_BASE_URL=http://localhost:3002`).
- `npm run test:beta`: **67/67**. `npm run test:checkout`: **90/90** en 10 suites (el simulador local
  pasó a 10 casos al cubrir la revisión manual del reembolso).
- `npm run typecheck` y `npm run lint`: exit 0.
- Sandbox limpio: **0** pedidos, prendas, perfiles, intentos, pagos y reservas de prueba
  (`npm run check:residue`).
- Catálogo del sandbox: **28 prendas** (20 disponibles, 8 vendidas) y 48 imágenes.

Pendiente de ejecución: los **17 tests Deno** de las funciones (no hay binario `deno` en esta
máquina) y las **4 suites SQL** (requieren Docker/Postgres).

## Resultados locales del 11 de octubre

- 20 pruebas Node: correctas (incluidas las ocho pruebas previas de checkout).
- 17 pruebas Deno: correctas; comprobación de tipos de checkout y notify correcta.
- Typecheck del monorepo y lint sin errores.
- Exportación final Expo de Android, iOS y web correcta. Son bundles, no APK/IPA firmados.
- Build de producción del administrador con webpack correcto: 17 páginas y rutas HTTPS de pago incluidas.
- Las 12 migraciones, RLS y reglas de beta pasan en PostgreSQL mediante PGlite local. Docker no estaba iniciado.
- Pendientes: transacciones reales sandbox, correos recibidos, concurrencia entre conexiones, subida real de fotos y recorrido en dispositivos.
