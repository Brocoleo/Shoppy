# vinta.zhe — Catálogo confiable y admin móvil

Fecha de la ronda: 16 de octubre de 2026, America/Santiago.

## Resultado

Las 20 prendas no confirmadas del seed se conservaron como ejemplos y se despublicaron. No se borraron productos, imágenes ni relaciones. La tienda muestra el archivo real de Instagram y estados vacíos para inventario disponible y ofertas. Los ocho demos generados siguen excluidos del contenido comercial.

Admin: Productos y Ejemplos separados; ejemplos de solo lectura; «Usar como base» prepara una prenda nueva copiando exclusivamente categoría y segmento. No se copian fotos, nombre, marca, talla, estado, color, precios, stock, promociones ni métricas. Se revisan datos y fotos antes de publicar. La selección de estado empieza pendiente y las etiquetas de los controles tienen nombres accesibles explícitos.

Esta etapa no certifica checkout ni habilita ventas. No hubo commits, despliegues, cuentas nuevas, cambios de roles, pedidos ni pagos reales.

## Datos remotos y reversión

Proyecto comprobado: `evzlqwiipdjgtrqjlwba`. La comparación encontró 20/20 coincidencias con los datos comerciales del seed; cero excluidos. Los contadores de visitas y favoritos son datos variables de navegación: no se usaron como identidad comercial y se conservaron.

Cambios remotos permitidos por producto: `metadata.example=true`, `metadata.example_batch=vinta-examples-20261016` y `published_at=null`; además cambia `updated_at` por el mecanismo existente. Se verificó contra los snapshots que todos los demás valores de los 20 registros se conservaron. El metadata anterior también se conserva.

Antes de la primera escritura se guardaron snapshots completos en `supabase/seed/vinta-archive/examples.local.json`, ignorado por Git y con permisos privados. El script compara ID, snapshot y versión antes de actualizar. La repetición real informó 20 ya clasificados y cero cambios nuevos. Las 28 cotizaciones reales de solo cálculo devolvieron HTTP 409 `PRODUCT_UNAVAILABLE`; no se invocaron acciones de creación, confirmación o pago.

La reversión y fallos de transporte se probaron únicamente de forma simulada. `--restore` solo repone metadata/publicación cuando el registro sigue idéntico al resultado propio. Una edición posterior se conserva; una escritura de resultado incierto se registra por ID, incluso tras reanudar. No se ejecutó la reversión remota. Los ocho demos permanecen con metadata demo y stock cero; esta herramienta no los modificó.

Los IDs exactos del seed siguen excluidos por el filtro público aunque una variante se omita de la clasificación por estar modificada. Ese filtro también se usa en las vistas, metadatos y sitemap. Los registros ajenos al lote no se clasifican.

Evidencia: [simulación](evidence/dry-run.json), [aplicación](evidence/applied.json), [repetición](evidence/repeated.json) y [verificación remota](evidence/remote-verification.json).

## Fotografías, avisos y SEO

El uploader de placeholders ahora simula por defecto; escribir requiere `--apply`. Usa creación exclusiva (`upsert:false`), conserva archivos existentes y devuelve conflictos/errores por archivo. No se ejecutó una carga remota de placeholders.

El aviso de almacenamiento tiene una sola acción «Entendido». Conserva reconocimiento de elecciones guardadas anteriormente, permite reapertura desde el pie, coloca foco al abrirlo explícitamente y lo devuelve al cerrar o pulsar Escape. No se añadió analítica.

Las páginas legales siguen identificadas como borradores. Se eliminaron correos ficticios enlazados y afirmaciones operativas no verificadas de envíos, pagos y fotografías comerciales. Queda pendiente completar identidad legal y revisar condiciones antes de vender; no se certifica cumplimiento legal.

Se preservaron los cambios SEO que el usuario estaba realizando durante la ronda, incluida la sustitución de Open Graph generado por una imagen estática. Solo se integraron dos ajustes concretos en esos archivos: leer el ID en el sitemap para filtrar ejemplos y retirar de la descripción global la promesa de envíos a todo el país. Los demás archivos SEO no se restauraron ni sobrescribieron.

## Pruebas ejecutadas

