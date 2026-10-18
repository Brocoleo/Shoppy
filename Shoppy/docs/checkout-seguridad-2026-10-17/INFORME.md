# Checkout, pruebas y seguridad — 17 de octubre de 2026

## Estado de la entrega

Correcciones locales implementadas y verificadas. No se considera habilitado el checkout remoto ni lista la tienda para vender: existen bloqueos de esquema y permisos en Supabase. Se preservaron los cambios que ya estaban pendientes sobre `4eae9c7`. No hubo commits, push, despliegues, pedidos, pagos ni escrituras remotas.

## Cambios realizados

### Dirección y tarifas

- Las reglas de dirección y el listado chileno viven en módulos puros compartidos por la web y la función de checkout, sin credenciales. Se mantienen `address.street` y las tablas existentes. Los límites del formulario y del servidor proceden del mismo contrato; checkout fija Zod a la versión 3.25.76 usada por las pruebas locales.
- Un único campo exige nombre de calle y numeración posterior. Rechaza `123`, `5 de Abril` y `21 de Mayo`; acepta `5 de Abril 1234` y `Av. Providencia 1234, dpto 56`. Es una aproximación de formato, no geocodificación ni garantía de entrega. Domicilios sin numeración y formatos ajenos a ese patrón quedan pendientes de una decisión comercial.
- Se comprueba región y pertenencia de comuna en cliente y servidor. Las direcciones antiguas permanecen visibles para corregirlas. Una respuesta demorada no sobrescribe campos editados; la dirección guardada también se aplica al remontar desde caché. Los fallos de lectura tienen reintento.
- Se eliminan las equivalencias Ñuble/Biobío y Los Ríos/Los Lagos. El listado y el servidor aceptan tarifa regional explícita u OTRAS para una región conocida. La región del domicilio se conserva sin convertirla a una categoría tarifaria.
- Cambiar dirección invalida la selección de tarifa. Cotizaciones, tarifas y proveedores deben estar vigentes antes de iniciar un pago nuevo. Una caída del endpoint de proveedores ya no inventa un medio mock. La recuperación de un intento existente conserva su recorrido separado.

### Estabilidad

- Consultas SSR sin caché persistente para datos comerciales; se conserva React.cache dentro de la petición y el renderizado inicial.
- Reintento de lecturas fallidas en fichas y colecciones mediante refresh de la ruta.
- Una importación o lectura de sesión fallida puede recuperarse. La conexión evita duplicar listeners y descarta snapshots antiguos o resultados posteriores al desmontaje.
- Se corrige la importación que bloqueaba ESLint. Puertos predeterminados: web 3001, admin 3002; `PORT` sigue teniendo prioridad.
- TypeScript acepta extensiones explícitas compartidas con Deno en las aplicaciones afectadas. No se añadieron dependencias permanentes.

### Seguridad

- El servidor verifica cantidades, duplicados, precio, descuento, envío y total con datos de backend; rechaza importes corruptos y productos no comerciales. Se bloquean metadata demo/example y los IDs exactos de los veinte ejemplos y ocho demos, además de publicación, disponibilidad y stock.
- Se verifican JWT y propiedad en las operaciones protegidas. El guardado de dirección usa exclusivamente al dueño autenticado.
- Se conserva CORS con origen reflejado, sin credenciales, y se incorpora `Vary: Origin` preservando sus otros valores.
- MercadoPago valida firma, consulta al proveedor y comprueba identificador, importe, moneda, referencia y entorno. El cuerpo del webhook y el retorno del navegador no acreditan pagos. El modo real rechaza mock y pagos sandbox; sandbox rechaza pagos reales.
- Errores de DB/proveedor no exponen detalles internos; los códigos de RPC públicos usan una lista permitida. Los fallos transitorios del webhook permiten reintento. Los estados pendientes, rechazados y cancelados no se convierten en pago aprobado.
- Next y su configuración ESLint se actualizan de 16.3.6 a 16.4.2. También se actualizan, dentro de rangos compatibles, shell-quote a 1.12.0 y source-map-js a 1.2.2. El lockfile conserva versiones reproducibles.

## Verificación ejecutada

