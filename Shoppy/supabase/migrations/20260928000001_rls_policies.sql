-- ============================================================================
-- SHOPY · 20260928000001_rls_policies
-- Row Level Security: políticas reales por tabla. Nunca desactivar RLS.
--
-- Roles:
--   · anon          → catálogo público, checkout invitado, ingesta analytics.
--   · authenticated → sus propios datos (perfil, direcciones, favoritos,
--                      carrito, pedidos). Invitado rastrea vía RPC con token.
--   · service_role  → bypass total (SOLO backend: pagos, webhooks, reservas).
--   · admin         → profiles.role = 'admin', vía public.is_admin().
-- ============================================================================

-- Admin check centralizado (security definer: lee profiles aunque RLS bloquee).
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Habilitar RLS en todas las tablas de app.
do $$ declare t text; begin
  foreach t in array array[
    'profiles', 'addresses', 'categories', 'brands', 'collections', 'products',
    'product_images', 'collection_products', 'favorites', 'carts', 'cart_items',
    'product_reservations', 'orders', 'order_items', 'order_status_history',
    'payments', 'shipping_rates', 'shipments', 'discounts', 'discount_usages',
    'analytics_events', 'home_sections'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Grants base estilo Supabase (en Supabase ya existen; necesarios en local).
-- ----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert on all tables in schema public to anon;
grant usage, select on all sequences in schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;

-- ============================================================================
-- CATÁLOGO PÚBLICO (lectura abierta, escritura solo admin)
-- ============================================================================
-- products: público solo lo publicado y no archivado.
create policy products_public_read on public.products for select
  using (published_at is not null and availability <> 'ARCHIVED');
create policy products_admin_write on public.products for all
  using (public.is_admin()) with check (public.is_admin());

create policy product_images_public_read on public.product_images for select using (true);
create policy product_images_admin_write on public.product_images for all
  using (public.is_admin()) with check (public.is_admin());

create policy categories_public_read on public.categories for select
  using (is_active);
create policy categories_admin_write on public.categories for all
  using (public.is_admin()) with check (public.is_admin());

create policy brands_public_read on public.brands for select using (true);
create policy brands_admin_write on public.brands for all
  using (public.is_admin()) with check (public.is_admin());

create policy collections_public_read on public.collections for select
  using (is_active);
create policy collections_admin_write on public.collections for all
  using (public.is_admin()) with check (public.is_admin());

create policy collection_products_public_read on public.collection_products for select using (true);
create policy collection_products_admin_write on public.collection_products for all
  using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- DATOS PROPIOS (dueño o admin)
-- ============================================================================
create policy profiles_owner_rw on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin_read on public.profiles
  for select using (public.is_admin());

create policy addresses_owner_rw on public.addresses
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy addresses_admin_read on public.addresses
  for select using (public.is_admin());

create policy favorites_owner_rw on public.favorites
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy favorites_admin_read on public.favorites
  for select using (public.is_admin());

-- Carrito propio (usuario) o de sesión (invitado con session_id).
-- Nota: invitados operan su carrito vía backend/service_role en producción;
-- estas políticas cubren app autenticada y migración de carrito al login.
create policy carts_owner_rw on public.carts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy carts_admin_read on public.carts
  for select using (public.is_admin());

create policy cart_items_owner_rw on public.cart_items for all
  using (exists (select 1 from public.carts c
                 where c.id = cart_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.carts c
                      where c.id = cart_id and c.user_id = auth.uid()));
create policy cart_items_admin_read on public.cart_items
  for select using (public.is_admin());

-- ============================================================================
-- PEDIDOS (dueño o admin; invitado SOLO vía get_guest_order con token)
-- ============================================================================
create policy orders_owner_select on public.orders
  for select using (user_id = auth.uid());
create policy orders_owner_insert on public.orders
  for insert with check (
    status = 'PENDING_PAYMENT' and (
      user_id = auth.uid()
      or (user_id is null and guest_token is not null)
    )
  );
-- El dueño solo puede cancelar estando pendiente; el resto lo mueve el backend.
create policy orders_owner_cancel on public.orders
  for update using (user_id = auth.uid() and status = 'PENDING_PAYMENT')
  with check (user_id = auth.uid() and status = 'CANCELLED');
create policy orders_admin_all on public.orders
  for all using (public.is_admin()) with check (public.is_admin());

create policy order_items_owner_select on public.order_items
  for select using (exists (select 1 from public.orders o
    where o.id = order_id and o.user_id = auth.uid()));
create policy order_items_checkout_insert on public.order_items
  for insert with check (public.can_write_order_items(order_id));
create policy order_items_admin_all on public.order_items
  for all using (public.is_admin()) with check (public.is_admin());

create policy order_history_owner_select on public.order_status_history
  for select using (exists (select 1 from public.orders o
    where o.id = order_id and o.user_id = auth.uid()));
create policy order_history_admin_all on public.order_status_history
  for all using (public.is_admin()) with check (public.is_admin());

create policy payments_owner_select on public.payments
  for select using (exists (select 1 from public.orders o
    where o.id = order_id and o.user_id = auth.uid()));
create policy payments_admin_all on public.payments
  for all using (public.is_admin()) with check (public.is_admin());

create policy shipments_owner_select on public.shipments
  for select using (exists (select 1 from public.orders o
    where o.id = order_id and o.user_id = auth.uid()));
create policy shipments_admin_all on public.shipments
  for all using (public.is_admin()) with check (public.is_admin());

-- Reservas: sin acceso directo de clientes; solo admin lectura, backend escribe.
create policy reservations_admin_select on public.product_reservations
  for select using (public.is_admin());

-- ============================================================================
-- CONFIGURACIÓN COMERCIAL (lectura pública de lo activo, escritura admin)
-- ============================================================================
create policy shipping_rates_public_read on public.shipping_rates
  for select using (is_active);
create policy shipping_rates_admin_write on public.shipping_rates
  for all using (public.is_admin()) with check (public.is_admin());

-- Cupones: el catálogo de códigos activos es legible (la VALIDACIÓN crítica
-- ocurre en validate_discount_code del backend, nunca en el cliente).
create policy discounts_public_read on public.discounts
  for select using (is_active);
create policy discounts_admin_write on public.discounts
  for all using (public.is_admin()) with check (public.is_admin());

create policy discount_usages_admin_all on public.discount_usages
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- ANALYTICS Y HOME
-- ============================================================================
-- Ingesta abierta (incluye anon), lectura solo admin.
create policy analytics_public_insert on public.analytics_events
  for insert with check (true);
create policy analytics_admin_select on public.analytics_events
  for select using (public.is_admin());

create policy home_sections_public_read on public.home_sections
  for select using (is_active);
create policy home_sections_admin_write on public.home_sections
  for all using (public.is_admin()) with check (public.is_admin());
