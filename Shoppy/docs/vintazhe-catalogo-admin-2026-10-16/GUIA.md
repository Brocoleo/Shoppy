# vinta.zhe — Preparar prendas desde el admin

## Acceso

Admin local: http://localhost:3002. La tienda de verificación usa http://localhost:3003.
No hay una URL nueva de admin publicada. La preparación de hosting está en `deploy/ADMIN.md`; requiere autorización antes de publicar y una cuenta administradora. La revisión remota encontró cero perfiles con ese rol. No se crearon cuentas ni se cambiaron roles.

## Productos y ejemplos

En **Productos** se muestran las prendas comerciales y sus borradores. En **Ejemplos** se conservan las 20 prendas seed no confirmadas y los ocho demos generados; no pueden publicarse directamente desde el panel.

Pulsa **Usar como base** para empezar una prenda nueva. Solo se copian categoría y segmento. El ejemplo original permanece intacto. No se copian precios, existencias, fotos, promociones ni métricas.

1. **Datos:** completa nombre, dirección/slug único y estado real de la prenda. Guarda como borrador; el precio y stock pueden seguir en cero durante la preparación. Marca es opcional: no atribuyas una marca que no puedas comprobar.
2. **Fotos:** sube fotografías propias de esa prenda, selecciona portada y ordena la galería. Los errores se muestran por archivo; usa el reintento para los pendientes. La portada debe mostrar la prenda completa. Señala las fotos de defectos como detalles.
3. **Revisión:** comprueba categoría, talla, color, estado, precio positivo, stock y portada. Solo entonces se habilita publicación. Publicar hace visible la prenda en el catálogo; **esta entrega no certifica pagos ni checkout y no habilita ventas operativas**.

Formatos de entrada: JPEG, PNG, WebP y AVIF compatibles con el navegador; HEIC no se convierte de forma garantizada. Si el teléfono lo rechaza, exporta a JPEG. El archivo de entrada tiene límite de 30 MB y se optimiza antes de subir; el resultado debe respetar el límite de 5 MB del almacenamiento. No se probó un dispositivo físico en esta entrega.

## Archivo y portada

En **Home** se gestionan titular, acción, fotografía y encuadre. Mostrar una entrada del archivo no la convierte en producto comercial. El archivo de Instagram sigue sin precio y sin carrito.

## Clasificación reversible

Los cambios remotos de esta ronda están en el respaldo local ignorado `supabase/seed/vinta-archive/examples.local.json`. Guárdalo: contiene los snapshots completos previos y los resultados de la escritura. No incluye claves.

Simular desde la carpeta `Shoppy`:

```sh
node --env-file=supabase/.env --env-file=apps/web/.env.local supabase/seed/vinta-archive/classify-examples.mjs
```

La herramienta acepta `--apply` o `--restore` cuando se ejecuta directamente con `SUPABASE_URL` (o `NEXT_PUBLIC_SUPABASE_URL`) y `SUPABASE_SECRET_KEY` disponibles. No vuelvas a aplicar ni a restaurar como parte del uso diario del admin. Una restauración repone metadata y publicación originales solo cuando el registro sigue idéntico al resultado propio; informa y conserva ediciones posteriores o resultados inciertos. La reversión remota no se ejecutó en esta entrega.

La comparación del seed valida los datos comerciales, tags, destacado y disponibilidad. Los contadores de visitas y favoritos pueden cambiar al navegar; se conservan y no determinan si una prenda es real. Los cambios concurrentes después del snapshot impiden la actualización automática.

El uploader de placeholders es simulación por defecto. `--apply` usa creación exclusiva y nunca reemplaza archivos existentes. No lo uses para cargar fotos reales: usa el gestor del admin.
