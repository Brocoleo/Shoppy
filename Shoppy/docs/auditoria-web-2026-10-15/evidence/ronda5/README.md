# Ronda 5 · Catálogo, ofertas y arquitectura

La portada tenía la dirección editorial A, pero catálogo y colecciones conservaban su cabecera anterior. Además, el catálogo ordenaba por tendencia y las ocho prendas demo nuevas quedaban detrás del catálogo anterior.

## Cambios

- Cabecera editorial compartida de catálogo y colecciones, con fotografía de modelo, título amplio y ruta de navegación. En móvil la fotografía ocupa una franja compacta para mantener productos accesibles.
- Búsqueda y selectores con separadores inferiores, conservando etiquetas y foco visible.
- Novedades como orden predeterminado. `orden=tendencia` y las ordenaciones por precio siguen disponibles y se conservan al recargar. La URL sin `orden` corresponde ahora a novedades.
- Ofertas conserva su asociación de cuatro prendas y sus precios: no se añadieron descuentos ficticios ni productos demo a esa colección. Sus cuatro fotos originales siguen siendo placeholders. La foto editorial de cabecera no representa prendas disponibles en la colección.
- Arquitectura dibujada y explicada en [ARCHITECTURE.md](../../../ARCHITECTURE.md), a partir de web, móvil, admin, paquetes y backend presentes en el repositorio.
- Importador demo compatible con el esquema base cuando no existe `image_cleanup`; retirada comprobada con transporte simulado. No hubo escrituras en Supabase durante esta ronda.

## Evidencia visual

| Pantalla | Antes | Después |
|---|---|---|
| Catálogo escritorio | [Captura](results/before-desktop-catalogo-viewport.png) | [Captura](results/after-desktop-catalogo-viewport.png) |
| Catálogo móvil | [Captura](results/before-mobile-catalogo-viewport.png) | [Captura](results/after-mobile-catalogo-viewport.png) |
| Ofertas escritorio | [Captura](results/before-desktop-ofertas-viewport.png) | [Captura](results/after-desktop-ofertas-viewport.png) |
| Ofertas móvil | [Captura](results/before-mobile-ofertas-viewport.png) | [Captura](results/after-mobile-ofertas-viewport.png) |

Las capturas comparan el mismo catálogo remoto. Se guardan también versiones completas; las imágenes que quedan fuera de la vista pueden conservar carga diferida. Las versiones viewport se extrajeron sin alterar la composición de las capturas.

## Pruebas

- Build de producción, TypeScript web, ESLint web y global correctos; diff sin errores de espacios.
- 22 comprobaciones específicas de catálogo y ofertas: orden por defecto, imágenes demo primero, ordenación explícita tras recarga, filtros, movimiento reducido, imágenes y ausencia de desbordamientos a 320, 390, 768 y 1440 px.
- Axe sin infracciones en 4 vistas de catálogo/ofertas (390 y 1440 px).
- Recorrido existente de 28 comprobaciones en Chrome: menú, Escape y foco, filtros, historial, búsqueda vacía, galería, carrito, validación y paso a despacho. Sin pedidos ni pagos reales.
- Una prueba del importador confirma mediante peticiones simuladas la retirada limitada a sus identificadores y rutas y la compatibilidad con un esquema sin cola de limpieza. No se ejecutó la retirada remota.
- No se repitió Lighthouse: esta ronda modifica las pantallas de listado; las mediciones de portada y sus límites siguen en la ronda 4. No se atribuyen mejoras de rendimiento a este ajuste.

Los scripts archivados conservan rutas del entorno local de esta sesión. Las fotografías de Ofertas siguen pendientes de material correspondiente a esas prendas. No hubo despliegue ni push.
