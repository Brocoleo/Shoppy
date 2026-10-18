# Verificación sandbox — 18 de octubre de 2026

## Estado comprobado

A las 15:46 UTC (12:46 en Chile), el pedido `ca815186-d185-46e3-a10d-4f99586ca2a7` permanece PENDING_PAYMENT, por 15.980 CLP. La reserva de una unidad está activa hasta las 15:50:56 UTC; stock 9 frente a las 10 unidades previas. La búsqueda de pagos en MercadoPago por external_reference no devuelve resultados. La preferencia existe y corresponde al pedido, importe y moneda correctos.

El usuario informó «aprobado», pero esa afirmación no coincide todavía con la API ni con la pestaña inspeccionada: permanece en el formulario de tarjeta. Se solicitó aclarar si se trataba del resultado de pago o autorización para continuar. No se creó otro intento, no se confirmó artificialmente y no se cerró la reserva.

Web local 3015 y túnel responden HTTP 200. Vercel no se modificó.

## Pruebas ejecutadas

`node scripts/test-checkout.mjs`: 61 casos, 61 aprobados, cero fallos; incluye reglas, handler con transporte simulado, proveedor simulado, sesión, lectura de servidor, retorno, carrito y mapeo comercial. Registro: `/tmp/vintah-sandbox-stage-tests.log`.

Estas pruebas no equivalen a un pago ni a una notificación real. La liquidación real repetida, la reserva consumida y la convergencia retorno/webhook siguen pendientes. No hubo cambios de código que exigieran una nueva compilación.

## Notificaciones

No se encontró MERCADOPAGO_WEBHOOK_SECRET en los archivos de configuración locales revisados. El inventario remoto anterior tampoco lo incluía; no se volvió a modificar esa configuración. La preferencia de esta prueba no anuncia notification_url.

Para probar una notificación firmada real hace falta configurar el secreto de la integración existente de forma segura y aprobar expresamente la ampliación remota descrita en el plan. No se fabricará una firma local para presentarla como una notificación emitida por MercadoPago.

## Herramientas

RTK no aparece en PATH ni en las rutas conocidas revisadas; se ejecutaron las comprobaciones directamente. No se afirma que Headroom ni Ponytail estén activos. No se leyeron contraseñas ni el archivo temporal restringido en esta ronda.

## Intento de tarjeta y causa encontrada

El usuario aclaró que autorizaba usar los datos de prueba; no había completado un pago. Se introdujo la tarjeta compartida en el formulario y el proveedor mostró «La operación no acepta este medio de pago». Se consultó la documentación oficial para Chile y se usó la Mastercard de prueba publicada allí, titular APRO y documento Otro/123456789. El formulario reconoció Mastercard, pero al continuar redirigió a `/fatal/` con «Oh, no, algo anduvo mal». Captura `mercadopago-error.png`; no incluye tarjeta ni contraseña. No se guardó la tarjeta.

La búsqueda posterior de pagos por referencia devolvió cero resultados. A las 15:51:48 UTC la reserva ya figuraba expired. No se creó otro intento ni se eliminó el anterior.

Se encontró un error en el código desplegado: elegía sandbox_init_point en modo sandbox. La guía actual del repositorio oficial de MercadoPago indica usar init_point también con cuentas test y señala la URL antigua como causa de páginas de error. Esto es consistente con el fallo observado; su corrección todavía debe validarse en el recorrido real antes de dar por demostrada la causa completa.

Se corrigió localmente la selección para usar init_point y se añadió una regresión que rechaza respuestas sin init_point aunque incluyan la URL antigua. Los controles de modo, importe, moneda, referencia, firma y live_mode permanecen. No se desplegó esta corrección; requiere la ampliación autorizada en el plan.

Pruebas posteriores: 62 casos Node aprobados, ESLint de los dos archivos modificados y Deno check del checkout aprobados; TypeScript web aislado aprobado. Compilación web aislada `next build --webpack` aprobada. El primer intento Turbopack no resolvió el enlace de dependencias externo; el intento webpack restringido falló al iniciar TypeScript. La ejecución webpack con permisos para subprocesos terminó correctamente, sin reiniciar servicios.

