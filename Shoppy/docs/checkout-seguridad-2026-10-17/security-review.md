# Revisión de seguridad — 17 de octubre de 2026

## Alcance y método

Inspección de código, patrones de secretos en archivos versionados, auditoría npm y consultas de catálogo PostgreSQL mediante la API de administración de Supabase con `read_only: true`. No se ejecutaron RPC de negocio ni se consultaron filas de clientes, pedidos o pagos. No hubo escrituras remotas, migraciones aplicadas ni intentos de explotación. Los resultados de permisos demuestran configuración; no sustituyen una prueba de acceso con sesiones reales.

La URL pública local de web y admin apunta al mismo proyecto auditado: `evzlqwiipdjgtrqjlwba`. Los valores de claves no se incluyen aquí.

## Hallazgos remotos confirmados

### Alto: inserción directa de líneas en pedidos propios pendientes

`authenticated` tiene privilegio INSERT sobre `public.order_items`. La política `order_items_owner_insert` es INSERT para `authenticated`, con:

```sql
WITH CHECK (can_write_order_items(order_id))
```

La función SECURITY DEFINER `public.can_write_order_items(p_order_id uuid)` devuelve la existencia de un pedido con:

```sql
o.id = p_order_id
AND o.status = 'PENDING_PAYMENT'
AND o.user_id IS NOT NULL
AND o.user_id = auth.uid()
```

Ese control comprueba propiedad y estado, pero no precio, cantidad, reservas ni correspondencia con el total calculado. Permite anexar snapshots de líneas arbitrarios al pedido propio pendiente. No se insertaron líneas para demostrarlo, porque la entrega prohíbe escrituras remotas.

Propuesta pendiente: migración específica que retire la política de inserción de cliente y revoque INSERT a `authenticated`; conservar creación de líneas mediante el backend. Debe probarse en PostgreSQL aislado antes de aplicarla. La migración no se aplicó durante esta revisión y sigue siendo un bloqueo para publicar.

### Bloqueo de compatibilidad del checkout

Consulta de todos los esquemas por nombre y firma devolvió únicamente:

```text
public.mark_order_paid(p_order_id uuid)
```

No existen remotamente las firmas requeridas por el código local:

```text
public.create_checkout_order(uuid, uuid, text, jsonb, jsonb)
public.settle_checkout_payment(uuid)
```

El historial remoto no contiene `20261010000000` (`20261010000000_beta_checkout.sql`) ni `20261010000001` (`20261010000001_beta_cart_images.sql`). El historial observado fue:

```text
20260928000000, 20260928000001, 20260928000002,
20260929000000, 20260929000001, 20260929000002,
20260929000003, 20260929000004, 20260929000005,
20261009190101, 20261016161216
```

No certificar el checkout sandbox remoto hasta reconciliar las dependencias de esquema con una migración revisada y autorizada. No aplicar automáticamente toda la migración beta.

### Controles observados

RLS está habilitado en `addresses`, `orders`, `order_items`, `payments` y `profiles`.

- Direcciones: política de propietario `user_id = auth.uid()` tanto en USING como en WITH CHECK; lectura administrativa separada.
- Pedidos: lectura por propietario y política administrativa; actualización de propietario restringida a transición de pendiente a cancelado por las expresiones de fila existentes.
- Pagos y líneas: lectura mediante pertenencia del pedido; políticas administrativas separadas.
- `mark_order_paid` es SECURITY DEFINER y tiene EXECUTE para `anon` y `authenticated`, pero su cuerpo exige `auth.role() = 'service_role' OR public.is_admin()`. El privilegio amplio por sí solo no demuestra un bypass de pago; no se ejecutó la función.

Privilegios de tabla observados:

| Rol | Tabla | INSERT | UPDATE |
| --- | --- | --- | --- |
| anon | orders | no | sí |
| anon | order_items | no | sí |
| anon | payments | sí | sí |
| authenticated | orders | no | sí |
| authenticated | order_items | sí | sí |
| authenticated | payments | sí | sí |

