-- ============================================================================
-- SHOPY · tests locales (SOLO desarrollo, NO es migración).
-- Stub mínimo del esquema `auth` de Supabase para validar RLS sin proyecto real.
-- Orden de aplicación en el contenedor de prueba:
--   1. setup_local.sql
--   2. 20260928000000_init_schema.sql
--   3. 20260928000001_rls_policies.sql
--   4. 20260928000002_seed.sql
--   5. rls_tests.sql
-- ============================================================================

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'
);

-- auth.uid() / auth.role() leen GUCs de sesión (equivalente local al JWT).
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('app.uid', true), '')::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(nullif(current_setting('app.role', true), ''), 'anon')
$$;

-- Roles estilo Supabase (sin login: solo para SET ROLE en tests).
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end $$;

-- Como en Supabase real: el Data API debe resolver auth.uid()/auth.role().
grant usage on schema auth to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Stub mínimo del esquema `storage` (SOLO tests locales): buckets + objects
-- con las columnas que tocan las migraciones 20260929* (insert bucket,
-- policies por bucket_id, límites de tamaño/MIME). Sin RLS no se puede
-- crear policy, por eso se habilita aquí.
-- ----------------------------------------------------------------------------
create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id text primary key default md5(random()::text || clock_timestamp()::text),
  bucket_id text,
  name text,
  owner uuid,
  metadata jsonb
);

alter table storage.objects enable row level security;
