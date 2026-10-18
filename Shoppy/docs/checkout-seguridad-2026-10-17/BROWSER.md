# Verificación de navegador del checkout

Servidor de producción aislado: `http://127.0.0.1:3015`. Chromium local; viewports de 320, 390, 768 y 1440 px, alto 1000 px y preferencia de movimiento reducido. No se reinició ni interactuó con la sesión de checkout del servidor habitual.

## Resultados

- 29 comprobaciones pasan: dirección → despacho → revisión; rechazo de calle sin número y foco del error; selects mediante teclado y Tab; cambio de región limpia comuna y tarifa y requiere nueva cotización.
- Fallo simulado de tarifas, reintento, tarifas vacías y bloqueo del avance comprobados.
- Fallo de medios de pago no ofrece un proveedor ficticio como fallback; el reintento recupera las opciones. Una actualización de tarifas a lista vacía durante revisión deshabilita Pagar aunque conserve la cotización anterior.
- Sesión autenticada **simulada**: dirección antigua visible para corregir, respuesta demorada conserva el nombre ya editado y la dirección se aplica al volver al checkout desde la caché, sin repetir la lectura REST.
- Menú móvil: Escape cierra y devuelve el foco al botón.
- 12 análisis axe (WCAG 2 A/AA y 2.1 AA), cero infracciones detectadas. Esto no constituye certificación completa de accesibilidad.
- Sin desbordamiento horizontal en los cuatro anchos. Se inspeccionaron visualmente las capturas de despacho a 390 y dirección a 1440 px.
- 18 capturas en `evidence/`. Cero excepciones JavaScript. Diez mensajes de consola HTTP 503 corresponden a las respuestas de error inyectadas deliberadamente.

El navegador intercepta todo el tráfico de otros orígenes. Solo responde a consultas de proveedores, cotización, tarifas, direcciones y pedidos simulados. No se enviaron operaciones de creación, confirmación o pago; no hubo peticiones remotas sin cubrir. La sesión de prueba usa un token ficticio local; no valida autenticación real ni RLS remota.

No existe una captura anterior fiable de la misma revisión: el servidor habitual puede recompilar cambios del mismo árbol. Por ello se entregan capturas finales, sin presentarlas como comparación antes/después.

## Reproducción

Con el servidor aislado listo y la configuración pública de Supabase disponible en su build:

```sh
node docs/checkout-seguridad-2026-10-17/browser-check.cjs
```

El arnés usa el navegador y Playwright instalados en esta máquina, sin añadir dependencias al proyecto. `CHECKOUT_TEST_URL` permite cambiar el destino local. Los resultados estructurados están en `evidence/browser-results.json`. La preferencia de movimiento reducido se emula y verifica; no se afirma haber medido individualmente cada animación.

## Recuperación SSR en ficha y colección

Se ejecutó además `node docs/checkout-seguridad-2026-10-17/browser-ssr-retry.cjs` contra un servidor temporal exclusivo en 3016, con la misma build aislada. El proceso instala `ssr-fetch-fixture.cjs` antes de arrancar Next: intercepta las lecturas Supabase del servidor y bloquea cualquier otro transporte externo. El navegador también intercepta todo origen externo.

**5 comprobaciones pasan**, cero excepciones JavaScript y cuatro capturas adicionales. En ficha y colección, una respuesta 503 muestra error con Reintentar; tras retirar el fallo, pulsar ese botón actualiza los datos SSR y renderiza el contenido recuperado en la misma URL. Se interceptaron 23 lecturas GET, sin operaciones de escritura ni red remota. El servidor temporal 3016 quedó detenido al terminar. Los resultados están en `evidence/ssr-retry-results.json`.