Los privilegios no equivalen a autorización efectiva: RLS sigue aplicándose a estos roles.

## Consultas reproducibles de solo lectura

Ejecutarlas únicamente mediante una conexión autorizada de auditoría; nunca incluir credenciales en el informe o en argumentos visibles.

```sql
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('orders', 'order_items', 'addresses', 'payments', 'profiles');

SELECT n.nspname, c.relname, c.relrowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('orders', 'order_items', 'addresses', 'payments', 'profiles');

SELECT r AS role, t AS relation,
       has_table_privilege(r, 'public.' || t, 'INSERT') AS can_insert,
       has_table_privilege(r, 'public.' || t, 'UPDATE') AS can_update
FROM unnest(ARRAY['anon', 'authenticated']) r
CROSS JOIN unnest(ARRAY['orders', 'order_items', 'payments']) t;

SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid),
       p.prosecdef,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN ('settle_checkout_payment', 'create_checkout_order',
                   'mark_order_paid', 'can_write_order_items', 'reserve_products');

SELECT pg_get_functiondef(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('mark_order_paid', 'can_write_order_items');

SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;
```

## Dependencias: línea base y actualización local

Línea base de `npm audit --json`: **31 paquetes afectados: 1 crítico, 19 altos y 11 moderados**. No interpretar el total como número de vulnerabilidades explotables independientes: incluye propagación transitiva.

- Next 16.3.6 en web y admin: avisos `GHSA-3w37-wq28-93x7`, `GHSA-4jqv-mc3x-m676`, `GHSA-39w2-rjm5-chcv`, `GHSA-f87g-xv8r-7p7x`, `GHSA-mcj8-r9mp-w47p` y `GHSA-cjq9-62q9-8jv4`. Todos los rangos directos reportados terminaban antes de 16.3.8. La configuración web permite al optimizador imágenes HTTPS de `*.supabase.co/storage/v1/object/public/product-images/**`; no se intentó explotar SSRF. La aplicabilidad exacta de los demás avisos depende de las rutas y modalidades de ejecución.
- `shell-quote` 1.10.0: crítico `GHSA-pqg4-j6r4-53mv`, por React Native → react-devtools-core. No se demostró exposición desde checkout web.
- `source-map-js` 1.2.1: alto `GHSA-68fv-2mgg-jv7q`.

La implementación principal actualizó localmente Next a **16.4.2**, `shell-quote` a **1.12.0** y `source-map-js` a **1.2.2**. Su auditoría final reportó **28 paquetes afectados: 17 altos, 11 moderados y ninguno crítico**. Esta última medición procede de la verificación de la implementación principal, no de una segunda auditoría remota de este revisor.

Los avisos restantes se concentran en dependencias transitivas de Expo/React Native y herramientas. No se ha demostrado una ruta explotable desde el checkout web; tampoco se consideran resueltos. Evitar `npm audit fix --force`: las propuestas automáticas incluían cambios mayores y retrocesos de Expo. Revisar esas actualizaciones en una tarea separada con pruebas móviles.

## Secretos y límites de evidencia

El escaneo de patrones sobre archivos versionados actuales no detectó literales de claves privadas, claves secretas de Supabase ni tokens de proveedor/Vercel en los patrones revisados. No es un análisis completo de historial Git ni garantiza ausencia de secretos de otros formatos. Los archivos locales de entorno de Supabase, web y admin están ignorados por Git.

En la conversación histórica se expuso una clave secreta de Supabase. Su **rotación sigue pendiente**; no se reproduce el valor y no se rotó ninguna credencial durante esta entrega. Evitar publicar o reactivar servicios hasta revisar y resolver ese pendiente con autorización.

No se leyó el archivo temporal de credenciales del comprador sandbox. No se verificó autenticación real de usuarios, no hubo pagos ni pedidos, y ninguna conclusión de autorización se basa en botones ocultos del navegador.
