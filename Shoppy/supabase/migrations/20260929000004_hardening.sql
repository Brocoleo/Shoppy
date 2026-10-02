-- ============================================================================
-- SHOPY · 20260929000004_hardening
-- Cierre de la superficie de ataque encontrada en la auditoría de Fase 10.
--
-- Sin cambios de comportamiento observables para la app: la creación de
-- pedidos y sus ítems ocurre SIEMPRE en la Edge Function `checkout` con
-- service_role (ver apps/mobile/src/lib/checkout.ts), y los cupones se
-- validan desde backend. Sólo se cierra el acceso directo desde el Data API.
-- ============================================================================

-- ============================================================================
-- 1. search_path inmutable en TODAS las funciones SECURITY DEFINER
--    `public` deja que pg_temp se anteponga al resolver auth.uid()/auth.role().
--    Agregar pg_temp explícitamente AL FINAL del path lo neutraliza.
-- ============================================================================
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    execute format('alter function %s set search_path = public, pg_temp', f.sig);
  end loop;
end $$;

-- ============================================================================
-- 2. Escalada de privilegios: profiles.role NO es autoasignable
--    profiles_owner_rw es una policy de FILA, no de columna: el WITH CHECK solo
--    validaba `id`, así que un cliente podía hacer UPDATE role='admin' sobre
--    su propio perfil y abrir las 15 policies *admin_*.
--    El toggle de admin (apps/admin/src/app/clientes/page.tsx) sigue
--    funcionando: is_admin() evalúa el rol del QUIEN LLAMA, no el de la fila.
-- ============================================================================
-- NOTA: dentro de un SECURITY DEFINER, current_user es el OWNER, no quien
-- llama; por eso la excepción operativa usa session_user (el login real) y
-- exige además auth.uid() IS NULL (sin JWT). Vía PostgREST session_user es
-- 'authenticator', así que un atacante no puede alcanzar esta vía: solo una
-- conexión directa como postgres (SQL editor / bootstrap inicial).
create or replace function public.guard_profile_role()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.role is distinct from old.role
     and auth.role() is distinct from 'service_role'
     and not (session_user in ('postgres', 'service_role') and auth.uid() is null)
     and not public.is_admin() then
    raise exception 'FORBIDDEN: role no es autoasignable';
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function public.guard_profile_role();

-- ============================================================================
-- 3. RPC backend-only: revocar EXECUTE a anon/authenticated/public
--    Causa raíz: `grant execute on all functions ... to anon, authenticated`
--    (20260928000001_rls_policies.sql:39) exponía helpers SECURITY DEFINER
--    que saltan RLS. PostgREST además otorga EXECUTE a PUBLIC por defecto en
--    cada CREATE FUNCTION, por eso se revoca también de PUBLIC.
--
--    · reserve_products          → DoS de stock desde anon (key pública)
--    · claim_discount_usage      → agotamiento de cupones desde anon
--    · release_expired_reservations → UPDATE masivo + ventana de doble venta
--    · refresh_trending_scores   → UPDATE masivo + ranking falseado
--    · validate_discount_code    → DoS de locks (SELECT ... FOR UPDATE)
--    (can_write_order_items se trata en §4: queda abierto solo a
--    authenticated porque la policy owner_insert lo invoca directamente.)
--
--    La Edge Function `checkout` usa service_role: no le afecta el revoke.
-- ============================================================================
do $$
declare f text;
begin
  foreach f in array array[
    'public.reserve_products(uuid, jsonb)',
    'public.claim_discount_usage(uuid)',
    'public.release_expired_reservations()',
    'public.refresh_trending_scores()',
    'public.validate_discount_code(text, integer)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant  execute on function %s to service_role', f);
  end loop;
end $$;

-- get_guest_order SIGUE abierta a anon: es el tracking de invitado (T5).
-- mark_order_paid conserva su guard interno (test T4 documenta el FORBIDDEN).

