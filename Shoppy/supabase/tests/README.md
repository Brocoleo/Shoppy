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

# 3. Correr el suite (T0–T13; falla con exit != 0 ante cualquier error)
docker exec -i shopy-pg-test psql -U postgres -d shopy -v ON_ERROR_STOP=1 \
  -f - < supabase/tests/rls_tests.sql

# 4. Reglas de beta (usa los fixtures de rls_tests.sql)
docker exec -i shopy-pg-test psql -U postgres -d shopy -v ON_ERROR_STOP=1 \
  -f - < supabase/tests/beta_tests.sql

# 5. Limpiar
docker rm -f shopy-pg-test
```

## Archivos

- `setup_local.sql` — stub **solo-local** de los esquemas `auth` (`users`, `uid()`,
  `role()`) y `storage` (`buckets`, `objects` mínimos) y roles
  `anon`/`authenticated`/`service_role`. NO es migración, no se aplica en
  Supabase real.
- `rls_tests.sql` — fixtures + asserts T0–T13 (ver `docs/SECURITY.md`).
  Nota: usa `RESET ROLE` (no `RESET ALL`, que no revierte `SET ROLE`).

## Cobertura (T0–T13)

Seed íntegro · aislamiento A/B · anon no escribe catálogo · precios inmutables ·
PAID solo backend · guest con token · anti doble-venta · expiración de reserva ·
pago idempotente + transiciones · cupones · analytics · trending ·
anti auto-admin · search_path inmutable en DEFINER.
