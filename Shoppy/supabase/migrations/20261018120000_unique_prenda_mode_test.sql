-- Unicidad de prendas + marcado de compras de prueba (sandbox) vs reales (live).
-- Compatible con el esquema auditado; no reescribe usuarios, productos comerciales,
-- precios ni pedidos pagados. La historia se registra en la misma transacción.
begin;

-- 1) Modo en pedidos y pagos: el Edge Function lo estampa al crear
--    ('live' por defecto para cualquier escritura anterior).
alter table public.orders add column if not exists mode text not null default 'live' check (mode in ('live','test'));
alter table public.payments add column if not exists mode text not null default 'live' check (mode in ('live','test'));

-- Toda la operación vigente pertenece a la fase sandbox: se marca como test.
update public.orders set mode = 'test' where mode = 'live';
update public.payments set mode = 'test' where mode = 'live';

-- 2) Prenda única: una prenda publicada sin ventas paralelas permitidas
--    debe quedar con stock 1 (una sola unidad física por prenda).
alter table public.products add column if not exists allow_parallel_sales boolean not null default false;

-- Normalización previa (todo producto publicado con stock>1 era dato sandbox).
update public.products set stock = 1, availability = 'AVAILABLE'
where published_at is not null and not allow_parallel_sales and stock > 1;

create or replace function public.guardar_prenda_unica()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if NEW.published_at is not null and not coalesce(NEW.allow_parallel_sales, false) and NEW.stock > 1 then
    raise exception 'UNIQUE_PRENDA_STOCK: prenda única publicada requiere stock = 1';
  end if;
  return NEW;
end $$;

drop trigger if exists products_prenda_unica_guard on public.products;
create trigger products_prenda_unica_guard
before insert or update of stock, published_at, allow_parallel_sales
on public.products for each row execute function public.guardar_prenda_unica();

-- 3) El pedido hereda el modo del intento de pago: parámetro p_mode,
--    servicio exclusivo del backend (Edge Function con service_role).
drop function if exists public.create_checkout_order(uuid, uuid, text, jsonb, jsonb);
create or replace function public.create_checkout_order(p_attempt uuid, p_user uuid, p_guest_token text, p_input jsonb, p_quote jsonb, p_mode text default 'live')
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare o public.orders%rowtype; line jsonb;
begin
  if auth.role() <> 'service_role' then raise exception 'FORBIDDEN'; end if;
  if p_mode not in ('live','test') then raise exception 'INVALID_PAYMENT_MODE'; end if;
  perform 1 from public.checkout_attempts where id=p_attempt and order_id is null and state='processing' for update;
  if not found then raise exception 'ATTEMPT_NOT_AVAILABLE'; end if;
  insert into public.orders(user_id,guest_token,status,subtotal_clp,discount_clp,shipping_clp,total_clp,shipping_address,discount_code,shipping_rate_id,mode)
  values(p_user,p_guest_token,'PENDING_PAYMENT',(p_quote->>'subtotal_clp')::int,(p_quote->>'discount_clp')::int,
    (p_quote->>'shipping_clp')::int,(p_quote->>'total_clp')::int,p_input->'address',nullif(trim(p_input->>'discount_code'),''),(p_input->>'shipping_rate_id')::uuid,p_mode)
  returning * into o;
  for line in select value from jsonb_array_elements(p_quote->'lines') loop
    insert into public.order_items(order_id,product_id,product_slug,product_name,brand_name,size,color,condition,image_url,unit_price_clp,qty)
    values(o.id,(line->>'product_id')::uuid,line->>'product_slug',line->>'product_name',line->>'brand_name',line->>'size',line->>'color',
      (line->>'condition')::public.product_condition,line->>'image_url',(line->>'unit_price_clp')::int,(line->>'qty')::int);
  end loop;
  if p_quote->>'discount_id' is not null then
    if not public.claim_discount_usage((p_quote->>'discount_id')::uuid) then raise exception 'DISCOUNT_USAGE_LIMIT'; end if;
    insert into public.discount_usages(discount_id,order_id,user_id) values((p_quote->>'discount_id')::uuid,o.id,p_user);
  end if;
  perform public.reserve_products(o.id,p_input->'items');
  update public.checkout_attempts set order_id=o.id where id=p_attempt;
  return jsonb_build_object('id',o.id,'order_number',o.order_number,'guest_token',o.guest_token,'total_clp',o.total_clp);
end $$;
revoke all on function public.create_checkout_order(uuid, uuid, text, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.create_checkout_order(uuid, uuid, text, jsonb, jsonb, text) to service_role;

insert into supabase_migrations.schema_migrations(version, name)
values ('20261018120000', 'unique_prenda_mode_test')
on conflict (version) do nothing;

commit;
