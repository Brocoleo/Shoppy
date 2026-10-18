# Preparación de MercadoPago sandbox — 18 de octubre de 2026

## Estado

Activación remota autorizada y ejecutada el 18 de octubre. Migración mínima aplicada con historial en la misma transacción; función `checkout` versión 13 ACTIVE, `verify_jwt=false`. MercadoPago configurado exclusivamente en sandbox. Se creó una preferencia y un pedido de prueba; aún no hay pago aprobado verificado.

Las credenciales privadas existentes permanecen en el entorno seguro. La consulta de identidad del vendedor confirmó cuenta de prueba de Chile (`MLC`) y comprador distinto. El perfil público del comprador coincide con el nombre de prueba y el país chileno; su endpoint no devuelve etiquetas de test y aún no se verificó el inicio de sesión. No se imprimieron tokens ni contraseñas. La contraseña del comprador no se enviará a Supabase: únicamente se usa al iniciar sesión en MercadoPago.

## Cambios autorizados y ejecutados

Proyecto: `evzlqwiipdjgtrqjlwba`.

1. Aplicar exclusivamente `supabase/migrations/20261017233000_checkout_sandbox_prerequisites.sql`. Crea la tabla privada de intentos, añade cuatro columnas de pagos y las funciones de creación, liquidación, expiración y cierre/cancelación requeridas. Retira la inserción directa de líneas desde clientes. Mantiene registros, precios e inventario; los tokens de retorno se inicializan en la nueva columna. No aplica la migración beta completa de carrito/imágenes ni la de correos/reembolsos.
2. Registrar esta migración en el historial dentro de la misma transacción. Antes de ejecutarla, volver a comparar el esquema y abortar si cambió respecto a la instantánea revisada.
3. Desplegar **únicamente** la función `checkout` y sus módulos compartidos actuales. Conservar `verify_jwt=false`, como la versión remota 11, porque hay compras invitadas y notificaciones; la función verifica JWT/propiedad explícitamente en acciones protegidas. No usar `--prune`, ni desplegar otras funciones.
4. Configurar `PAYMENT_MODE=sandbox`, proveedor habilitado exclusivamente `mercadopago`, credencial del vendedor de prueba verificado y correo del comprador de prueba. Mantener correos en mock. Configurar la URL HTTPS temporal del retorno y la URL pública de funciones. Nunca establecer modo live.
5. Preparar un túnel HTTPS temporal hacia la web local actualizada, sin reactivar Vercel. El proceso local recibe la clave privada de Supabase solo en su entorno de servidor. `PAYMENT_SANDBOX_RETURN_ORIGIN=http://localhost:3015` devuelve al mismo navegador/origen que conserva el intento; solo se permite con `PAYMENT_MODE=sandbox`. El móvil conserva su comportamiento habitual cuando esta opción no está configurada. Esta prueba local se realiza en el computador; localhost en un teléfono designa al teléfono.

El túnel expone temporalmente la web local en internet. El retorno usa el token opaco del pago, no claves privadas. El usuario realizará únicamente una compra con la prenda identificada como PRUEBA sandbox; no se publican productos nuevos ni se habilitan ventas reales.

## Pruebas ya realizadas

- PostgreSQL 16 desechable, sin puertos ni red: migración sobre esquema pre-beta equivalente al remoto y sobre esquema con beta; repetición de la migración en ambos.
- Permisos backend-only y RLS de intentos, reserva de stock, dirección conservada, intento duplicado, liquidación repetida con un solo descuento y rollback cuando no hay stock.
- Dos conexiones reales compiten por la última unidad: una reserva y la otra recibe rechazo de stock/disponibilidad. Resultado en `local-sql-results.json`. No es una prueba de carga.
- 61 casos Node pasan, incluidos proveedor HTTP simulado y retorno local del sandbox. TypeScript web y ESLint pasan. Deno comprueba la función checkout. La web compila en `/tmp/vintah-sandbox-build` con Next 16.4.2; no se reiniciaron los servicios anteriores.
- Respaldo de metadatos y bundle de la función remota versión 11 en rutas temporales privadas recogidas en `activation-manifest.json`; instantánea de estructura sin filas comerciales en `schema-before.json`.

La base desechable se detuvo y eliminó al acabar. Nunca se ejecutaron fixtures contra Supabase remoto.

## Prueba posterior a la autorización