- **78 pruebas nativas, cero fallos**, en diez archivos: editorial, carrito puro, mapeo de catálogo, uploader, clasificación, importador/retiro anterior y pruebas beta móvil/backend. El registro distingue pruebas de simples ejecuciones de archivos: [comandos y resultados](evidence/checks.json).
- TypeScript raíz/móvil/admin y web; ESLint; `git diff --check`: correctos. Sin dependencias nuevas.
- Build web con `npm run web:build`: correcto. Build admin con `npm --workspace apps/admin run build -- --webpack`: correcto. El build admin habitual con Turbopack falló en este entorno al enlazar un puerto desde un proceso CSS; se conserva ese límite y se prepara el despliegue admin con Webpack, alternativa integrada. Hubo además un intento web coincidente con el reemplazo de Open Graph y otro con un build simultáneo; se repitió y el build final pasó.
- **29 comprobaciones de admin con autenticación y transporte simulados**, sin escrituras comerciales remotas: separación de ejemplos, original de solo lectura, copia de categoría/segmento, campos vacíos, estado obligatorio, creación con ID/slug distintos, conservación del original, rechazo de origen comercial, borrador, validación, carga parcial/reintento, portada/orden, publicación, edición concurrente, persistencia de formulario ante evento de sesión, Home y rechazo de cuenta sin rol administrador.
- Admin: 16 vistas a 320/390/768/1440 px; tienda: 20 vistas a esos mismos anchos. Sin desbordamientos ni errores JavaScript capturados.
- **Axe en 18 vistas**, a 390/1440 px: cero infracciones automáticas. Esto no sustituye una revisión completa con lector de pantalla.
- Web: archivo y galería, ausencia de botones de compra en ejemplos/archivo, enlace al archivo en Disponibles y Ofertas, aviso con almacenamiento bloqueado, compatibilidad de reconocimiento anterior, foco/Escape, Tab, movimiento reducido. HTML inicial sin JavaScript incluye enlaces del archivo y precarga de la imagen principal.
- Dos valores secretos reales se buscaron por coincidencia exacta en 70 archivos de bundles públicos web/admin: cero coincidencias. No se copiaron archivos `.env` al informe.

Evidencia: [web](evidence/web-check.json), [admin simulado](evidence/admin-check.json), [build web](evidence/web-final-build.log), [build admin](evidence/admin-webpack.log) y [escaneo de bundles](evidence/client-secrets.json). Los scripts de navegador quedan incluidos para reproducir los escenarios; no contienen credenciales reales.

## Capturas

Comparación de catálogo, obtenida en esta ronda. El antes usa la versión local previa y el después la versión compilada con los datos clasificados; el cambio de contenido es intencionado.

| Vista | Antes | Después |
|---|---|---|
| Móvil 390 px | [Catálogo](evidence/before-catalog-390.png) | [Catálogo](evidence/after-catalog-390.png) |
| Escritorio 1440 px | [Catálogo](evidence/before-catalog-1440.png) | [Catálogo](evidence/after-catalog-1440.png) |

Admin: [Ejemplos móvil](evidence/after-examples-390.png), [Ejemplos escritorio](evidence/after-examples-1440.png), [formulario móvil](evidence/after-admin-new-390.png) y [Home móvil](evidence/after-admin-home-390.png). Las capturas de admin usan datos simulados. No se obtuvieron nuevos «antes» del admin ni se reutilizaron capturas históricas como si fueran de esta ronda.

## Acceso y pendientes

- La consulta de `profiles` encontró **cero cuentas con rol admin**. No se modificaron usuarios ni roles. La sesión administradora real no se probó.
- Preparados `deploy/admin.vercel.json` y [guía de despliegue](../../deploy/ADMIN.md). No se creó ni conectó un proyecto remoto. La tienda existente mantiene su configuración. Para acceso por internet faltan una cuenta administradora autorizada y aprobación explícita del despliegue.
- Admin local: http://localhost:3002. Tienda de verificación aislada: http://localhost:3003. El puerto 3001 estaba siendo reiniciado durante la ronda; se usó 3003 para no interferir.
- No se probó un celular físico, Safari móvil, lector de pantalla ni HEIC real. No se añadieron productos reales ni se validaron pagos/despachos. No se repitió Lighthouse: esta etapa no establece una mejora de rendimiento.
- Rotar la clave secreta que se compartió antes en el chat sigue pendiente. No se rotó automáticamente porque requeriría coordinar los entornos que la usan.
- RTK y Headroom no estaban disponibles; se usaron comandos directos. Caveman/Ponytail orientaron comunicación y alcance; no se atribuye ahorro de tokens medido.

[Guía de uso y reversión](GUIA.md).