-- ============================================================================
-- 4. IDOR de escritura: order_items ya no es insertable por clientes
--    can_write_order_items() comprobaba `guest_token is not null` — es decir,
--    NUNCA comparaba el token con nada. Cualquier anónimo podía insertar
--    líneas falsas (precio, nombre, product_id) en el pedido de OTRO invitado.
--    Además no miraba orders.status, así que era válido en pedidos ya pagados.
--
--    El checkout real inserta con service_role (index.ts:265), que bypasea
--    RLS. Se deja la vía de INSERT sólo para el dueño autenticado de un
--    pedido pendiente, y se cierra la de anónimos.
-- ============================================================================
create or replace function public.can_write_order_items(p_order_id uuid)
returns boolean language sql security definer stable set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order_id
      and o.status = 'PENDING_PAYMENT'
      and o.user_id is not null
      and o.user_id = auth.uid()
  );
$$;

-- NOTA: authenticated CONSERVA el execute: la policy order_items_owner_insert
-- lo invoca en cada INSERT y Postgres exige el privilegio aunque sea definer.
-- La función ya solo retorna true para el dueño autenticado de un pedido
-- PENDING_PAYMENT, así que exponerla a authenticated no filtra nada ajeno.
revoke execute on function public.can_write_order_items(uuid) from public, anon;
grant  execute on function public.can_write_order_items(uuid) to authenticated, service_role;

drop policy if exists order_items_checkout_insert on public.order_items;
create policy order_items_owner_insert on public.order_items
  for insert to authenticated
  with check (public.can_write_order_items(order_id));

revoke insert on public.order_items from anon;

-- ============================================================================
-- 5. Pedidos: el cliente nunca decide montos
--    orders_owner_insert dejaba a anon insertar pedidos con total_clp, precio
--    de ítems y dirección de envío arbitrarios. El flujo real es la Edge
--    Function con service_role, que recalcula todo desde computeQuote().
-- ============================================================================
drop policy if exists orders_owner_insert on public.orders;
revoke insert on public.orders from anon, authenticated;

-- ============================================================================
-- 6. Analytics: la ingesta abierta no puede atribuirse a terceros
--    `with check (true)` permitía fijar user_id / order_id arbitrarios y
--    emitir eventos `purchase` (peso 10.0) para reordenar "Tendencias".
--    La analítica de catálogo queda abierta; purchase/checkout_started las
--    emite el backend.
-- ============================================================================
drop policy if exists analytics_public_insert on public.analytics_events;
create policy analytics_public_insert on public.analytics_events
  for insert to anon, authenticated
  with check (
    (user_id is null or user_id = auth.uid())
    and (order_id is null or exists (
      select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()
    ))
    and event_type in ('product_view', 'search', 'add_to_cart', 'remove_from_cart', 'favorite')
  );

-- ============================================================================
-- 7. get_guest_order no devuelve el guest_token
--    El token es la credencial del pedido invitado; incluirlo en la respuesta
--    lo expone a logs/proxies intermedios. apps/mobile/src/lib/checkout.ts
--    solo lee id, order_number, status, total_clp e items.
-- ============================================================================
create or replace function public.get_guest_order(p_order_id uuid, p_token text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare result jsonb;
begin
  if p_token is null or p_token = '' then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  select (to_jsonb(o) - 'guest_token') || jsonb_build_object('items', coalesce((
    select jsonb_agg(to_jsonb(i) order by i.product_name)
    from public.order_items i where i.order_id = o.id
  ), '[]'::jsonb))
  into result
  from public.orders o
  where o.id = p_order_id and o.user_id is null and o.guest_token = p_token;

  if result is null then raise exception 'ORDER_NOT_FOUND'; end if;
  return result;
end $$;

-- ============================================================================
-- 8. Surface explicitada
--    RLS no es retroactiva con GRANT ON ALL TABLES, así que la tabla creada en
--    20260929000003 (order_notifications) no queda cubierta en installs sin los
--    default privileges de Supabase. Se hace explícito su SELECT.
--    No se otorga INSERT: las notificaciones las inserta el backend.
-- ============================================================================
revoke all on public.order_notifications from anon;
grant select on public.order_notifications to authenticated;