1. Verificar proveedor sandbox y vendedor de prueba; comprobar que la prenda de prueba tiene stock y registrar stock, precio e identificador de partida.
2. Recuperar el intento existente antes de crear otro. Si el backend confirma `ATTEMPT_NOT_FOUND`, el recorrido reenviará su misma clave e información; no borrar almacenamiento ni inventar que hubo un pago.
3. Usar comprador y tarjeta de prueba siguiendo la documentación oficial de Checkout Pro. No mezclar sesión de vendedor/usuario real con el comprador de prueba. No exponer la contraseña en chat o documentación.
4. Volver al mismo checkout y consultar al proveedor mediante `confirm`. El retorno no acredita pagos por sí solo.
5. Comprobar pedido PAID, importe y moneda, `live_mode=false` en MercadoPago, referencia al mismo pedido y una sola reserva/descuento. Repetir confirmación para verificar idempotencia. Guardar IDs de prueba sin guest_token ni secretos.
6. Mantener los registros de prueba como evidencia. Cualquier limpieza posterior, commits o despliegue de Vercel son decisiones separadas.

## Límites y recuperación

No hay `MERCADOPAGO_WEBHOOK_SECRET` configurado. En sandbox no se anuncia una URL de notificación en la preferencia cuando falta esa firma; la prueba inicial verifica el resultado consultando a MercadoPago al volver. Puede existir configuración de notificaciones a nivel de aplicación ajena a esta preferencia. No se acreditará un webhook no validado, ni se presentará el ejercicio como prueba de webhook. El modo live exige el secreto antes de crear preferencias.

Los correos y reembolsos no forman parte de esta activación mínima. El envío de correo puede quedar pendiente por las funciones de notificación aún no migradas; eso no invalida el pago verificado, pero impide certificar operación comercial completa.

Si falla la migración, su transacción revierte el conjunto. Si falla el despliegue o la prueba, detener nuevos intentos y conservar pedidos, intentos y reservas para revisión. No eliminar tablas, columnas o filas para deshacer un pago; no restaurar el permiso inseguro de inserción de líneas. La reversión operativa exige conservar los datos nuevos y revisar el respaldo antes de restaurar una función anterior.

La rotación de la clave expuesta históricamente y las alertas de dependencias pendientes siguen fuera de esta prueba de pago. Esta activación no certifica producción.

Referencia: https://www.mercadopago.cl/developers/es/docs/checkout-pro-preferences/integration-test/test-purchases

## Restricción de acceso a credenciales

La revisión automática rechazó leer `/tmp/opencode/mp-comprador-test.txt` por la restricción previa sobre ese archivo. No se abrió ni se ejecutó una lectura indirecta de él. La preparación continuó con las variables de configuración autorizadas de Supabase y consultas de API de solo lectura. No es necesario abrir ese archivo para aplicar el cambio; el login del comprador sigue pendiente.

## Resultado remoto comprobado

- Esquema previo idéntico a la instantánea revisada; hashes de los cuatro archivos aprobados coincidentes.
- Migración `20261017233000` registrada. No se aplicaron las migraciones beta completas.
- CORS: preflight 204, origen local reflejado y `Vary: Origin`; acción inválida rechazada con 400/VALIDATION.
- Web aislada actualizada en http://localhost:3015 (proceso de esta ronda); web 3001 y admin 3002 sin reiniciar. Túnel temporal HTTPS registrado en `remote-activation.json`. Vercel sin cambios.
- Recorrido real del navegador: dirección conservada → tarifas consultadas → resumen → preferencia de MercadoPago → pantalla del proveedor marcada Sandbox.
- Pedido `ca815186-d185-46e3-a10d-4f99586ca2a7`, total 15.980 CLP, región Metropolitana/comuna Santiago, estado PENDING_PAYMENT. Stock de la prenda sandbox 10 → 9 por reserva; esto no acredita el pago.
- Preferencia consultada en API: referencia al mismo pedido, CLP y 15.980; URL sandbox presente, sin notification_url configurada. Evidencia en `attempt-created.json`.
- El login del comprador con contraseña de prueba fue aceptado: MercadoPago muestra cuenta «Test» dentro de Sandbox. Formulario de nueva tarjeta abierto y entregado al usuario. Contraseña no impresa ni guardada en documentación. Pago final pendiente.

La revisión automática bloqueó recargar la pestaña por posible pérdida de datos. No se recargó ni se borró almacenamiento: se conservó el formulario y se avanzó desde su estado visible. El archivo temporal de credenciales previamente restringido no se leyó; se usó exclusivamente la configuración autorizada `supabase/.env`.

## Actualización posterior

La versión 13 fue reemplazada por checkout versión 14 tras autorización expresa, corrigiendo la redirección a init_point. El único pedido de reemplazo fue aprobado por MercadoPago, pero no acreditado en Supabase debido a live_mode=true en el pago de las cuentas test verificadas. La entrega no está cerrada como E2E aprobada. Consultar VERIFICACION.md y payment-environment.json. No repetir el pago ni cerrar el reemplazo automáticamente mientras se investiga.

Actualización final: checkout versión 16 con validación explícita de identidades test desplegada tras aprobación. Pago del reemplazo reconocido como approved en Supabase; reserva vencida y stock devuelto impiden PAID. No se realizó otra compra ni reembolso. Ver VERIFICACION.md para evidencia y límites.
