-- ============================================================================
-- SHOPY · rls_tests.sql — verificación de seguridad y reglas críticas.
-- Se ejecuta con psql como superuser contra DB con stub auth + migraciones + seed.
-- Cada bloque anuncia PASS via NOTICE; cualquier fallo hace RAISE (exit != 0).
-- Patrón: SET ROLE / app.uid a nivel de sesión + DO solo para asserts.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Fixtures: 2 clientes + 1 admin (el trigger on_auth_user_created crea perfiles)
-- ----------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'a@shopy.cl'),
  ('22222222-2222-4222-8222-222222222222', 'b@shopy.cl'),
  ('33333333-3333-4333-8333-333333333333', 'admin@shopy.cl');

update public.profiles set role = 'admin'
  where id = '33333333-3333-4333-8333-333333333333';

do $$ begin
  if (select count(*) from public.profiles) <> 3 then
    raise exception 'FIXTURE FAIL: trigger on_auth_user_created no creó perfiles';
  end if;
  raise notice 'PASS: fixtures (3 usuarios, trigger auto-perfil OK)';
end $$;

-- Pedidos propios de A y B.
insert into public.orders (id, user_id, status, subtotal_clp, total_clp, shipping_address) values
  ('a000aa00-0000-4000-8000-0000000000a1', '11111111-1111-4111-8111-111111111111',
   'PENDING_PAYMENT', 10000, 10000, '{"fullName":"A"}'),
  ('b000bb00-0000-4000-8000-0000000000b1', '22222222-2222-4222-8222-222222222222',
   'PENDING_PAYMENT', 20000, 20000, '{"fullName":"B"}');

-- Producto de prueba stock 1 para reserva/doble-venta.
insert into public.products
  (id, slug, name, price_clp, stock, published_at)
values
  ('f0000000-0000-4000-8000-00000000aa01', 'test-unico-t1', 'Test Único T1', 5000, 1, now());

-- ============================================================================
-- T0 · Seed íntegro
-- ============================================================================
do $$ declare
  np int; ni int; nc int; nb int; ns int; nd int; ncol int; nh int;
begin
  select count(*) into np from public.products;
  if np <> 21 then raise exception 'T0 FAIL: products=% (esperado 21: 20 seed + 1 test)', np; end if;
  select count(*) into ni from public.product_images;
  if ni <> 40 then raise exception 'T0 FAIL: product_images=% (esperado 40)', ni; end if;
  select count(*) into nc from public.categories;
  if nc <> 16 then raise exception 'T0 FAIL: categories=% (esperado 16)', nc; end if;
  select count(*) into nb from public.brands;
  if nb <> 12 then raise exception 'T0 FAIL: brands=% (esperado 12)', nb; end if;
  select count(*) into ns from public.shipping_rates;
  if ns <> 10 then raise exception 'T0 FAIL: shipping_rates=% (esperado 10)', ns; end if;
  select count(*) into nd from public.discounts;
  if nd <> 2 then raise exception 'T0 FAIL: discounts=% (esperado 2)', nd; end if;
  select count(*) into ncol from public.collections;
  if ncol <> 2 then raise exception 'T0 FAIL: collections=% (esperado 2)', ncol; end if;
  select count(*) into nh from public.home_sections;
  if nh <> 6 then raise exception 'T0 FAIL: home_sections=% (esperado 6)', nh; end if;
  raise notice 'PASS T0: seed íntegro (20 productos, 40 imágenes, 16 categorías, 12 marcas)';
end $$;

-- ============================================================================
-- T1 · A ve su pedido; B NO ve el pedido de A
-- ============================================================================
reset role;
reset app.uid;
reset app.role;
set role authenticated;
set app.uid = '11111111-1111-4111-8111-111111111111';
do $$ declare c int; begin
  select count(*) into c from public.orders
    where id = 'a000aa00-0000-4000-8000-0000000000a1';
  if c <> 1 then raise exception 'T1 FAIL: A no ve su propio pedido'; end if;
end $$;

set app.uid = '22222222-2222-4222-8222-222222222222';
do $$ declare c int; begin
  select count(*) into c from public.orders
    where id = 'a000aa00-0000-4000-8000-0000000000a1';
  if c <> 0 then raise exception 'T1 FAIL: B puede leer el pedido de A (IDOR)'; end if;
  update public.orders set status = 'CANCELLED'
    where id = 'a000aa00-0000-4000-8000-0000000000a1';
  if not found then
    -- update bloqueado por RLS: correcto (0 filas).
    null;
  else
    raise exception 'T1 FAIL: B pudo modificar el pedido de A';
  end if;