Fuentes oficiales:
- https://www.mercadopago.cl/developers/en/docs/checkout-pro-preferences/integration-test/test-purchases?scope=prod
- https://github.com/mercadopago/mercadopago-claude-marketplace/blob/main/plugins/mercadopago/skills/mp-integrate/SKILL.md (LOCK 3)

## Corrección desplegada y único reemplazo autorizado

El usuario autorizó expresamente el despliegue y un solo reemplazo. Se desplegó únicamente checkout, versión 14 ACTIVE, verify_jwt=false; sin modificar secretos ni Vercel. Se revalidó al vendedor mediante /users/me: cuenta chilena con etiqueta test_user.

El intento anterior se cerró desde el botón existente: pedido ca815186-d185-46e3-a10d-4f99586ca2a7 CANCELLED, reserva expired. Se creó un único reemplazo d34dd8b8-3be7-4536-8f42-393a550e2616, pedido SHO-823CB0C5, importe 15.980 CLP, Metropolitana/Santiago. La redirección utiliza init_point y llegó correctamente a revisión de pago.

Con la Mastercard oficial de prueba terminada en 2580, MercadoPago mostró «Tu pago ya se acreditó», operación 183824352339. La consulta API devuelve approved/accredited, CLP, 15.980, external_reference del reemplazo. Sin embargo, live_mode es true. El vendedor consultado conserva la etiqueta test_user y coincide con collector_id; payer.id coincide con el comprador de prueba configurado, con nombre y correo de prueba. Evidencia en payment-environment.json. No se afirma que el criterio live_mode=false haya pasado.

El retorno HTTPS volvió al mismo localhost:3015/checkout-return, conservando el intento. El backend excluye ese resultado por su discrepancia de entorno y responde pendiente: pedido PENDING_PAYMENT y pago local pending. Se repitió «Ya pagué, verificar pago» sin iniciar otra compra, con el mismo resultado. Stock 9, una sola reserva activa de una unidad; no hay segundo descuento. Esto verifica recuperación y conservación de stock bajo rechazo de entorno, no liquidación PAID ni idempotencia de liquidación real.

La revisión automática bloqueó inicialmente navegar desde MercadoPago por posible pérdida de un formulario. Una observación nueva confirmó la página /fatal/ sin campos, y posteriormente permitió volver al checkout. No se eludió el bloqueo ni se borró almacenamiento.

## Bloqueo actual y siguiente corrección propuesta

No se creará un tercer intento ni se acreditará manualmente. Hay que resolver la diferencia entre el flag live_mode y el flujo con credenciales de usuarios test antes de habilitar la convergencia. La documentación oficial actual confirma init_point para test users; no se encontró una referencia oficial que permita afirmar que live_mode=true basta para distinguir fondos reales en este caso. No se retiró el control de entorno.

Propuesta para revisión: modelar explícitamente el flujo de cuentas test y comprobar identidad del vendedor con etiqueta test_user, collector_id y comprador de prueba esperado en servidor; fallar cerrado si cualquier comprobación falla. Mantener importe, moneda, referencia y firma, y rechazar vendedores reales bajo modo de prueba. Este cambio se preparó localmente como se detalla a continuación; su despliegue todavía requiere autorización porque cambia el criterio de aceptación acordado que exigía live_mode=false. Alternativa: obtener credenciales que emitan live_mode=false antes de continuar.

Notificaciones firmadas pendientes: secreto ausente, sin configuración ni despliegue adicional autorizado. No hubo nuevos commits, push, publicaciones, cuentas, rotación, reembolsos ni eliminación de registros.

## Corrección local de identidad preparada

