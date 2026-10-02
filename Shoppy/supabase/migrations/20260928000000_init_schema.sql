-- ============================================================================
-- SHOPY · 20260928000000_init_schema
-- Schema inicial: catálogo, carrito, pedidos, pagos, envíos, analytics.
--
-- Convenciones:
--   · PKs UUID (gen_random_uuid, core desde PG13).
--   · Precios CLP como integer (sin decimales).
--   · created_at/updated_at en entidades mutables; created_at solo en logs.
--   · order_items guarda snapshot (nombre/marca/talla/precio) para historial.
--   · La fuente de verdad de disponibilidad/precio/stock es la DB, nunca el cliente.
-- ============================================================================

create extension if not exists "pg_trgm";

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
do $$ begin
  create type product_condition as enum ('como_nuevo', 'excelente', 'bueno', 'con_detalles');
exception when duplicate_object then null; end $$;

do $$ begin
  create type product_availability as enum ('AVAILABLE', 'RESERVED', 'SOLD', 'ARCHIVED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type order_status as enum (
    'PENDING_PAYMENT', 'PAID', 'PREPARING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type discount_kind as enum ('percent', 'fixed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_status as enum ('pending', 'approved', 'rejected', 'refunded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type reservation_status as enum ('active', 'consumed', 'expired', 'released');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- Helpers genéricos
-- ----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Número de pedido legible y único (ej: SHO-4F8K2QXA).
create or replace function public.generate_order_number()
returns trigger language plpgsql as $$
declare candidate text;
begin
  if new.order_number is not null then return new; end if;
  loop
    candidate := 'SHO-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    exit when not exists (select 1 from public.orders where order_number = candidate);
  end loop;
  new.order_number := candidate;
  return new;
end $$;

-- ============================================================================
-- IDENTIDAD Y DIRECCIONES
-- ============================================================================
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  phone text,
  role text not null default 'customer' check (role in ('customer', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text not null,
  street text not null,
  comuna text not null,
  region text not null,
  zip_code text,
  notes text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index addresses_user_id_idx on public.addresses (user_id);

-- Perfil automático al registrarse (requiere auth.users, existe en Supabase).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', null))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- CATÁLOGO
-- ============================================================================
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  parent_id uuid references public.categories (id) on delete set null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_id is null or parent_id <> id)
);
create index categories_parent_id_idx on public.categories (parent_id);

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  image_url text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  brand_id uuid references public.brands (id) on delete set null,
  category_id uuid references public.categories (id) on delete set null,
  subcategory_id uuid references public.categories (id) on delete set null,
  segment text,
  price_clp integer not null check (price_clp >= 0),
  compare_at_price_clp integer check (compare_at_price_clp is null or compare_at_price_clp >= 0),
  condition product_condition not null default 'bueno',
  size text,
  color text,
  sku text unique,
  stock integer not null default 1 check (stock >= 0),
  availability product_availability not null default 'AVAILABLE',
  published_at timestamptz,
  tags text[] not null default '{}',
  view_count integer not null default 0 check (view_count >= 0),
  favorite_count integer not null default 0 check (favorite_count >= 0),
  trending_score double precision not null default 0,
  is_featured boolean not null default false,
  metadata jsonb not null default '{}',
  -- Se mantiene vía trigger (to_tsvector no es IMMUTABLE y no admite GENERATED).
  search_vector tsvector not null default ''::tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_availability_published_idx
  on public.products (availability, published_at desc) where published_at is not null;
create index products_category_idx on public.products (category_id);
create index products_brand_idx on public.products (brand_id);
create index products_trending_idx on public.products (trending_score desc);
create index products_featured_idx on public.products (is_featured, published_at desc)
  where is_featured and published_at is not null;
create index products_search_gin on public.products using gin (search_vector);
create index products_tags_gin on public.products using gin (tags);
create index products_name_trgm on public.products using gin (name gin_trgm_ops);

create or replace function public.products_refresh_search_vector()
returns trigger language plpgsql as $$
begin
  new.search_vector := to_tsvector('spanish',
    coalesce(new.name, '') || ' ' ||
    coalesce(new.description, '') || ' ' ||
    coalesce(new.color, '') || ' ' ||
    coalesce(new.size, '') || ' ' ||
    array_to_string(coalesce(new.tags, '{}'), ' '));
  return new;
end $$;

create trigger products_set_search_vector
  before insert or update of name, description, color, size, tags on public.products
  for each row execute function public.products_refresh_search_vector();

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  storage_path text not null,
  sort_order integer not null default 0,
  is_cover boolean not null default false,
  is_defect_detail boolean not null default false,
  alt_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index product_images_product_idx on public.product_images (product_id, sort_order);
create unique index product_images_single_cover_uidx
  on public.product_images (product_id) where is_cover;

create table public.collection_products (
  collection_id uuid not null references public.collections (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  sort_order integer not null default 0,
  primary key (collection_id, product_id)
);

create table public.favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
create index favorites_product_idx on public.favorites (product_id);

-- ============================================================================
-- CARRITO
-- ============================================================================
create table public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.profiles (id) on delete cascade,
  session_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (user_id is not null or session_id is not null)
);

create table public.cart_items (
  cart_id uuid not null references public.carts (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  qty integer not null check (qty >= 1 and qty <= 99),
  -- Snapshot informativo; el precio real se revalida en backend al pagar.
  unit_price_clp integer not null check (unit_price_clp >= 0),
  added_at timestamptz not null default now(),
  primary key (cart_id, product_id)
);

-- ============================================================================
-- RESERVAS TEMPORALES (checkout)
-- Tabla product_reservations se crea tras orders (FK) — ver sección PEDIDOS.
-- ============================================================================

-- Reserva atómica: bloquea filas en orden determinista (evita deadlocks),
-- descuenta stock y marca RESERVED cuando llega a 0. Falla si no hay stock.
create or replace function public.reserve_products(p_order_id uuid, p_items jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  item record;
  prod public.products%rowtype;
begin
  for item in
    select (e.value ->> 'product_id')::uuid as product_id,
           coalesce((e.value ->> 'qty')::int, 1) as qty
    from jsonb_array_elements(p_items) as e
    order by 1
  loop
    if item.qty < 1 then
      raise exception 'INVALID_QTY: %', item.product_id;
    end if;

    select * into prod from public.products where id = item.product_id for update;

    if not found then
      raise exception 'PRODUCT_NOT_FOUND: %', item.product_id;
    end if;
    if prod.published_at is null or prod.availability = 'ARCHIVED' or prod.availability = 'SOLD' then
      raise exception 'PRODUCT_UNAVAILABLE: %', prod.slug;
    end if;
    if prod.stock < item.qty then
      raise exception 'INSUFFICIENT_STOCK: %', prod.slug;
    end if;

    update public.products
    set stock = stock - item.qty,
        availability = case when stock - item.qty = 0 then 'RESERVED'::product_availability
                            else availability end,
        updated_at = now()
    where id = item.product_id;

    insert into public.product_reservations (product_id, order_id, qty, expires_at)
    values (item.product_id, p_order_id, item.qty, now() + interval '15 minutes');
  end loop;
end $$;

-- Libera reservas vencidas: devuelve stock y revierte RESERVED -> AVAILABLE.
-- La llama un cron / Edge Function cada minuto. Retorna nº liberadas.
create or replace function public.release_expired_reservations()
returns integer language plpgsql security definer set search_path = public as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select id, product_id, qty from public.product_reservations
    where status = 'active' and expires_at < now()
    order by expires_at
    for update skip locked
  loop
    update public.products
    set stock = stock + r.qty,
        availability = case when availability = 'RESERVED' then 'AVAILABLE'::product_availability
                            else availability end,
        updated_at = now()
    where id = r.product_id;

    update public.product_reservations
    set status = 'expired' where id = r.id;

    n := n + 1;
  end loop;
  return n;
end $$;

-- ============================================================================
-- PEDIDOS
-- ============================================================================
create table public.shipping_rates (
  id uuid primary key default gen_random_uuid(),
  region text not null,
  comuna text,
  carrier text not null,
  price_clp integer not null check (price_clp >= 0),
  eta_days_min integer check (eta_days_min is null or eta_days_min >= 0),
  eta_days_max integer check (eta_days_max is null or eta_days_min is null or eta_days_max >= eta_days_min),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index shipping_rates_region_carrier_uidx
  on public.shipping_rates (region, carrier) where comuna is null;
create unique index shipping_rates_comuna_carrier_uidx
  on public.shipping_rates (region, comuna, carrier) where comuna is not null;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique,
  user_id uuid references public.profiles (id) on delete set null,
  -- Token seguro para que invitados rastreen su pedido sin cuenta.
  guest_token text unique,
  status order_status not null default 'PENDING_PAYMENT',
  subtotal_clp integer not null check (subtotal_clp >= 0),
  discount_clp integer not null default 0 check (discount_clp >= 0),
  shipping_clp integer not null default 0 check (shipping_clp >= 0),
  total_clp integer not null check (total_clp >= 0),
  currency text not null default 'CLP' check (currency = 'CLP'),
  shipping_address jsonb not null,
  discount_code text,
  shipping_rate_id uuid references public.shipping_rates (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (user_id is not null or guest_token is not null)
);
create index orders_user_created_idx on public.orders (user_id, created_at desc);
create index orders_status_idx on public.orders (status);
create trigger orders_set_number before insert on public.orders
  for each row execute function public.generate_order_number();

create table public.product_reservations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  order_id uuid references public.orders (id) on delete set null,
  user_id uuid references public.profiles (id) on delete set null,
  session_id text,
  qty integer not null default 1 check (qty >= 1),
  status reservation_status not null default 'active',
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index reservations_active_expiry_idx
  on public.product_reservations (expires_at) where status = 'active';
create index reservations_order_idx on public.product_reservations (order_id);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  -- Snapshot inmutable del producto al momento de la compra.
  product_slug text not null,
  product_name text not null,
  brand_name text,
  size text,
  color text,
  condition product_condition not null,
  image_url text,
  unit_price_clp integer not null check (unit_price_clp >= 0),
  qty integer not null check (qty >= 1)
);
create index order_items_order_idx on public.order_items (order_id);

create table public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  from_status order_status,
  to_status order_status not null,
  changed_by uuid references public.profiles (id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index order_history_order_idx on public.order_status_history (order_id, created_at);

-- Transiciones permitidas. Cualquier otra -> excepción (ni siquiera admin).
create or replace function public.check_order_transition()
returns trigger language plpgsql as $$
begin
  if old.status = new.status then return new; end if;
  if (old.status, new.status) not in (
    ('PENDING_PAYMENT', 'PAID'), ('PENDING_PAYMENT', 'CANCELLED'),
    ('PAID', 'PREPARING'), ('PAID', 'CANCELLED'), ('PAID', 'REFUNDED'),
    ('PREPARING', 'SHIPPED'), ('PREPARING', 'CANCELLED'),
    ('SHIPPED', 'DELIVERED'),
    ('DELIVERED', 'REFUNDED')
  ) then
    raise exception 'INVALID_ORDER_TRANSITION: % -> %', old.status, new.status;
  end if;
  return new;
end $$;

create trigger orders_guard_transition before update of status on public.orders
  for each row execute function public.check_order_transition();

-- Historial automático (security definer para escribir aunque RLS bloquee al cliente).
create or replace function public.record_order_history()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status is distinct from new.status then
    insert into public.order_status_history (order_id, from_status, to_status)
    values (new.id, old.status, new.status);
  end if;
  return new;
end $$;

create trigger orders_record_history after update of status on public.orders
  for each row execute function public.record_order_history();

-- Confirmación de pago (la llama SOLO backend: service_role o admin).
-- Idempotente: si ya está PAID, no hace nada.
create or replace function public.mark_order_paid(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders%rowtype;
begin
  if not (auth.role() = 'service_role' or public.is_admin()) then
    raise exception 'FORBIDDEN: only backend can mark orders as paid';
  end if;

  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND: %', p_order_id; end if;
  if o.status = 'PAID' then return; end if;
  if o.status <> 'PENDING_PAYMENT' then
    raise exception 'INVALID_ORDER_TRANSITION: % -> PAID', o.status;
  end if;
  if not exists (
    select 1 from public.product_reservations
    where order_id = p_order_id and status = 'active' and expires_at >= now()
  ) then
    raise exception 'RESERVATION_EXPIRED: %', p_order_id;
  end if;

  update public.product_reservations
  set status = 'consumed' where order_id = p_order_id and status = 'active';

  update public.products p
  set availability = 'SOLD', updated_at = now()
  from public.order_items i
  where i.order_id = p_order_id and i.product_id = p.id and p.stock = 0;

  update public.orders set status = 'PAID', updated_at = now() where id = p_order_id;
end $$;

-- Pedido de invitado por token (sin exponer tabla a anon).
create or replace function public.get_guest_order(p_order_id uuid, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  select to_jsonb(o) || jsonb_build_object('items', coalesce((
    select jsonb_agg(to_jsonb(i) order by i.product_name)
    from public.order_items i where i.order_id = o.id
  ), '[]'::jsonb))
  into result
  from public.orders o
  where o.id = p_order_id and o.user_id is null and o.guest_token = p_token;

  if result is null then raise exception 'ORDER_NOT_FOUND'; end if;
  return result;
end $$;

-- Helper para policies: ¿puede la sesión actual agregar ítems a este pedido?
-- SECURITY DEFINER porque el chequeo debe ver orders aunque RLS lo oculte
-- (ej: invitado con token válido vía anon, sin SELECT directo en orders).
create or replace function public.can_write_order_items(p_order_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order_id
      and (o.user_id = auth.uid() or (o.user_id is null and o.guest_token is not null))
  );
$$;

-- ============================================================================
-- PAGOS Y DESPACHO
-- ============================================================================
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  provider text not null default 'mock' check (provider in ('mock', 'mercadopago', 'transbank')),
  provider_payment_id text unique,
  amount_clp integer not null check (amount_clp >= 0),
  status payment_status not null default 'pending',
  idempotency_key text unique,
  raw_payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_order_idx on public.payments (order_id);

create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id) on delete cascade,
  carrier text not null,
  tracking_number text,
  tracking_url text,
  shipped_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- DESCUENTOS
-- ============================================================================
create table public.discounts (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  kind discount_kind not null,
  -- percent: 1-100 · fixed: monto CLP
  value integer not null check (value > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  min_subtotal_clp integer not null default 0 check (min_subtotal_clp >= 0),
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  usage_count integer not null default 0 check (usage_count >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'percent' or value <= 100),
  check (ends_at is null or starts_at is null or ends_at >= starts_at)
);
create unique index discounts_code_uidx on public.discounts (upper(code));

create table public.discount_usages (
  id uuid primary key default gen_random_uuid(),
  discount_id uuid not null references public.discounts (id) on delete cascade,
  order_id uuid not null unique references public.orders (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Validación de cupón (la usa el backend; nunca confiar en el cliente).
create or replace function public.validate_discount_code(p_code text, p_subtotal integer)
returns table (discount_id uuid, kind discount_kind, value integer, amount_clp integer)
language plpgsql security definer set search_path = public as $$
declare d public.discounts%rowtype;
declare amount integer;
begin
  select * into d from public.discounts where upper(code) = upper(p_code) for update;
  if not found then raise exception 'DISCOUNT_NOT_FOUND'; end if;
  if not d.is_active then raise exception 'DISCOUNT_INACTIVE'; end if;
  if d.starts_at is not null and now() < d.starts_at then raise exception 'DISCOUNT_NOT_STARTED'; end if;
  if d.ends_at is not null and now() > d.ends_at then raise exception 'DISCOUNT_EXPIRED'; end if;
  if p_subtotal < d.min_subtotal_clp then raise exception 'DISCOUNT_MIN_SUBTOTAL'; end if;
  if d.usage_limit is not null and d.usage_count >= d.usage_limit then
    raise exception 'DISCOUNT_USAGE_LIMIT';
  end if;

  amount := case when d.kind = 'percent'
    then (p_subtotal * d.value) / 100
    else d.value end;
  amount := least(amount, p_subtotal);

  return query select d.id, d.kind, d.value, amount;
end $$;

-- ============================================================================
-- ANALYTICS Y HOME
-- ============================================================================
create table public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in (
    'product_view', 'search', 'favorite', 'add_to_cart',
    'remove_from_cart', 'checkout_started', 'purchase'
  )),
  user_id uuid references public.profiles (id) on delete set null,
  session_id text,
  product_id uuid references public.products (id) on delete set null,
  order_id uuid references public.orders (id) on delete set null,
  search_query text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index analytics_type_created_idx on public.analytics_events (event_type, created_at desc);
create index analytics_product_created_idx
  on public.analytics_events (product_id, created_at desc) where product_id is not null;

-- Trending interno (sin IA): pesos × decaimiento exponencial semanal + base.
-- Pesos: compra 10 · add_to_cart 3 · favorito 2 · vista 1 · checkout 4 · search 0.5
create or replace function public.refresh_trending_scores()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.products p
  set trending_score = coalesce((
      select sum(
        case e.event_type
          when 'purchase' then 10.0
          when 'checkout_started' then 4.0
          when 'add_to_cart' then 3.0
          when 'favorite' then 2.0
          when 'product_view' then 1.0
          when 'search' then 0.5
          else 0.2 end
        * exp(-extract(epoch from (now() - e.created_at)) / (7 * 86400.0)))
      from public.analytics_events e
      where e.product_id = p.id
        and e.created_at >= now() - interval '30 days'
    ), 0)
    + 0.5 * ln(1 + p.favorite_count)
    + 0.3 * ln(1 + p.view_count),
    updated_at = now();
end $$;

create table public.home_sections (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  title text not null,
  config jsonb not null default '{}',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- updated_at automático
-- ----------------------------------------------------------------------------
do $$ declare t text; begin
  foreach t in array array[
    'profiles', 'addresses', 'categories', 'brands', 'collections', 'products',
    'product_images', 'carts', 'orders', 'payments', 'shipping_rates',
    'shipments', 'discounts', 'home_sections'
  ] loop
    execute format(
      'drop trigger if exists set_updated_at on public.%I; '
      'create trigger set_updated_at before update on public.%I '
      'for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;