| Comprobación | Resultado y alcance |
| --- | --- |
| `npm run test:checkout` | 56 casos pasan: reglas 4, handler 24, proveedor 8, sesión 6, transporte SSR 1, carrito 9 y mapeo 4. |
| `npm run test:beta` | Pasan los cinco archivos requeridos; el runner agrega resultados por archivo, no se presentan como cinco casos de negocio. |
| `node scripts/editorial.test.mjs` | Pasa la suite editorial existente. |
| `npm run lint` | Sin errores ni advertencias. |
| `npm run typecheck` | Raíz, móvil y admin pasan. |
| `npm --workspace apps/web run typecheck -- --incremental false` | Pasa. |
| Deno `check supabase/functions/checkout/index.ts` | Pasa con Deno temporal, sin desplegar ni ejecutar operaciones. |
| Builds web y admin con `--webpack` | Pasan en `/tmp/vintah-checkout-isolated`, con Next 16.4.2 y las dependencias finales. |
| Navegador | 34 comprobaciones (29 checkout y 5 de recuperación SSR), 12 análisis axe sin infracciones y 22 capturas; 320, 390, 768 y 1440 px. |
| Escaneo limitado de JS público | 98 archivos finales de web/admin; sin coincidencias de los patrones privados revisados. No sustituye una auditoría completa de secretos. |
| `git diff --check` | Sin errores de espacios. |

Las pruebas ejecutan el handler y los proveedores reales con DB/HTTP simulados. La simulación de inventario reserva al crear el pedido y no vuelve a descontar al confirmar. Se comprueba repetición y convergencia en ese modelo; **no se ejecutaron bloqueos, transacciones, rollback ni concurrencia real de PostgreSQL**. La autenticación del navegador es ficticia y no prueba RLS con cuentas reales.

El navegador comprobó errores y reintentos de tarifas/proveedores, tarifa retirada durante revisión, regreso entre pasos, teclado, foco del error, Escape y retorno de foco, dirección antigua, campos editados durante carga y remonte desde caché. No envió operaciones de creación o confirmación. Los diez errores HTTP 503 de consola fueron inyectados deliberadamente; no hubo excepciones JavaScript ni tráfico externo sin interceptar.

Axe no certifica accesibilidad completa. Se emuló movimiento reducido, sin medir cada animación. La ficha y la colección recuperan contenido en la misma URL al pulsar Reintentar después de un fallo SSR simulado. Un segundo servidor aislado interceptó 23 GET y se detuvo al finalizar; no hubo consultas remotas en esa prueba. No hay una captura previa fiable: se entregan estados finales, sin afirmar comparación antes/después.

## Bloqueos y pendientes

1. **Alto, remoto:** INSERT de `order_items` permitido al propietario de un pedido pendiente. Requiere retirar escritura directa mediante migración específica revisada y autorizada. No basta ocultar controles.
2. **Compatibilidad remota:** faltan `create_checkout_order` y `settle_checkout_payment` en el proyecto configurado. Antes del sandbox se debe reconciliar el esquema requerido, sin aplicar ciegamente toda la migración beta.
3. **Credenciales:** una clave secreta expuesta previamente en el chat sigue pendiente de rotación autorizada. No se reproduce su valor.
4. **Dependencias pendientes:** auditoría del lockfile baja de 31 paquetes afectados (1 crítico/19 altos/11 moderados) a 28 (0 críticos/17 altos/11 moderados). Quedan avisos de Expo/React Native y herramientas, incluido lint. No se demostró explotación desde checkout; tampoco se consideran corregidos. No se aplicó `audit fix --force` ni cambios mayores de Expo.
5. **Procesos actuales:** no se reiniciaron web 3001, admin 3002 ni túnel. Sus dependencias instaladas siguen siendo las anteriores; las nuevas se instalaron y verificaron únicamente en la copia aislada. No considerar actualizado el proceso abierto por cambiar el manifiesto.
6. **Entorno real:** pago sandbox, webhook real, autorización con cuentas reales, firma emitida por el proveedor y atomicidad SQL quedan pendientes. El limitador existente es best-effort por instancia, no una cuota distribuida.

Estos bloqueos impiden certificar la aceptación de seguridad para publicación. La entrega de código local no equivale a su aplicación en Supabase o Vercel, que permanece sin reactivar.

## Evidencia y reproducción

- `security-review.md`: consultas remotas de solo lectura, políticas, privilegios y dependencias.
- `BROWSER.md` y `browser-check.cjs`: escenarios reproducibles y límites.
- `evidence/browser-results.json` y `evidence/ssr-retry-results.json`: comprobaciones, axe y errores simulados.
- `evidence/after-*.png`: capturas finales.
- `evidence/checks/`: logs de compilación, pruebas, lint, tipos, Deno y auditoría npm.

Vista aislada durante la entrega: `http://localhost:3015/checkout`. El arnés de navegador intercepta transportes; abrir esa URL manualmente no instala sus simulaciones ni habilita un pago remoto seguro.
