# Tests de base de datos (Fase 2)

Validan migraciones + RLS + reglas críticas sin necesidad de proyecto Supabase remoto.

## Requisitos

- Docker en ejecución (el daemon debe estar arriba).

## Ejecución

```bash
# 1. Levantar Postgres 16 efímero
docker run -d --name shopy-pg-test \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=shopy -p 5433:5432 postgres:16

# 2. Aplicar en orden (stub auth+storage -> todas las migraciones en orden)
for f in supabase/tests/setup_local.sql supabase/migrations/*.sql; do
  docker exec -i shopy-pg-test psql -U postgres -d shopy -v ON_ERROR_STOP=1 -f - < "$f"
done

# 3. Correr el suite (T0–T16; falla con exit != 0 ante cualquier error)
docker exec -i shopy-pg-test psql -U postgres -d shopy -v ON_ERROR_STOP=1 \
  -f - < supabase/tests/rls_tests.sql

# 4. Reglas de beta (usa los fixtures de rls_tests.sql)
docker exec -i shopy-pg-test psql -U postgres -d shopy -v ON_ERROR_STOP=1 \
  -f - < supabase/tests/beta_tests.sql

# 5. Imágenes del admin y permisos del sandbox
docker exec -i shopy-pg-test psql -U postgres -d shopy -v ON_ERROR_STOP=1 \
  -f - < supabase/tests/admin_images_tests.sql
docker exec -i shopy-pg-test psql -U postgres -d shopy -v ON_ERROR_STOP=1 \
  -f - < supabase/tests/sandbox_checkout_tests.sql

# 6. Limpiar
docker rm -f shopy-pg-test
```

## Sonda contra el proyecto real

`security_probe.mjs` comprueba en la BD **remota** que un cliente no puede
auto-asignarse `admin`, que ni cliente ni admin escriben el estado de un pago y
que `mark_order_paid` no es ejecutable por ellos. Crea dos usuarios y un pedido
de prueba y **los borra al terminar** (verifica que no queda residuo).

```bash
set -a && . supabase/.env && . apps/web/.env.local && set +a
export SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" SUPABASE_ANON_KEY="$NEXT_PUBLIC_SUPABASE_ANON_KEY"
node supabase/tests/security_probe.mjs
```

## Archivos

- `setup_local.sql` — stub **solo-local** de los esquemas `auth` (`users`, `uid()`,
  `role()`), `storage` (`buckets`, `objects` mínimos), `supabase_migrations`
  (`schema_migrations`) y los roles `anon`/`authenticated`/`service_role`. NO es
  migración, no se aplica en Supabase real.
  El stub de `supabase_migrations` es **necesario**: `20261018120000` escribe en
  esa tabla y, sin ella, hacía rollback completo y el entorno local quedaba con
  un esquema distinto al remoto.
- `rls_tests.sql` — fixtures + asserts **T0–T16** (ver `docs/SECURITY.md`).
  Nota: usa `RESET ROLE` (no `RESET ALL`, que no revierte `SET ROLE`).
- `beta_tests.sql`, `admin_images_tests.sql`, `sandbox_checkout_tests.sql` — reglas
  de checkout, imágenes del admin y permisos del sandbox.
- `security_probe.mjs` — sonda funcional contra el proyecto remoto.

## Cobertura (T0–T16)

Seed íntegro · aislamiento A/B · anon no escribe catálogo · precios inmutables ·
PAID solo backend · guest con token · anti doble-venta · expiración de reserva ·
pago idempotente + transiciones · cupones · analytics · trending ·
anti auto-admin · gestión de roles por admin · `search_path` inmutable en
DEFINER · **anti escalada de privilegios (DELETE+INSERT)** · **el estado del
pago solo lo escribe el backend** · **`mark_order_paid` solo `service_role`**.
