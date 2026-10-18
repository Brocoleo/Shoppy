# Checkout aislado local — 18 de octubre de 2026

## Resultado

La etapa local está preparada y verificada con datos ficticios. Vista: http://localhost:3020/prueba-local.html. No equivale a certificar pagos, PostgreSQL, RLS ni notificaciones remotas.

El simulador reutiliza el handler real de `supabase/functions/checkout/index.ts` y la fixture extraída de sus pruebas existentes. Sustituye almacenamiento, RPC, autenticación y proveedor por implementaciones en memoria. No usa la función desplegada ni se conecta a Supabase o MercadoPago.

## Arranque y uso

Desde la carpeta Shoppy:

```bash
npm run checkout:local
```

Abre http://localhost:3020/prueba-local.html y pulsa **Iniciar nueva prueba**. Esa acción reinicia únicamente el inventario simulado y las claves guest del origen local 3020; no toca el almacenamiento de 3001/3015 ni datos remotos.

Dirección ficticia de ejemplo:

- Nombre: Prueba local.
- Email: prueba@example.test.
- Teléfono: +56911111111.
- Calle: 5 de Abril 1234.
- Región/comuna: Metropolitana/Santiago o Valparaíso/Valparaíso.

Hay una prenda ficticia de $12.990 y stock inicial 5. Tarifas ficticias: Metropolitana $2.990 y Valparaíso $4.990. Otras regiones permiten comprobar el estado sin tarifas. Los importes no proceden del inventario comercial.

En revisión selecciona **Simulación local**. La pantalla del proveedor ficticio permite elegir Aprobar, Pendiente, Rechazar, Cancelar, Reserva vencida y Corte de conexión. No pide tarjeta ni contraseña. Después de un corte, abre el panel, pulsa **Restablecer conexión**, entra en **Continuar intento local** y pulsa **Ya pagué, verificar pago**. No pulses Iniciar nueva prueba si quieres comprobar la recuperación del mismo intento.

**Consultar estado** muestra pedidos, stock, número de creaciones y transiciones a PAID. La memoria se pierde al detener el simulador. Ctrl+C detiene solo los dos procesos creados por este comando.

## Aislamiento

- Copia de fuentes en `/tmp/vintah-checkout-local`; no sustituye el checkout normal ni sus archivos de configuración.
- Web en loopback 3020 y adaptador en loopback 4010. Un proxy local del mismo origen evita conexiones directas del navegador a 127.0.0.1, bloqueadas por el navegador de esta sesión.
- El lanzador no lee `.env`, excluye esos archivos al copiar, rechaza configuraciones `.env` previas en la copia y pasa al proceso Next una lista limitada de variables. La URL y clave públicas son ficticias/locales. No transmite claves privadas.
- Una guardia del proceso bloquea destinos externos para fetch y HTTP/HTTPS; una CSP local limita conexiones del navegador. Hay pruebas de rechazo sin abrir conexiones. Es una protección de este proceso de pruebas, no un firewall del sistema.
- Las rutas REST simuladas son de lectura; las mutaciones permitidas son controles locales, pago simulado y acciones del handler contra memoria. Los orígenes externos se rechazan.
- No se crearon túneles, despliegues, migraciones, cuentas, pedidos remotos, pagos remotos ni reembolsos en esta etapa. No se tocaron los intentos remotos históricos, los otros servicios, Vercel ni Git remoto. No hay commits ni push.

## Cambios de la aplicación justificados por la prueba

1. Al enviar una dirección vacía, el esquema devolvía `Required`. Ahora los seis campos obligatorios tienen instrucciones específicas en español, cubiertas por una regresión.
2. El texto de error estaba dentro de la etiqueta del input, cambiando su nombre accesible (por ejemplo, «Nombre completo Required»). La etiqueta es ahora explícita y el error sigue asociado mediante aria-describedby. Se comprobó el foco automático en el primer inválido y Tab al campo siguiente con foco visible.
3. El retorno no tenía encabezado ni región de anuncio. Ahora usa h1 y role=status/aria-live=polite para comunicar el resultado actualizado.

