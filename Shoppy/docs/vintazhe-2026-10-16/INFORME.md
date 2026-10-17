# vinta.zhe — implementación y verificación

16 de octubre de 2026. Implementación sobre HEAD `8b039c1bed9c4a2df250ef269ebb8949cbf068c6`, conservando el trabajo pendiente. Sin commits ni despliegue. Web local: [localhost:3001](http://localhost:3001). Admin: [localhost:3002](http://localhost:3002).

## Resultado

Se adaptó la composición A al nombre y fotografía reales de vinta.zhe: marfil/carbón, titular con segunda línea cursiva, fotografías asimétricas en escritorio, imagen principal en móvil y archivo en dos columnas. Se conservaron las familias tipográficas y las transiciones existentes, con movimiento reducido.

La portada y las cabeceras de catálogo y ofertas usan fotografías reales. Las fichas de archivo tienen galería, publicación de origen y aviso de no compra; no muestran precios, tallas, condición ni disponibilidad inventados. Los productos comerciales mantienen una interfaz independiente. El favicon reutiliza la imagen original del perfil; el icono anterior del admin está preservado en evidencia.

El catálogo incorpora Todo / Disponibles / Archivo en la URL. La búsqueda filtra los títulos del archivo. Categoría, marca y ordenación por precio excluyen el archivo con explicación visible. Disponibles exige stock y estado AVAILABLE. Tendencia conserva el orden comercial del servidor; el archivo se añade por fecha. Los errores de una fuente no ocultan resultados válidos de la otra.

### Antes y después

| Antes | Después |
|---|---|
| SHOPY y modelos generados | vinta.zhe y fotografía del Instagram indicado |
| 28 productos ficticios visibles | 28 conservados sin publicar; archivo real sin compra |
| Portada fijada en código; Home guardaba JSON sin efecto | Controles de portada conectados con el HTML inicial |
| Admin incómodo a 320 px y publicación mezclada con datos | Datos → Fotos → Revisión; borrador inicial y publicación explícita |
| Cambio de sesión podía reiniciar el editor | Mismo usuario conserva su borrador; otro usuario vuelve a validar el rol |

[Comparativa móvil de portada](evidence/comparativa-home-390.png) · [Comparativa escritorio](evidence/comparativa-home-1440.png) · [Catálogo móvil](evidence/comparativa-catalogo-390.png) · [Catálogo escritorio](evidence/comparativa-catalogo-1440.png).

La comparación muestra un cambio deliberado de contenido: demos frente a archivo real. No es un experimento de rendimiento con contenido idéntico ni una comprobación píxel a píxel de una maqueta externa no disponible en esta ronda.

## Contenido y cambios remotos

Proyecto verificado: `evzlqwiipdjgtrqjlwba`. Instagram permitió recuperar **12 publicaciones y 40 fotos**, incluidos carruseles. No aparecieron publicaciones nuevas tras tres intentos de desplazamiento; se inspeccionaron las publicaciones públicas individuales sin iniciar sesión. No se afirma haber obtenido el historial privado o bloqueado.

| Publicación | Fecha devuelta por Instagram | Fotos |
|---|---|---:|
| [Selección en percha](https://www.instagram.com/vinta.zhe/p/CDrmUrRhvDO/) | 2020-08-09 | 1 |
| [Conjunto con cinturón](https://www.instagram.com/vinta.zhe/p/CMS5wJ-hhYX/) | 2021-03-11 | 2 |
| [Camiseta y denim](https://www.instagram.com/vinta.zhe/p/ChTOzSiLGb6/) | 2022-08-16 | 6 |
| [Falda de denim](https://www.instagram.com/vinta.zhe/p/CodgH6ur3yz/) | 2023-02-09 | 3 |
| [Vestido floral](https://www.instagram.com/vinta.zhe/p/CodfzQHLZD2/) | 2023-02-09 | 6 |
| [Falda oscura](https://www.instagram.com/vinta.zhe/p/CodegKzr1Tq/) | 2023-02-09 | 3 |
| [Shorts de denim](https://www.instagram.com/vinta.zhe/p/CoddYQ5rIJi/) | 2023-02-09 | 4 |
| [Bolso burdeos](https://www.instagram.com/vinta.zhe/p/Ck1wf4CrYeV/) | 2022-11-11 | 4 |
| [Selección de bolsos](https://www.instagram.com/vinta.zhe/p/Cka6K0Mg8lh/) | 2022-11-01 | 1 |
| [Camisa a rayas](https://www.instagram.com/vinta.zhe/p/Cj1WuISr2dh/) | 2022-10-17 | 3 |
| [Detalle de denim](https://www.instagram.com/vinta.zhe/p/Cj1VvsILndI/) | 2022-10-17 | 4 |
| [Falda a cuadros](https://www.instagram.com/vinta.zhe/p/CigXsWrLc-q/) | 2022-09-14 | 3 |

Los WebP mantienen proporción y dimensiones conocidas; se validó SHA-256 antes de subir. Manifiesto y fotos: `supabase/seed/vinta-archive/`. Se añadieron 40 objetos bajo `vinta/archive/2026-10-16/`, una sección `vinta-archive` y la configuración de `hero`. El archivo no se insertó en `products`. Lectura pública: 40/40 fotos HTTP 200.

La segunda ejecución de la importación mantuvo 12 publicaciones y 40 rutas; no duplicó objetos ni restableció la portada. El respaldo previo, snapshots y progreso están en `last-run.local.json`, ignorado por Git. Retirada y fallos parciales se probaron con transporte simulado; no se retiró el lote remoto como prueba.

Los 20 productos del seed histórico se contrastaron por ID, slug y nombre; los ocho demos editoriales, por manifiesto y metadatos. Se cambió únicamente su publicación a null, conservando los 28 productos y sus archivos. Registro reversible: `retired-demos.local.json`. La lectura anónima devuelve cero productos comerciales actuales. Cotizaciones de muestra de ambos lotes recibieron 409 PRODUCT_UNAVAILABLE, sin crear pedidos.

La migración de imágenes quedó aplicada como **20261016161216_admin_images_vinta_20261016**. Añade RPC de portada y orden, portada automática inicial y cola durable de limpieza con RLS y comprobación de administrador. No se aplicaron cambios de carrito, checkout, usuarios ni pagos. El archivo beta pendiente con objetos duplicados debe reconciliarse antes de aplicarlo; no se modificó ni se ejecutó un push global de migraciones.

## Administración

El admin reutiliza Supabase Auth y sus roles existentes. El formulario crea borradores, conserva el slug manual y la fecha de publicación, valida la publicación y detecta escrituras concurrentes. Las fotografías se optimizan en el navegador, muestran progreso y permiten reintentar solo las pendientes. Los cambios de usuario vuelven a validar la autorización; las actualizaciones del mismo usuario conservan el formulario.

Home permite texto, destino, fotos, posición y modo de encuadre sin editar JSON. También permite títulos y visibilidad del archivo. [Guía para usarlo](GUIA_ADMIN.md).

Interfaces nuevas: `@shopy/shared/editorial` comparte imágenes, archivo, portada y validadores; el archivo conserva un tipo independiente de CatalogProduct. El producto conserva opcionalmente availability del servidor. No se añadieron dependencias permanentes a la aplicación. Prettier y PostgreSQL embebido se usaron fuera de sus dependencias.

## Pruebas y evidencia

- Build de producción web y admin, TypeScript raíz/móvil/admin y web, ESLint y diff-check: correctos. La comprobación final de tipos web desactiva únicamente la caché incremental para evitar escritura fuera del sandbox.
- **64 pruebas nativas**: beta 20, carrito 9, mapeo 4, contenido editorial 5, importación 13 y retiro 13. Son pruebas del árbol de trabajo actual, que conserva archivos beta pendientes del usuario; no se presentan como un nuevo snapshot comprometido. El runner beta rechaza explícitamente carpetas sin pruebas.
- Migración ejecutada en PostgreSQL embebido: aplicación repetida, permisos, pertenencia de imágenes, portada única, orden y limpieza. También se probó después de los objetos beta y frente a portadas duplicadas. Fixtures revertidas. No se simula con expresiones regulares un resultado de SQL.
- **19 escenarios de admin** con autenticación y transporte simulados: creación/slug, borrador y avance a Fotos, portada requerida, carga parcial y reintento, orden, publicación, fecha conservada, precio inválido, concurrencia, sesión, texto, encuadre y visibilidad. La prueba de pérdida de borrador falló antes de la corrección y pasó después.
- **8 escenarios adicionales de catálogo**: independencia de fuentes, recuperación parcial, Tendencia, reserva con stock positivo y adición de una prenda comercial simulada al carrito.
- Matriz de 20 vistas web y 16 de admin a 320, 390, 768 y 1440 px: sin desbordamiento. Axe en 18 vistas: cero infracciones automáticas. La revisión geométrica confirmó cero superposición entre descripción y foto secundaria en los cuatro anchos.
- Navegador: búsqueda vacía, filtros e historial, galería, menú/Escape/retorno de foco y Tab. Movimiento reducido probado sobre el elemento realmente animado: editorial-enter en modo normal y none con la preferencia reducida.
- HTML sin JavaScript: ocho entradas de archivo, imagen principal y una precarga de imagen. No se repiten inmediatamente las lecturas de novedades ni contenido editorial. Filtros, carrito, galería interactiva y administración requieren JavaScript.
- No hubo excepciones pageerror en la matriz. Las cancelaciones registradas son ERR_ABORTED de navegación/prefetch. Se detectó un favicon 404, se corrigió con el icono de la cuenta y la comprobación final obtuvo 200 sin errores de consola.
- Se compararon las credenciales locales reales con los bundles estáticos: cero coincidencias. No se exportaron archivos de entorno a esta evidencia.

### Lighthouse móvil

Lighthouse 13.5.0, Chrome headless, emulación móvil y throttling simulado; producción local, tres navegadores nuevos por ruta y caché del optimizador de imágenes calentada. Máquina compartida y datos de laboratorio, sin métricas de campo. Resultados y trazas comprimidas adjuntos.

| Ruta | Puntuaciones | Mediana | Mediana LCP | Mediana TBT | CLS |
|---|---|---:|---:|---:|---:|
| Portada | 97 / 94 / 93 | 94 | 2.31 s | 225 ms | 0.000 |
| Catálogo | 89 / 91 / 92 | 91 | 2.51 s | 280 ms | 0.000 |

LCP de portada corresponde al párrafo descriptivo en las tres trazas; en catálogo, a la fotografía de la falda de denim. No se atribuye el cambio de puntuación a una mejora causal frente al informe histórico: contenido y composición cambiaron. CLS fue cero en las seis mediciones. La imagen principal se descubre en el HTML inicial, comprobado además sin JavaScript.

## Límites pendientes

No se probó una cuenta administradora real, un lector de pantalla, dispositivos físicos ni la decodificación HEIC en Safari móvil. El acceso real requiere una cuenta administradora ya existente; no se crearon cuentas ni se cambiaron roles. La revisión automática de accesibilidad no sustituye esas pruebas.

Checkout y los hallazgos previos del carrito siguen fuera de esta intervención y no se certificaron para venta real. No hubo pedidos ni pagos reales. Ofertas no contiene prendas comerciales verificadas actualmente; no se inventaron descuentos para rellenarla.

No hubo commits ni despliegue. Los cambios de contenido en Supabase son remotos y pueden afectar al despliegue anterior, aunque este conserve todavía el diseño antiguo. La clave secreta expuesta por el usuario en el chat debe rotarse; no se repitió en informes ni código.
