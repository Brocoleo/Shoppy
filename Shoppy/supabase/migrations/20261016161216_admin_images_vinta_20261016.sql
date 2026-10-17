-- Dependencias de imágenes del admin, sin carrito ni checkout.
-- Aplicar por separado de 20261010000001_beta_cart_images.sql. Esta migración
-- también reemplaza sus objetos de imágenes si la beta ya fue aplicada.
-- La beta antigua usa CREATE sin IF NOT EXISTS: no debe ejecutarse después.
begin;

-- No corregir datos existentes silenciosamente si el índice falta o hay deriva.
do $$ begin
  if exists (
    select product_id from public.product_images
    where is_cover group by product_id having count(*) > 1
  ) then
    raise exception 'DUPLICATE_PRODUCT_COVERS: revise las portadas antes de migrar';
  end if;
end $$;
create unique index if not exists product_images_single_cover_uidx
  on public.product_images (product_id) where is_cover;

create or replace function public.admin_set_product_cover(p_product_id uuid, p_image_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.is_admin() is not true then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  perform 1 from public.products where id = p_product_id for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
  perform 1 from public.product_images
    where product_id = p_product_id order by id for update;
  if not exists (
    select 1 from public.product_images where id = p_image_id and product_id = p_product_id
  ) then raise exception 'IMAGE_NOT_FOUND'; end if;
  update public.product_images set is_cover = false where product_id = p_product_id and is_cover;
  update public.product_images set is_cover = true where id = p_image_id and product_id = p_product_id;
end $$;

create or replace function public.admin_swap_product_images(p_product_id uuid, p_first_id uuid, p_second_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare first_order integer; second_order integer;
begin
  if auth.uid() is null or public.is_admin() is not true then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  perform 1 from public.products where id = p_product_id for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
  perform 1 from public.product_images
    where product_id = p_product_id order by id for update;
  select sort_order into first_order from public.product_images
    where id = p_first_id and product_id = p_product_id;
  select sort_order into second_order from public.product_images
    where id = p_second_id and product_id = p_product_id;
  if first_order is null or second_order is null then raise exception 'IMAGE_NOT_FOUND'; end if;
  update public.product_images
    set sort_order = case when id = p_first_id then second_order else first_order end
    where product_id = p_product_id and id in (p_first_id, p_second_id);
end $$;
revoke all on function public.admin_set_product_cover(uuid, uuid),
  public.admin_swap_product_images(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_set_product_cover(uuid, uuid),
  public.admin_swap_product_images(uuid, uuid, uuid) to authenticated;

create or replace function public.ensure_product_cover()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target_product uuid;
begin
  target_product := case when TG_OP = 'DELETE' then old.product_id else new.product_id end;
  perform 1 from public.products where id = target_product for update;
  if not exists (select 1 from public.product_images where product_id = target_product and is_cover) then
    update public.product_images set is_cover = true
      where id = (select id from public.product_images where product_id = target_product order by sort_order, id limit 1);
  end if;
  return null;
end $$;
revoke all on function public.ensure_product_cover() from public, anon, authenticated;
drop trigger if exists product_images_ensure_cover on public.product_images;
create trigger product_images_ensure_cover after insert or delete on public.product_images
  for each row execute function public.ensure_product_cover();

-- Sin FK: la tarea debe sobrevivir incluso a la eliminación del producto.
create table if not exists public.image_cleanup (
  storage_path text primary key,
  product_id uuid not null,
  created_at timestamptz not null default now()
);
alter table public.image_cleanup enable row level security;
revoke all on public.image_cleanup from public, anon, authenticated;
grant select, insert, update, delete on public.image_cleanup to authenticated;
drop policy if exists image_cleanup_admin on public.image_cleanup;
create policy image_cleanup_admin on public.image_cleanup for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create or replace function public.queue_image_cleanup()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- El consumidor debe comprobar referencias antes de borrar el objeto Storage.
  insert into public.image_cleanup(storage_path, product_id)
    values (old.storage_path, old.product_id) on conflict (storage_path) do nothing;
  return null;
end $$;
revoke all on function public.queue_image_cleanup() from public, anon, authenticated;
drop trigger if exists product_image_cleanup on public.product_images;
create trigger product_image_cleanup after delete on public.product_images
  for each row execute function public.queue_image_cleanup();
commit;