El resto de los cambios de esta ronda es soporte de pruebas. La extracción de la fixture conservó las 24 pruebas anteriores del handler. No se reescribió la aplicación ni se añadieron dependencias permanentes.

## Comprobaciones ejecutadas

| Comprobación | Resultado | Evidencia |
| --- | --- | --- |
| `node scripts/test-checkout.mjs` | 78 casos, cero fallos | tests.log |
| `npm run test:beta` | 5 casos, cero fallos | beta.log |
| `npm run lint` | correcto, sin warnings | lint.log |
| `tsc --noEmit -p apps/web/tsconfig.json` | correcto | typecheck.log |
| `tsc --noEmit -p tsconfig.json` | correcto | root-typecheck.log |
| `npm run checkout:local -- --build` | build webpack correcto en segunda copia aislada | build.log |
| Axe en dirección con errores, despacho, revisión, pedido y retorno | cero infracciones detectadas en main de esas vistas | browser-results.json |
| Formulario a 320, 390, 768, 1440 px | sin desbordamiento horizontal | browser-results.json y capturas |

Para compilar con el comando anterior debe estar activa la vista local: sus lecturas iniciales apuntan al adaptador local. La compilación usa `/tmp/vintah-checkout-local-build` y no interrumpe la vista en desarrollo.

Axe se tomó de una instalación temporal ya existente; no se añadió al proyecto. Para disponer del botón de auditoría en otra sesión, establece LOCAL_AXE_PATH con la ruta a un `axe.min.js` ya instalado al ejecutar el lanzador. Sin esa variable el botón informa que axe no está disponible. Las pruebas unitarias y el simulador no dependen de axe.

## Recorridos observados en navegador

- Dirección válida y nombre de calle numérico con numeración adicional; validación vacía con instrucciones en español.
- Atrás desde despacho conserva campos. Cambiar Metropolitana por Valparaíso limpia comuna e invalida selección/cotización; cambia despacho de $2.990 a $4.990 y total a $17.980.
- Región sin tarifas: explicación visible y Revisar pedido desactivado.
- Aprobar: retorno al mismo origen, pedido PAID, carrito vacío, stock 5 → 4, una creación y una transición pagada. Capturas pagado-390.png y pagado-1440.png.
- Pendiente: no pasa a PAID; recargar checkout recupera el mismo intento, y verificar de nuevo no crea otro. Captura pendiente-recuperado.png.
- Rechazar y Cancelar: no pasan a PAID. El contrato actual del proveedor representa cancelación como REJECTED y muestra el mismo mensaje de rechazo. Cerrar la cancelación devuelve al formulario y restituye stock a 5; cancelled-state.json.
- Reserva vencida: stock restituido y revisión de reserva vencida; no PAID. No se inicia reembolso.
- Corte de conexión: HTTP 503 simulado al confirmar, con intento preservado. Restablecer y verificar llega a PAID con un solo pedido, un descuento y una transición; network-recovered-state.json.
- Tab, foco en error y Escape del selector: Escape cierra y conserva foco en Región. El resultado del retorno tiene región viva polite.

## Límites precisos

El almacenamiento, reserva, transacción, stock, pago, autenticación y correo son simulaciones; no validan concurrencia real, SQL/RLS, credenciales ni firma del proveedor. El corte reproduce una indisponibilidad HTTP 503, no desconecta físicamente el dispositivo. No se hicieron pruebas con lector de pantalla real ni desconexión de red del sistema.

La copia usa Next 16.3.6 instalado localmente; el manifiesto contiene trabajo previo de actualización que no se instaló sobre los servicios compartidos. Esta ronda no certifica dependencias ni producción. La guardia y las herramientas solo se inyectan en la copia temporal, no en el despliegue normal.

La verificación remota y el incidente histórico del pago con reserva vencida quedan para otra etapa autorizada. No volver a pagar ese intento. No se declara lista la tienda para vender.
