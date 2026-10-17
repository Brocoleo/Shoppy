# Archivo de vinta.zhe

Lote `vinta-archive-2026-10-16`, proyecto `evzlqwiipdjgtrqjlwba`.

Se recuperaron 12 publicaciones públicas y sus 40 fotografías, incluidos carruseles. El perfil no mostró nuevas publicaciones después de tres intentos de desplazamiento. Esta cobertura no representa una exportación completa de la cuenta: el historial privado o bloqueado no se obtuvo. Cada publicación conserva su URL original, fecha disponible, fotografías, dimensiones y SHA-256 en `manifest.json`.

Las copias WebP conservan la proporción; no se recrearon prendas, modelos ni marcas. Los títulos describen lo visible, sin asignar precio, talla, condición o stock. El archivo se guarda en `home_sections`, clave `vinta-archive`; nunca se inserta como producto vendible.

## Operación segura

Usa Node 24 y los archivos de entorno locales ignorados por Git. Ninguna clave debe incluirse en el manifiesto, informes o navegador.

```sh
node --env-file=apps/web/.env.local --env-file=supabase/.env supabase/seed/vinta-archive/import.mjs
node --env-file=apps/web/.env.local --env-file=supabase/.env supabase/seed/vinta-archive/import.mjs --apply
```

Sin opción, solo comprueba proyecto, archivos, hashes y colisiones. `--apply` utiliza rutas inmutables, guarda un respaldo antes de escribir y registra cada carga en `last-run.local.json`. Repetirlo conserva los títulos, la visibilidad y la portada modificados posteriormente desde admin. Guarda una copia segura de ese registro si mueves el proyecto; permite retirar exactamente la carga.

Retirada explícita del lote:

```sh
node --env-file=apps/web/.env.local --env-file=supabase/.env supabase/seed/vinta-archive/import.mjs --remove
```

No se ha ejecutado la retirada remota como prueba. Se ha verificado mediante transporte simulado. Omite secciones modificadas posteriormente, objetos compartidos, alterados o de procedencia incierta. No borra archivos ajenos ni restablece otros datos de la tienda.

## Productos ficticios anteriores

`retire-demos.mjs` identifica los 20 registros históricos por ID, slug y nombre, y los ocho demos editoriales por manifiesto y metadatos. Solo cambia `published_at` a null; conserva productos, precios, imágenes y demás atributos.

```sh
node --env-file=apps/web/.env.local --env-file=supabase/.env supabase/seed/vinta-archive/retire-demos.mjs
node --env-file=apps/web/.env.local --env-file=supabase/.env supabase/seed/vinta-archive/retire-demos.mjs --apply
```

El respaldo se guarda en `retired-demos.local.json`. La opción `--restore` restaura únicamente publicaciones cuyo estado todavía coincide con la retirada registrada; volvería a hacer públicos esos datos ficticios. No forma parte de la operación normal.

## Dependencias del admin

La migración de imágenes aplicada es `20261016161216_admin_images_vinta_20261016.sql`, con esa misma versión en el historial remoto. Incluye funciones de portada/orden y cola de limpieza protegidas por rol administrador y RLS. No incluye cambios de carrito ni checkout.

El archivo beta pendiente `20261010000001_beta_cart_images.sql` del árbol de trabajo no se aplicó ni se modificó. Contiene sentencias CREATE para objetos de imágenes ahora existentes: debe separarse/reconciliarse antes de intentar aplicarlo. No ejecutar un push global de migraciones pendientes sin esa revisión.

## Pruebas

```sh
node supabase/seed/vinta-archive/import.test.mjs
node supabase/seed/vinta-archive/retire-demos.test.mjs
node scripts/editorial.test.mjs
```

El importador y el retiro tienen 13 casos simulados cada uno. No necesitan conexión remota para probarse.