end $$;
do $$ begin raise notice 'PASS T1: aislamiento de pedidos A/B'; end $$;

-- ============================================================================
-- T2 · anon NO puede insertar productos
-- ============================================================================
reset role;
reset app.uid;
reset app.role;
set role anon;
do $$ begin
  insert into public.products (slug, name, price_clp) values ('hack', 'Hack', 1);
  raise exception 'T2 FAIL: anon insertó un producto';
exception when insufficient_privilege then
  raise notice 'PASS T2: anon no puede insertar productos';
end $$;

-- ============================================================================
-- T3 · cliente NO puede modificar precios
-- ============================================================================
reset role;
reset app.uid;
reset app.role;
set role authenticated;
set app.uid = '22222222-2222-4222-8222-222222222222';
do $$ declare n int; begin
  update public.products set price_clp = 1
    where id = 'd0000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T3 FAIL: cliente modificó precio'; end if;
  raise notice 'PASS T3: cliente no puede modificar precios';
end $$;

-- ============================================================================
-- T4 · cliente NO puede marcar pedidos como PAID
-- ============================================================================
reset role;
reset app.uid;
reset app.role;
set role authenticated;
set app.uid = '22222222-2222-4222-8222-222222222222';
do $$ begin
  perform public.mark_order_paid('a000aa00-0000-4000-8000-0000000000a1');
  raise exception 'T4 FAIL: cliente marcó pedido como PAID';
exception when others then
  if sqlerrm not like '%FORBIDDEN%' then raise; end if;
  raise notice 'PASS T4: marcar PAID solo backend (FORBIDDEN para cliente)';
end $$;

-- ============================================================================
-- T5 · invitado rastrea SOLO con token (RPC), token erróneo falla
-- ============================================================================
-- Fixture como backend (service_role): el INSERT directo de orders/order_items
-- por anon quedó revocado en 20260929000004 (el checkout real usa service_role).
reset role;
reset app.uid;
reset app.role;
do $$ begin
  insert into public.orders (id, guest_token, status, subtotal_clp, total_clp, shipping_address)
  values ('c000cc00-0000-4000-8000-0000000000c1', 'tok_invitado_abc123',
          'PENDING_PAYMENT', 5000, 5000, '{"fullName":"Invitado"}');
  insert into public.order_items
    (order_id, product_slug, product_name, condition, unit_price_clp, qty)
  values ('c000cc00-0000-4000-8000-0000000000c1', 'test-unico-t1', 'Test Único T1',
          'bueno', 5000, 1);
end $$;

-- anon NO puede insertar pedidos directos (contrato endurecido).
set role anon;
do $$ begin
  insert into public.orders (guest_token, status, subtotal_clp, total_clp, shipping_address)
  values ('tok_hack', 'PENDING_PAYMENT', 1, 1, '{"fullName":"Hack"}');
  raise exception 'T5 FAIL: anon insertó un pedido directo';
exception when insufficient_privilege then
  null;
end $$;

do $$ declare j jsonb; begin
  select public.get_guest_order('c000cc00-0000-4000-8000-0000000000c1', 'tok_invitado_abc123') into j;
  if j is null or (j ->> 'id') <> 'c000cc00-0000-4000-8000-0000000000c1' then
    raise exception 'T5 FAIL: RPC no devolvió el pedido con token válido';
  end if;
  if jsonb_array_length(j -> 'items') <> 1 then
    raise exception 'T5 FAIL: RPC sin items';
  end if;

  begin
    perform public.get_guest_order('c000cc00-0000-4000-8000-0000000000c1', 'token-erroneo');
    raise exception 'T5 FAIL: RPC aceptó token erróneo';
  exception when others then
    if sqlerrm not like '%ORDER_NOT_FOUND%' then raise; end if;
  end;

  -- anon NO puede leer la tabla directa (solo vía RPC).
  if (select count(*) from public.orders
      where id = 'c000cc00-0000-4000-8000-0000000000c1') <> 0 then
    raise exception 'T5 FAIL: anon lee orders sin token';
  end if;
  -- el RPC ya no devuelve la credencial guest_token.
  if j ? 'guest_token' then
    raise exception 'T5 FAIL: get_guest_order expone guest_token';
  end if;
  raise notice 'PASS T5: invitado solo con token vía RPC';
end $$;