Se añadió un flujo explícito, desactivado por defecto: MERCADOPAGO_TEST_USER_FLOW=true y MERCADOPAGO_TEST_BUYER_ID (valor ya disponible en el entorno local seguro). Solo funciona con PAYMENT_MODE=sandbox. Antes de crear o verificar pagos consulta /users/me con la credencial del servidor y exige etiqueta test_user, país MLC e identidad distinta del comprador. Para aceptar el pago exige además collector_id igual a ese vendedor y payer.id igual al comprador fijado; importe, moneda y referencia siguen siendo obligatorios. Acepta el booleano live_mode observado bajo estas comprobaciones de identidad, sin cambiar PAYMENT_MODE a live. Sin activación explícita se conserva la comprobación anterior del flag.

La ruta de webhook conserva la firma antes de consultar y aplica la misma comprobación de identidad. El flujo test explícito falla antes de crear preferencias si la credencial es de vendedor real, país distinto o falta comprador. Se añadieron regresiones para esos rechazos, identidades incorrectas, importe/moneda/referencia, fallos HTTP y activación prohibida en modo live.

68 pruebas Node aprobadas, ESLint de los archivos modificados, Deno check y TypeScript web aislado aprobados. Build web aislado de esta ronda aprobado antes de esta corrección del proveedor; esta última solo modifica el módulo de la función y sus pruebas, no los archivos de web.

Una ejecución local del proveedor corregido contra la API real, exclusivamente con GET, valida APPROVED para el pago ya existente sin liquidar el pedido ni desplegar: local-identity-verification.json. Esto no reemplaza la comprobación final del backend desplegado.

Siguiente acción propuesta para aprobación: desplegar únicamente checkout con esta corrección, añadir las dos variables server-side indicadas y volver a confirmar el mismo pedido. Sin nueva compra, migraciones, firma webhook, cambio a live ni Vercel. Si la reserva venciera antes de la autorización, detenerse y revisar el resultado de liquidación; no recrear ni forzar stock/pedido.

## Confirmación final autorizada — 18 de octubre, 13:19 Chile

El usuario autorizó explícitamente el flujo test por identidad, las dos variables server-side y confirmar el mismo pago. Se comprobó el hash aprobado del proveedor, se verificó nuevamente el vendedor test y se desplegó únicamente checkout versión 16 ACTIVE, verify_jwt=false. Se configuraron MERCADOPAGO_TEST_USER_FLOW=true y el ID del comprador ya guardado; no se publicaron sus credenciales, no se modificó PAYMENT_MODE=sandbox ni Vercel.

La revisión previa mostró que la reserva del reemplazo ya había vencido a las 13:13 de Chile y el stock había vuelto a 10 por el proceso de expiración. Se informó antes de confirmar que no podía prometerse PAID y que no se forzaría inventario ni se iniciaría reembolso.

Dos confirmaciones reales desde el navegador reconocieron el pago de MercadoPago y devolvieron la misma revisión por reserva vencida. Supabase payments.status=approved, amount_clp=15980, incident=RESERVATION_EXPIRED, refund_state=null. El pedido permanece PENDING_PAYMENT, reserva expired y stock 10. Evidencia en confirmation-final.json y confirmacion-reserva-vencida.png. No hubo nuevo pedido, nueva preferencia ni pago en esta ronda.

Esto verifica reconocimiento del pago, retorno, recuperación e idempotencia del caso de reserva vencida; no prueba una transición real PAID ni consumo de reserva vigente. La implementación de identidad pasó las 68 pruebas, ESLint, Deno check y TypeScript antes de este despliegue; no hubo ediciones de código posteriores. No se ejecutaron reembolsos.

### Pendientes precisos

- Para demostrar el recorrido PAID hay que acordar otro intento sandbox y completarlo/confirmarlo dentro de la reserva, o resolver primero las notificaciones. La autorización anterior permitía un único reemplazo ya utilizado; no se creó un tercero. No cerrar este pedido automáticamente: existe un pago aprobado con incidente.
- Notificaciones firmadas reales siguen sin verificarse: no hay secreto configurado y esta ronda no lo añadió. Su configuración requiere la aprobación separada prevista en el plan.
- Los correos, reembolsos, rotación de credenciales históricamente expuestas y producción siguen fuera de esta entrega.
