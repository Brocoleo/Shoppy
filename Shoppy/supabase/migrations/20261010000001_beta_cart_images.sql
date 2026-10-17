create table public.cart_merges (
  id uuid primary key,
  user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.cart_merges enable row level security;
revoke all on public.cart_merges from anon,authenticated;

-- Snapshot y fusión son transacciones; precios siempre tomados del catálogo.
create function public.sync_my_cart(p_items jsonb default null,p_merge_id uuid default null,p_base jsonb default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare c uuid; item record; result jsonb; claimed uuid;
begin
  if auth.uid() is null then raise exception 'FORBIDDEN'; end if;
  insert into public.carts(user_id) values(auth.uid()) on conflict(user_id) do nothing;
  select id into c from public.carts where user_id=auth.uid() for update;
  if p_items is not null then
    if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>100 then raise exception 'INVALID_CART'; end if;
    if p_merge_id is not null then
      insert into public.cart_merges(id,user_id) values(p_merge_id,auth.uid()) on conflict do nothing returning id into claimed;
      if claimed is null then p_items:=null;
      elsif p_base is not null then
        if jsonb_typeof(p_base)<>'array' or jsonb_array_length(p_base)>100 then raise exception 'INVALID_CART'; end if;
        delete from public.cart_items where cart_id=c;
        for item in select (value->>'productId')::uuid as id,(value->>'qty')::int as qty from jsonb_array_elements(p_base) loop
          if item.qty is null or item.qty<1 or item.qty>99 then raise exception 'INVALID_QTY'; end if;
          insert into public.cart_items(cart_id,product_id,qty,unit_price_clp)
          select c,id,item.qty,price_clp from public.products where id=item.id and published_at is not null and availability not in ('ARCHIVED','SOLD');
        end loop;
      end if;
    else
      delete from public.cart_items where cart_id=c;
    end if;
    for item in select (value->>'productId')::uuid as id, (value->>'qty')::int as qty from jsonb_array_elements(p_items) loop
      if item.qty is null or item.qty<1 or item.qty>99 then raise exception 'INVALID_QTY'; end if;
      insert into public.cart_items(cart_id,product_id,qty,unit_price_clp)
      select c,id,item.qty,price_clp from public.products where id=item.id and published_at is not null and availability not in ('ARCHIVED','SOLD')
      on conflict(cart_id,product_id) do update set qty=case when p_merge_id is null then excluded.qty else least(99,cart_items.qty+excluded.qty) end,unit_price_clp=excluded.unit_price_clp;
    end loop;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('productId',product_id,'qty',qty) order by product_id),'[]'::jsonb) into result from public.cart_items where cart_id=c;
  return result;
end $$;
revoke all on function public.sync_my_cart(jsonb,uuid,jsonb) from public,anon;
grant execute on function public.sync_my_cart(jsonb,uuid,jsonb) to authenticated;

create function public.admin_set_product_cover(p_product_id uuid,p_image_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  perform 1 from public.products where id=p_product_id for update;
  if not exists(select 1 from public.product_images where id=p_image_id and product_id=p_product_id) then raise exception 'IMAGE_NOT_FOUND'; end if;
  update public.product_images set is_cover=false where product_id=p_product_id and is_cover;
  update public.product_images set is_cover=true where id=p_image_id;
end $$;
create function public.admin_swap_product_images(p_product_id uuid,p_first_id uuid,p_second_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare a integer; b integer;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  perform 1 from public.products where id=p_product_id for update;
  select sort_order into a from public.product_images where id=p_first_id and product_id=p_product_id;
  select sort_order into b from public.product_images where id=p_second_id and product_id=p_product_id;
  if a is null or b is null then raise exception 'IMAGE_NOT_FOUND'; end if;
  update public.product_images set sort_order=case when id=p_first_id then b else a end where id in(p_first_id,p_second_id);
end $$;
revoke all on function public.admin_set_product_cover(uuid,uuid),public.admin_swap_product_images(uuid,uuid,uuid) from public,anon;
grant execute on function public.admin_set_product_cover(uuid,uuid),public.admin_swap_product_images(uuid,uuid,uuid) to authenticated;

create function public.ensure_product_cover() returns trigger language plpgsql security definer set search_path=public, pg_temp as $$
declare product uuid;
begin
  product:=case when TG_OP='DELETE' then old.product_id else new.product_id end;
  perform 1 from public.products where id=product for update;
  if not exists(select 1 from public.product_images where product_id=product and is_cover) then
    update public.product_images set is_cover=true where id=(select id from public.product_images where product_id=product order by sort_order,id limit 1);
  end if;
  return null;
end $$;
revoke all on function public.ensure_product_cover() from public,anon,authenticated;
create trigger product_images_ensure_cover after insert or delete on public.product_images for each row execute function public.ensure_product_cover();

-- Borrar una fila deja una tarea durable hasta confirmar la limpieza del objeto.
create table public.image_cleanup(storage_path text primary key, product_id uuid not null,created_at timestamptz not null default now());
alter table public.image_cleanup enable row level security;
create policy image_cleanup_admin on public.image_cleanup for all to authenticated using(public.is_admin()) with check(public.is_admin());
grant select,insert,update,delete on public.image_cleanup to authenticated;
create function public.queue_image_cleanup() returns trigger language plpgsql security definer set search_path=public, pg_temp as $$
begin
  insert into public.image_cleanup(storage_path,product_id) values(old.storage_path,old.product_id) on conflict do nothing;
  return null;
end $$;
revoke all on function public.queue_image_cleanup() from public,anon,authenticated;
create trigger product_image_cleanup after delete on public.product_images for each row execute function public.queue_image_cleanup();
