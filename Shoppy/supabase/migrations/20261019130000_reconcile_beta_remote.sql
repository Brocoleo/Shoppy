-- Reconciliación de remoto (19-oct-2026).
--
-- Contexto: `20261017233000_checkout_sandbox_prerequisites.sql` re-aplicó de forma
-- idempotente el núcleo del checkout, pero declaró "email retry / refund / cart
-- image" *fuera de su alcance*. El remoto quedó sin:
--   · columnas de reintento en `order_notifications` (status/last_error/attempted_at)
--   · `claim_order_notification`  → los correos no pueden reclamarse (fallaban)
--   · `finish_checkout_refund`    → el reembolso del checkout fallaba
--   · `cart_merges` / `sync_my_cart` → carrito del app móvil (sin uso en web)
--
-- Efecto observado: la ficha de pedido del admin fallaba ("column status does not
-- exist"), el reintento de correos y el reembolso no funcionaban.
--
-- Este script restaura EXACTAMENTE lo previsto, de forma aditiva e idempotente.
-- No reescribe usuarios, productos, precios, pedidos ni pagos existentes.
begin;

-- 1) Reintento de correos transaccionales (idempotente por pedido+evento).
alter table public.order_notifications
  add column if not exists status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed')),
  add column if not exists last_error text,
  add column if not exists attempted_at timestamptz;

-- Alinea el histórico con lo realmente enviado (misma semántica que la migración original).
update public.order_notifications
   set status = case when provider_message_id is not null then 'sent' else 'failed' end;

create or replace function public.claim_order_notification(p_order uuid, p_event text, p_recipient text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare result uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'FORBIDDEN'; end if;
  insert into public.order_notifications(order_id,event,recipient,status,attempted_at)
  values(p_order,p_event,p_recipient,'sending',now())
  on conflict(order_id,event) do update set status='sending',last_error=null,attempted_at=now()
    where order_notifications.status in ('pending','failed') and order_notifications.created_at > now()-interval '23 hours'
  returning id into result;
  return result;
end $$;
revoke all on function public.claim_order_notification(uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_order_notification(uuid,text,text) to service_role;

-- 2) Cierre de reembolso (lo invoca supabase/functions/checkout al confirmar con el proveedor).
create or replace function public.finish_checkout_refund(p_payment uuid)
returns void language plpgsql security definer set search_path=public, pg_temp as $$
declare pay public.payments%rowtype; o public.orders%rowtype; r record;
begin
  if auth.role()<>'service_role' then raise exception 'FORBIDDEN'; end if;
  select * into pay from public.payments where id=p_payment;
  select * into o from public.orders where id=pay.order_id for update;
  if pay.refund_state='done' then return; end if;
  if o.status='PENDING_PAYMENT' then
    for r in select * from public.product_reservations where order_id=o.id and status='active' order by product_id for update loop
      update public.products set stock=stock+r.qty,availability=case when availability='RESERVED' then 'AVAILABLE'::public.product_availability else availability end where id=r.product_id;
      update public.product_reservations set status='expired' where id=r.id;
    end loop;
    update public.orders set status='CANCELLED' where id=o.id;
  elsif o.status in ('PAID','DELIVERED') then
    update public.orders set status='REFUNDED' where id=o.id;
  end if;
  update public.payments set status='refunded',refund_state='done',incident=null where id=p_payment;
end $$;
revoke all on function public.finish_checkout_refund(uuid) from public,anon,authenticated;
grant execute on function public.finish_checkout_refund(uuid) to service_role;

-- 3) Carrito del usuario (app móvil). La web actual no lo usa; se restaura por
--    paridad con las migraciones locales.
create table if not exists public.cart_merges (
  id uuid primary key,
  user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.cart_merges enable row level security;
revoke all on public.cart_merges from anon, authenticated;

create or replace function public.sync_my_cart(p_items jsonb default null, p_merge_id uuid default null, p_base jsonb default null)
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

notify pgrst, 'reload schema';
commit;