-- ============================================================================
-- T6 · doble venta imposible (reserva atómica)
-- ============================================================================
-- La reserva la ejecuta el backend (service_role): el EXECUTE directo por
-- clientes quedó revocado en 20260929000004.
reset role;
reset app.uid;
reset app.role;
set app.role = 'service_role';
do $$ declare s int; a public.product_availability; begin
  perform public.reserve_products(
    'a000aa00-0000-4000-8000-0000000000a1',
    '[{"product_id": "f0000000-0000-4000-8000-00000000aa01", "qty": 1}]');
  select stock, availability into s, a from public.products
    where id = 'f0000000-0000-4000-8000-00000000aa01';
  if s <> 0 or a <> 'RESERVED' then
    raise exception 'T6 FAIL: reserva no descontó stock (%, %)', s, a;
  end if;

  begin
    perform public.reserve_products(
      'b000bb00-0000-4000-8000-0000000000b1',
      '[{"product_id": "f0000000-0000-4000-8000-00000000aa01", "qty": 1}]');
    raise exception 'T6 FAIL: segunda reserva exitosa (doble venta)';
  exception when others then
    if sqlerrm not like '%INSUFFICIENT_STOCK%' then raise; end if;
  end;
  raise notice 'PASS T6: doble venta bloqueada (INSUFFICIENT_STOCK)';
end $$;

-- Cliente NO puede invocar la reserva directamente (DoS de stock cerrado).
reset role;
reset app.uid;
reset app.role;
set role authenticated;
set app.uid = '11111111-1111-4111-8111-111111111111';
do $$ begin
  perform public.reserve_products(
    'b000bb00-0000-4000-8000-0000000000b1',
    '[{"product_id": "f0000000-0000-4000-8000-00000000aa01", "qty": 1}]');
  raise exception 'T6 FAIL: cliente invocó reserve_products';
exception when insufficient_privilege then
  raise notice 'PASS T6b: reserve_products solo backend';
end $$;

-- ============================================================================
-- T7 · expiración de reserva revierte stock
-- ============================================================================
reset role;
reset app.uid;
reset app.role;
do $$ declare n int; s int; a public.product_availability; begin
  update public.product_reservations set expires_at = now() - interval '1 minute'
    where order_id = 'a000aa00-0000-4000-8000-0000000000a1' and status = 'active';
  select public.release_expired_reservations() into n;
  if n <> 1 then raise exception 'T7 FAIL: liberadas=% (esperado 1)', n; end if;
  select stock, availability into s, a from public.products
    where id = 'f0000000-0000-4000-8000-00000000aa01';
  if s <> 1 or a <> 'AVAILABLE' then
    raise exception 'T7 FAIL: no revirtió (%, %)', s, a;
  end if;
  raise notice 'PASS T7: expiración revierte RESERVED -> AVAILABLE';
end $$;

-- ============================================================================
-- T8 · pago: PAID idempotente, SOLD, transición ilegal bloqueada
-- ============================================================================
reset role;
reset app.uid;
reset app.role;
-- El backend (service_role, vía Edge Function checkout) crea ítems + reserva.
do $$ begin
  insert into public.order_items
    (order_id, product_id, product_slug, product_name, condition, unit_price_clp, qty)
  values ('a000aa00-0000-4000-8000-0000000000a1',
          'f0000000-0000-4000-8000-00000000aa01',
          'test-unico-t1', 'Test Único T1', 'bueno', 5000, 1);
  perform public.reserve_products(
    'a000aa00-0000-4000-8000-0000000000a1',
    '[{"product_id": "f0000000-0000-4000-8000-00000000aa01", "qty": 1}]');
end $$;

-- El dueño autenticado SÍ puede agregar ítems a su pedido PENDING_PAYMENT
-- (policy order_items_owner_insert); en pedido ajeno, no.
set role authenticated;
set app.uid = '11111111-1111-4111-8111-111111111111';
do $$ begin
  insert into public.order_items
    (order_id, product_slug, product_name, condition, unit_price_clp, qty)
  values ('b000bb00-0000-4000-8000-0000000000b1', 'test-unico-t1', 'Test Único T1',
          'bueno', 5000, 1);
  raise exception 'T8 FAIL: A insertó ítem en pedido de B (IDOR)';
exception when others then
  if sqlerrm not like '%policy%' and sqlerrm not like '%permission%' then raise; end if;
  raise notice 'PASS T8d: IDOR de order_items bloqueado';
end $$;

