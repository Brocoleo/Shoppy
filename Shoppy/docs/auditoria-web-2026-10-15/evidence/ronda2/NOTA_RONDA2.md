# Ronda 2 — carrito, LCP móvil y prueba sin JavaScript (15 oct 2026)

Continúa `../README.md` sin modificarlo. No hay commit ni despliegue asociados.

## 1. Carrito: causas confirmadas y cambios

Causa del error ESLint `react-hooks/set-state-in-effect` (`lib/cart.tsx:55`):
carga inicial y fusión guest→usuario en el mismo `useEffect`.
Cambio: lógica pura extraída a `lib/cartStore.ts`
(`sanitizeLines`, `mergeCarts`, `addLine`, `setLineQty`); el proveedor usa
inicializador perezoso + recálculo durante el render al cambiar de dueño.
Comportamiento preservado: persistencia localStorage, fusión con cantidad
máxima sin duplicados, cambio login/logout. Endurecido: tope 99 y descarte
de entradas inválidas también en datos persistidos (antes aceptaba `""`,
`qty` no entero).

Pruebas:
- `node --test apps/web/src/lib/cartStore.test.ts`: 9/9 (sin deps nuevas).
- CDP real (`evidence/ronda2/cdp-verify.mjs`, Chrome headless + localStorage):
  carrito vacío inicial, persistencia tras recarga (badge "Carrito, 2 prenda(s)"),
  datos corruptos → vacío sin crash, orden de Tab
  (skip-link → marca → nav → carrito → login → hero → CTAs). Todo PASS
  (`cart-cdp-results.json`).
- Límite: transiciones login/logout con sesión real requieren cuenta
  (no creada); la fusión con qty máxima está cubierta por tests unitarios,
  no en navegador.

## 2. LCP móvil: medición y cambio mínimo

Reproducción sobre build de producción local (`next start :3002`),
misma sesión y condiciones, preset móvil con throttling:
- Antes: perf 0.95, LCP 1.9 s, TBT 250 ms, CLS 0.
- Después: perf 0.97, LCP 1.9 s, TBT 190 ms, CLS 0.
(JSON: `lighthouse-antes.json`, `lighthouse-despues.json`).
Causa confirmada: la imagen del hero se descubre tarde porque depende del
fetch cliente (taxonomía + productos vía anon key). Cambio mínimo aplicado
(`lib/catalog.ts`): categorías y marcas se piden en paralelo
(`Promise.all`) en vez de secuencial — elimina 1 RTT antes de cada consulta
de productos, sin cambiar consultas, filtros, RLS ni resultados
(captura `capturas/catalogo-levis-ronda2.png`: 3 prendas con `q=levis`).
Conclusión honesta: sin regresión; la mejora queda dentro del ruido del lab
(mediciones previas variaron 0.71–0.95 según carga). Eliminar el retraso por
completo exigiría SSR de datos (cambio arquitectónico, fuera de alcance).
Sin datos de campo (RUM): no extrapolar.

## 3. Sin JavaScript: qué funciona exactamente

`--disable-javascript --dump-dom` (`nojs-home.html`, `nojs-catalogo.html`):
- Home: shell estático (skip-link, header/nav/footer), copy fija del hero
  ("Prendas únicas, precios justos", CTAs como enlaces) y títulos de sección.
  Sin datos: sin tarjeta destacada, sin categorías, sin grids.
- Catálogo: formulario (input, selects con opciones estáticas, botones) pero
  cero prendas y filtros inoperantes.
- Corrección a la ronda anterior: la estructura visual NO equivale a
  catálogo funcional sin JavaScript; toda la lectura de datos es cliente.

## 4. Verificaciones
`web:typecheck`, `eslint apps/web --max-warnings 0`, `web:build` (13 rutas),
`test:beta` 20/20: verdes. Teclado por interacción real CDP (Tab);
código ya revisado (skip-link, nativos, `inert`, Escape, radios).
Reproducción: build + `next start -p 3002`, Lighthouse como en §2,
CDP con `evidence/ronda2/cdp-verify.mjs` (requiere Chrome + dev :3001).
