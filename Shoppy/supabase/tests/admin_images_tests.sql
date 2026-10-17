-- SOLO DB local de pruebas con setup_local.sql, init_schema, rls_policies y
-- 20261016161216_admin_images_vinta_20261016.sql aplicadas. psql -v ON_ERROR_STOP=1 -f este archivo.
-- Las fixtures y todas las mutaciones de esta prueba se revierten.
begin;
insert into auth.users(id, email) values
  ('e1610000-0000-4000-8000-000000000001', 'images-admin@example.test'),
  ('e1610000-0000-4000-8000-000000000002', 'images-customer@example.test');
update public.profiles set role = 'admin' where id = 'e1610000-0000-4000-8000-000000000001';
insert into public.products(id, slug, name, price_clp, stock) values
  ('e1610000-0000-4000-8000-000000000011', 'images-test-one', 'Prueba uno', 1000, 1),
  ('e1610000-0000-4000-8000-000000000012', 'images-test-two', 'Prueba dos', 1000, 1);
insert into public.product_images(id, product_id, storage_path, sort_order) values
  ('e1610000-0000-4000-8000-000000000021', 'e1610000-0000-4000-8000-000000000011', 'test/one-a.webp', 0),
  ('e1610000-0000-4000-8000-000000000022', 'e1610000-0000-4000-8000-000000000011', 'test/one-b.webp', 1),
  ('e1610000-0000-4000-8000-000000000023', 'e1610000-0000-4000-8000-000000000012', 'test/two-a.webp', 0);

set local role anon;
do $$ begin
  if has_function_privilege('public.admin_set_product_cover(uuid,uuid)', 'EXECUTE')
    or has_function_privilege('public.admin_swap_product_images(uuid,uuid,uuid)', 'EXECUTE')
    or has_table_privilege('public.image_cleanup', 'SELECT') then
    raise exception 'Anon puede ejecutar operaciones administrativas';
  end if;
  raise notice 'PASS: anon sin acceso administrativo';
end $$;
reset role;
set local app.uid = 'e1610000-0000-4000-8000-000000000002';
set local role authenticated;
do $$ begin
  begin
    perform public.admin_set_product_cover('e1610000-0000-4000-8000-000000000011', 'e1610000-0000-4000-8000-000000000022');
    raise exception 'Cliente cambió portada';
  exception when insufficient_privilege then null; end;
  begin
    perform public.admin_swap_product_images('e1610000-0000-4000-8000-000000000011', 'e1610000-0000-4000-8000-000000000021', 'e1610000-0000-4000-8000-000000000022');
    raise exception 'Cliente reordenó imágenes';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.image_cleanup(storage_path, product_id)
      values ('test/customer.webp', 'e1610000-0000-4000-8000-000000000011');
    raise exception 'Cliente creó tarea de limpieza';
  exception when insufficient_privilege then null; end;
  if exists(select 1 from public.image_cleanup) then raise exception 'Cliente lee limpieza'; end if;
  raise notice 'PASS: cliente bloqueado por RPC y RLS';
end $$;

set local app.uid = 'e1610000-0000-4000-8000-000000000001';
do $$ begin
  if not exists(select 1 from public.product_images where id = 'e1610000-0000-4000-8000-000000000021' and is_cover) then
    raise exception 'Primera foto no obtiene portada';
  end if;
  begin
    perform public.admin_set_product_cover('e1610000-0000-4000-8000-000000000011', 'e1610000-0000-4000-8000-000000000023');
    raise exception 'Portada de otro producto aceptada';
  exception when others then if sqlerrm <> 'IMAGE_NOT_FOUND' then raise; end if; end;
  begin
    perform public.admin_swap_product_images('e1610000-0000-4000-8000-000000000011', 'e1610000-0000-4000-8000-000000000021', 'e1610000-0000-4000-8000-000000000023');
    raise exception 'Reordenamiento entre productos aceptado';
  exception when others then if sqlerrm <> 'IMAGE_NOT_FOUND' then raise; end if; end;
  perform public.admin_set_product_cover('e1610000-0000-4000-8000-000000000011', 'e1610000-0000-4000-8000-000000000022');
  perform public.admin_set_product_cover('e1610000-0000-4000-8000-000000000011', 'e1610000-0000-4000-8000-000000000022');
  if (select count(*) from public.product_images where product_id = 'e1610000-0000-4000-8000-000000000011' and is_cover) <> 1
    or not exists(select 1 from public.product_images where id = 'e1610000-0000-4000-8000-000000000022' and is_cover) then
    raise exception 'Cambio de portada no es único o idempotente';
  end if;
  begin
    update public.product_images set is_cover = true where id = 'e1610000-0000-4000-8000-000000000021';
    raise exception 'Se admitieron dos portadas en el mismo producto';
  exception when unique_violation then null; end;
  perform public.admin_swap_product_images('e1610000-0000-4000-8000-000000000011', 'e1610000-0000-4000-8000-000000000021', 'e1610000-0000-4000-8000-000000000022');
  if (select sort_order from public.product_images where id = 'e1610000-0000-4000-8000-000000000021') <> 1
    or (select sort_order from public.product_images where id = 'e1610000-0000-4000-8000-000000000022') <> 0 then
    raise exception 'No se intercambió el orden';
  end if;
  delete from public.product_images where id = 'e1610000-0000-4000-8000-000000000022';
  if not exists(select 1 from public.product_images where id = 'e1610000-0000-4000-8000-000000000021' and is_cover)
    or not exists(select 1 from public.image_cleanup where storage_path = 'test/one-b.webp') then
    raise exception 'Eliminación no conserva portada y tarea durable';
  end if;
  delete from public.products where id = 'e1610000-0000-4000-8000-000000000011';
  if (select count(*) from public.image_cleanup where product_id = 'e1610000-0000-4000-8000-000000000011') <> 2 then
    raise exception 'Cascada del producto perdió limpieza pendiente';
  end if;
  raise notice 'PASS: pertenencia, portada, reordenamiento y limpieza durable';
end $$;
set local app.uid = '';
do $$ begin
  begin
    perform public.admin_set_product_cover('e1610000-0000-4000-8000-000000000012', 'e1610000-0000-4000-8000-000000000023');
    raise exception 'Sesión sin usuario cambió portada';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS: sesión sin usuario bloqueada';
end $$;
reset role;
do $$ begin
  if exists(select 1 from pg_proc where oid in (
    'public.admin_set_product_cover(uuid,uuid)'::regprocedure,
    'public.admin_swap_product_images(uuid,uuid,uuid)'::regprocedure,
    'public.ensure_product_cover()'::regprocedure,
    'public.queue_image_cleanup()'::regprocedure
  ) and (not prosecdef or not ('search_path=""' = any(proconfig)))) then
    raise exception 'Funciones sin SECURITY DEFINER o search_path seguro';
  end if;
  if has_function_privilege('authenticated', 'public.ensure_product_cover()', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.queue_image_cleanup()', 'EXECUTE') then
    raise exception 'Funciones de trigger expuestas';
  end if;
  raise notice 'PASS: endurecimiento de funciones';
end $$;
rollback;