reset role;
reset app.uid;
reset app.role;
set app.role = 'service_role';
do $$ declare st public.order_status; a public.product_availability; rs int; begin
  perform public.mark_order_paid('a000aa00-0000-4000-8000-0000000000a1');
  perform public.mark_order_paid('a000aa00-0000-4000-8000-0000000000a1'); -- idempotente
  select status into st from public.orders where id = 'a000aa00-0000-4000-8000-0000000000a1';
  if st <> 'PAID' then raise exception 'T8 FAIL: status=% (esperado PAID)', st; end if;
  select availability into a from public.products
    where id = 'f0000000-0000-4000-8000-00000000aa01';
  if a <> 'SOLD' then raise exception 'T8 FAIL: producto=% (esperado SOLD)', a; end if;
  select count(*) into rs from public.product_reservations
    where order_id = 'a000aa00-0000-4000-8000-0000000000a1' and status = 'consumed';
  if rs < 1 then raise exception 'T8 FAIL: reserva no consumida'; end if;
  if (select count(*) from public.order_status_history
      where order_id = 'a000aa00-0000-4000-8000-0000000000a1'
      and to_status = 'PAID') < 1 then
    raise exception 'T8 FAIL: sin historial PAID';
  end if;
  raise notice 'PASS T8a: pago idempotente, SOLD + historial';
end $$;

-- Transición ilegal aun como admin.
reset role;
reset app.uid;
reset app.role;
set role authenticated;
set app.uid = '33333333-3333-4333-8333-333333333333';
do $$ begin
  update public.orders set status = 'DELIVERED'
    where id = 'a000aa00-0000-4000-8000-0000000000a1';
  raise exception 'T8 FAIL: transición PAID->DELIVERED permitida';
exception when others then
  if sqlerrm not like '%INVALID_ORDER_TRANSITION%' then raise; end if;
  raise notice 'PASS T8b: transición ilegal bloqueada (PAID->DELIVERED)';
end $$;

-- Ruta legal PAID -> PREPARING -> SHIPPED funciona.
do $$ declare st public.order_status; begin
  update public.orders set status = 'PREPARING'
    where id = 'a000aa00-0000-4000-8000-0000000000a1';
  update public.orders set status = 'SHIPPED'
    where id = 'a000aa00-0000-4000-8000-0000000000a1';
  select status into st from public.orders where id = 'a000aa00-0000-4000-8000-0000000000a1';
  if st <> 'SHIPPED' then raise exception 'T8 FAIL: ruta legal no avanzó'; end if;
  raise notice 'PASS T8c: ruta legal PAID->PREPARING->SHIPPED OK';
end $$;

-- ============================================================================
-- T9 · cupones: válido, mínimo no alcanzado, inexistente
-- ============================================================================
-- La validación de cupones la ejecuta el backend (service_role): el EXECUTE
-- directo por anon quedó revocado en 20260929000004 (DoS de locks).
reset role;
reset app.uid;
reset app.role;
set app.role = 'service_role';
do $$ declare amt int; begin
  select amount_clp into amt from public.validate_discount_code('BIENVENIDA10', 25000);
  if amt <> 2500 then raise exception 'T9 FAIL: 10%% de 25000=% (esperado 2500)', amt; end if;
  select amount_clp into amt from public.validate_discount_code('bienvenida10', 20000);
  if amt <> 2000 then raise exception 'T9 FAIL: código debe ser case-insensitive'; end if;

  begin
    perform public.validate_discount_code('BIENVENIDA10', 10000);
    raise exception 'T9 FAIL: aceptó subtotal bajo el mínimo';
  exception when others then
    if sqlerrm not like '%DISCOUNT_MIN_SUBTOTAL%' then raise; end if;
  end;

  begin
    perform public.validate_discount_code('NOEXISTE', 50000);
    raise exception 'T9 FAIL: aceptó código inexistente';
  exception when others then
    if sqlerrm not like '%DISCOUNT_NOT_FOUND%' then raise; end if;
  end;
  raise notice 'PASS T9: validación de cupones (monto, mínimo, inexistente)';
end $$;

-- anon NO puede invocar la validación directamente.
reset role;
reset app.uid;
reset app.role;
set role anon;
do $$ declare amt int; begin
  select amount_clp into amt from public.validate_discount_code('BIENVENIDA10', 25000);
  raise exception 'T9 FAIL: anon invocó validate_discount_code';
exception when insufficient_privilege then
  raise notice 'PASS T9b: validate_discount_code solo backend';
end $$;

-- ============================================================================
-- T10 · analytics: ingesta abierta, lectura solo admin
-- ============================================================================
reset role;
reset app.uid;
reset app.role;
set role anon;
do $$ begin
  insert into public.analytics_events (event_type, session_id, product_id)
  values ('product_view', 'sess-test-1', 'd0000000-0000-4000-8000-000000000001');
  if (select count(*) from public.analytics_events) <> 0 then
    raise exception 'T10 FAIL: anon puede leer analytics';
  end if;
  raise notice 'PASS T10a: anon inserta pero no lee analytics';
end $$;

