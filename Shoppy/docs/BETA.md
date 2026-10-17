# Beta Shoppy: activación y validación

Estado al 11 de octubre de 2026: implementación local en revisión. No se ha desplegado esta versión en Supabase ni se han emitido APK o IPA. Las exportaciones de Expo no son aplicaciones instalables. Las pruebas simuladas no validan a Mercado Pago, Webpay ni Resend.

## Accesos pendientes

Se requieren cuentas de prueba de Mercado Pago, remitente verificado en Resend, proyecto Expo/EAS, Apple Developer y dispositivos iPhone registrados. Faltan fotos propias y acceso administrativo para aplicar migraciones y secretos en Supabase. Los secretos se configuran en cada plataforma, nunca en Git ni mensajes.

## Activación en orden

1. Respaldar el Supabase remoto y registrar las versiones actuales de funciones, administrador y app para reversión. Revisar las dos migraciones `20261010000000_beta_checkout.sql` y `20261010000001_beta_cart_images.sql`. Aplicar migraciones incrementales sin resetear datos.
2. Configurar secretos de funciones según `.env.example`. Mantener `PAYMENT_MODE=sandbox`, `TRANSBANK_ENVIRONMENT=TEST`. Activar `PAYMENT_PROVIDERS=mercadopago,transbank` solo con credenciales de prueba y configurar un proveedor predeterminado compatible. `FUNCTIONS_PUBLIC_URL` admite el origen de Supabase o su ruta `/functions/v1`; `PAYMENT_BRIDGE_URL` es el origen HTTPS del administrador.
3. Desplegar las funciones checkout y notify junto con sus módulos compartidos. Verificar el endpoint de proveedores. La app nueva requiere estas migraciones y funciones; no distribuirla antes.
4. Desplegar administrador en HTTPS. Configurar variables públicas de Supabase y `SUPABASE_SECRET_KEY` exclusivamente en servidor. Registrar el webhook Mercado Pago y su secreto. Las rutas `/api/payments/start` y `/api/payments/return` reciben identificadores opacos; Webpay se inicia mediante POST. El retorno del navegador nunca acredita el pago.
5. Para correos, configurar `EMAIL_PROVIDER=resend`, `EMAIL_FROM`, `RESEND_API_KEY` y `EMAIL_TEST_RECIPIENTS` con destinatarios de prueba. Probar cada transición del pedido. No se enviaron correos externos durante esta implementación.
6. Vincular Expo/EAS al proyecto real, configurar identificadores de aplicación y firma, registrar iPhones y usar el perfil `beta` de `apps/mobile/eas.json`. Generar Android APK e iOS interno. Conservar la versión previa. Probar enlaces de retorno en los binarios instalados.
7. Cargar fotos propias desde administración (JPG, PNG o WebP de hasta 5 MB). El catálogo de muestra conserva su etiqueta de demostración.

## Verificaciones reproducibles

Desde Shoppy: `npm run test:beta`, `npm run typecheck`, `npm run lint` y `npm --workspace apps/admin run build -- --webpack`.

Con Deno: `deno check supabase/functions/checkout/index.ts supabase/functions/notify/index.ts` y `deno test --allow-env supabase/functions/_shared/payment_test.ts supabase/functions/_shared/notify_test.ts supabase/functions/_shared/ratelimit_test.ts`.

En una base local desechable aplicar `supabase/tests/setup_local.sql`, todas las migraciones en orden, `supabase/tests/rls_tests.sql` y `supabase/tests/beta_tests.sql`. No ejecutar fixtures sobre el Supabase remoto. La validación local mediante PGlite no prueba concurrencia entre conexiones reales.

## Matriz obligatoria antes de entregar

- Ambos proveedores: aprobación, rechazo, cancelación, expiración y reembolso reales en sandbox; comprobar monto, moneda y pedido.
- Doble toque, webhook duplicado, respuesta perdida y cierre de app: un pedido y un descuento de inventario.
- Dos compradores de la última unidad, reserva vencida y pago tardío: sin sobreventa; incidencia y reembolso trazables.
- Invitado y dos cuentas: restauración, fusión única, edición sin conexión, cambio de cuenta durante solicitudes y cierre de sesión.
- Pago pendiente: continuar, verificar, retorno sin bucles y conservación de prendas agregadas después de comprar.
- Fotos: subida parcialmente fallida, reintento, portada, orden y eliminación; revisar cola de limpieza.
- Correos: pedido, pago, preparación, despacho, entrega, cancelación y reembolso; reintentar fallos sin duplicar envíos confirmados.
- Android e iPhone instalados: teclado, áreas seguras, texto grande, contraste, errores de imagen y recorrido completo.

Usar datos de prueba identificables y limpiar únicamente esos datos. Registrar versiones, dispositivo, fecha, pedido y resultado de cada caso.

## Recuperación operativa

Un resultado desconocido al crear un pago o reembolso queda en revisión: comprobar el proveedor antes de repetir operaciones. Las notificaciones en envío incierto o fuera de la ventana de idempotencia de 23 horas requieren comprobar Resend antes de reenviar. La compra confirmada no se revierte por un fallo de correo.

El carrito antiguo permanece disponible para recuperación explícita; nunca se atribuye automáticamente a una cuenta desconocida. Los secretos de pedidos se guardan en SecureStore en Android/iOS. La recuperación de secretos tras reiniciar no está implementada para web.

Para revertir, restaurar los despliegues anteriores compatibles, conservando las tablas y pedidos nuevos. No eliminar columnas ni restablecer el proyecto remoto como mecanismo de reversión.

## Resultados locales del 11 de octubre

- 20 pruebas Node: correctas (incluidas las ocho pruebas previas de checkout).
- 17 pruebas Deno: correctas; comprobación de tipos de checkout y notify correcta.
- Typecheck del monorepo y lint sin errores.
- Exportación final Expo de Android, iOS y web correcta. Son bundles, no APK/IPA firmados.
- Build de producción del administrador con webpack correcto: 17 páginas y rutas HTTPS de pago incluidas.
- Las 12 migraciones, RLS y reglas de beta pasan en PostgreSQL mediante PGlite local. Docker no estaba iniciado.
- Pendientes: transacciones reales sandbox, correos recibidos, concurrencia entre conexiones, subida real de fotos y recorrido en dispositivos.
