# Catálogo demo editorial A

Ocho prendas ficticias con imágenes generadas, identificadas como demo y no comprables (`stock=0`, `availability=SOLD`). No reemplazan productos anteriores ni utilizan marcas comerciales.

Desde la raíz del repositorio, usando archivos locales ignorados por Git:

```sh
# Prevalidación: solo lectura.
node --env-file=apps/web/.env.local --env-file=supabase/.env supabase/seed/editorial-demo/import.mjs

# Importar o repetir sin duplicados.
node --env-file=apps/web/.env.local --env-file=supabase/.env supabase/seed/editorial-demo/import.mjs --apply

# Retirar únicamente este lote y sus archivos, cuando se solicite.
node --env-file=apps/web/.env.local --env-file=supabase/.env supabase/seed/editorial-demo/import.mjs --remove
```

El importador exige el proyecto `evzlqwiipdjgtrqjlwba`, URL y clave de escritura. Comprueba colisiones de identificadores y slugs y pertenencia de las imágenes. Utiliza las tablas y bucket existentes; no modifica esquema ni RLS.

`manifest.json` conserva los identificadores, rutas y datos ilustrativos. El registro `last-run.local.json` queda ignorado por Git; puede cambiarse con `SHOPY_IMPORT_LOG`. Nunca incluir credenciales en el manifiesto o en documentación.

No es una transacción entre Storage y Postgres. Si una escritura falla, puede quedar una carga parcial de este lote; el registro local permite inspeccionarla y se puede repetir la importación de forma idempotente. La retirada solo afecta a las rutas e identificadores enumerados y reconoce sus tareas de limpieza después de borrar los objetos.

Las imágenes editoriales de modelos se encuentran en `apps/web/public/images/editorial/`. Prompts y pruebas de esta intervención: `docs/auditoria-web-2026-10-15/evidence/ronda4/`.

La retirada admite el esquema base sin tabla `image_cleanup`. La prueba `node supabase/seed/editorial-demo/import.test.mjs` verifica esa ruta con peticiones simuladas; no borra datos remotos.