reset role;
reset app.uid;
reset app.role;
set role authenticated;
set app.uid = '33333333-3333-4333-8333-333333333333';
do $$ begin
  if (select count(*) from public.analytics_events) < 1 then
    raise exception 'T10 FAIL: admin no lee analytics';
  end if;
  raise notice 'PASS T10b: admin lee analytics';
end $$;

-- La ingesta abierta NO puede atribuirse a terceros ni falsear compras.
set role anon;
do $$ begin
  insert into public.analytics_events (event_type, session_id, user_id)
  values ('product_view', 'sess-spoof', '22222222-2222-4222-8222-222222222222');
  raise exception 'T10 FAIL: anon atribuyó evento a otro usuario';
exception when others then
  if sqlerrm not like '%policy%' and sqlerrm not like '%permission%' then raise; end if;
end $$;
do $$ begin
  insert into public.analytics_events (event_type, session_id, product_id)
  values ('purchase', 'sess-spoof', 'd0000000-0000-4000-8000-000000000001');
  raise exception 'T10 FAIL: anon emitió evento purchase';
exception when others then
  if sqlerrm not like '%policy%' and sqlerrm not like '%permission%' then raise; end if;
  raise notice 'PASS T10c: analytics sin spoofing ni purchase falso';
end $$;

-- ============================================================================
-- T11 · trending pondera eventos recientes
-- ============================================================================
reset role;
reset app.uid;
reset app.role;
do $$ declare s1 float; s2 float; begin
  insert into public.analytics_events (event_type, product_id) values
    ('purchase', 'd0000000-0000-4000-8000-000000000001'),
    ('purchase', 'd0000000-0000-4000-8000-000000000001'),
    ('add_to_cart', 'd0000000-0000-4000-8000-000000000001'),
    ('product_view', 'd0000000-0000-4000-8000-000000000010');
  perform public.refresh_trending_scores();
  select trending_score into s1 from public.products
    where id = 'd0000000-0000-4000-8000-000000000001';
  select trending_score into s2 from public.products
    where id = 'd0000000-0000-4000-8000-000000000010';
  if s1 <= s2 then
    raise exception 'T11 FAIL: trending no pondera (chaqueta=% cinturón=%)', s1, s2;
  end if;
  raise notice 'PASS T11: trending pondera compras>vistas (chaqueta=% cinturón=%)', round(s1::numeric, 2), round(s2::numeric, 2);
end $$;

-- ============================================================================
-- T12 · profiles.role NO es autoasignable (escalada cerrada en hardening)
-- ============================================================================
reset role;
reset app.uid;
reset app.role;
set role authenticated;
set app.uid = '22222222-2222-4222-8222-222222222222';
do $$ begin
  update public.profiles set role = 'admin'
    where id = '22222222-2222-4222-8222-222222222222';
  raise exception 'T12 FAIL: cliente se autoasignó admin';
exception when others then
  if sqlerrm not like '%FORBIDDEN%' then raise; end if;
  raise notice 'PASS T12a: auto-promoción a admin bloqueada';
end $$;

-- El admin SÍ puede cambiar roles (toggle de apps/admin clientes).
set app.uid = '33333333-3333-4333-8333-333333333333';
do $$ begin
  update public.profiles set role = 'admin'
    where id = '22222222-2222-4222-8222-222222222222';
  update public.profiles set role = 'customer'
    where id = '22222222-2222-4222-8222-222222222222';
  raise notice 'PASS T12b: admin conserva gestión de roles';
end $$;

-- El dueño SÍ puede editar su propio nombre (el guard solo frena role).
set app.uid = '22222222-2222-4222-8222-222222222222';
do $$ begin
  update public.profiles set full_name = 'B Actualizado'
    where id = '22222222-2222-4222-8222-222222222222';
  raise notice 'PASS T12c: edición propia de perfil intacta';
end $$;

-- ============================================================================
-- T13 · search_path inmutable en TODAS las SECURITY DEFINER (skill supabase)
-- ============================================================================
reset role;
reset app.uid;
reset app.role;
do $$ declare bad text; begin
  select string_agg(p.proname, ', ' order by p.proname) into bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and not exists (
      select 1 from unnest(coalesce(p.proconfig, '{}')) c
      where c like 'search_path=%pg_temp%'
    );
  if bad is not null then
    raise exception 'T13 FAIL: search_path sin pg_temp en: %', bad;
  end if;
  raise notice 'PASS T13: search_path inmutable con pg_temp en todas las DEFINER';
end $$;

reset role;
reset app.uid;
reset app.role;
do $$ begin raise notice 'ALL DB TESTS PASSED'; end $$;
