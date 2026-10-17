-- Intentos privados: el UUID público no autoriza recuperar un pedido invitado.
create table public.checkout_attempts (
  id uuid primary key,
  user_id uuid references auth.users(id),
  secret_hash text not null,
  request_hash text not null,
  order_id uuid references public.orders(id),
  response jsonb,
  state text not null default 'processing' check (state in ('processing','ready','failed','review')),
  error_code text,
  created_at timestamptz not null default now()
);
alter table public.checkout_attempts enable row level security;
revoke all on public.checkout_attempts from anon, authenticated;
grant all on public.checkout_attempts to service_role;
create policy checkout_attempts_admin_read on public.checkout_attempts for select to authenticated using(public.is_admin());
grant select(id,state,error_code,order_id,created_at) on public.checkout_attempts to authenticated;

alter table public.payments add column checkout_url text;
alter table public.payments add column return_token uuid not null default gen_random_uuid();
alter table public.payments add column incident text;
alter table public.payments add column refund_state text check (refund_state in ('processing','done','review'));
create unique index payments_return_token_idx on public.payments(return_token);

-- Pedido, cupón y reservas se crean juntos o se revierten juntos.
create function public.create_checkout_order(p_attempt uuid, p_user uuid, p_guest_token text, p_input jsonb, p_quote jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare o public.orders%rowtype; line jsonb;
begin
  if auth.role() <> 'service_role' then raise exception 'FORBIDDEN'; end if;
  perform 1 from public.checkout_attempts where id=p_attempt and order_id is null and state='processing' for update;
  if not found then raise exception 'ATTEMPT_NOT_AVAILABLE'; end if;
  insert into public.orders(user_id,guest_token,status,subtotal_clp,discount_clp,shipping_clp,total_clp,shipping_address,discount_code,shipping_rate_id)
  values(p_user,p_guest_token,'PENDING_PAYMENT',(p_quote->>'subtotal_clp')::int,(p_quote->>'discount_clp')::int,
    (p_quote->>'shipping_clp')::int,(p_quote->>'total_clp')::int,p_input->'address',nullif(trim(p_input->>'discount_code'),''),(p_input->>'shipping_rate_id')::uuid)
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
revoke all on function public.create_checkout_order(uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.create_checkout_order(uuid,uuid,text,jsonb,jsonb) to service_role;

-- El cron y la confirmación bloquean primero el pedido y luego las reservas.
create or replace function public.release_expired_reservations()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare o record; r record; n integer := 0;
begin
  for o in select ord.id from public.orders ord where exists(select 1 from public.product_reservations where order_id=ord.id and status='active' and expires_at<now()) order by id for update skip locked loop
    for r in select * from public.product_reservations where order_id=o.id and status='active' and expires_at < now() order by product_id for update loop
      update public.products set stock=stock+r.qty,availability=case when availability='RESERVED' then 'AVAILABLE'::public.product_availability else availability end where id=r.product_id;
      update public.product_reservations set status='expired' where id=r.id;
      n:=n+1;
    end loop;
  end loop;
  return n;
end $$;

create function public.settle_checkout_payment(p_payment uuid)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare pay public.payments%rowtype; o public.orders%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'FORBIDDEN'; end if;
  select * into pay from public.payments where id=p_payment;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  select * into o from public.orders where id=pay.order_id for update;
  select * into pay from public.payments where id=p_payment for update;
  if pay.refund_state in ('processing','review') then return 'REFUND_REQUIRED'; end if;
  if o.status in ('PAID','PREPARING','SHIPPED','DELIVERED') then return 'PAID'; end if;
  if o.status='REFUNDED' or pay.status='refunded' then return 'REFUNDED'; end if;
  perform 1 from public.product_reservations where order_id=o.id order by product_id for update;
  if o.status <> 'PENDING_PAYMENT' or not exists(select 1 from public.product_reservations where order_id=o.id)
     or exists(select 1 from public.product_reservations where order_id=o.id and (status<>'active' or expires_at<now())) then
    update public.payments set status='approved',incident='RESERVATION_EXPIRED: pago aprobado; requiere reembolso' where id=p_payment;
    return 'REFUND_REQUIRED';
  end if;
  perform public.mark_order_paid(o.id);
  update public.payments set status='approved',incident=null where id=p_payment;
  return 'PAID';
end $$;
revoke all on function public.settle_checkout_payment(uuid) from public,anon,authenticated;
grant execute on function public.settle_checkout_payment(uuid) to service_role;

-- Un correo fallido se puede reintentar sin perder su registro.
alter table public.order_notifications add column status text not null default 'pending' check(status in ('pending','sending','sent','failed'));
alter table public.order_notifications add column last_error text;
alter table public.order_notifications add column attempted_at timestamptz;
update public.order_notifications set status=case when provider_message_id is not null then 'sent' else 'failed' end;
create function public.claim_order_notification(p_order uuid,p_event text,p_recipient text)
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

create function public.finish_checkout_refund(p_payment uuid)
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

create function public.release_cancelled_order() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare r record;
begin
  if old.status='PENDING_PAYMENT' and new.status='CANCELLED' then
    for r in select * from public.product_reservations where order_id=new.id and status='active' order by product_id for update loop
      update public.products set stock=stock+r.qty,availability=case when availability='RESERVED' then 'AVAILABLE'::public.product_availability else availability end where id=r.product_id;
      update public.product_reservations set status='released' where id=r.id;
    end loop;
  end if;
  return null;
end $$;
revoke all on function public.release_cancelled_order() from public,anon,authenticated;
create trigger orders_release_cancelled after update of status on public.orders for each row execute function public.release_cancelled_order();

create function public.close_checkout_attempt(p_order uuid) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.orders%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'FORBIDDEN'; end if;
  select * into o from public.orders where id=p_order for update;
  if o.status in ('CANCELLED','REFUNDED') then return true; end if;
  if o.status<>'PENDING_PAYMENT' then return false; end if;
  if exists(select 1 from public.payments where order_id=p_order and status='approved') then return false; end if;
  if exists(select 1 from public.payments where order_id=p_order and status='rejected')
    or not exists(select 1 from public.product_reservations where order_id=p_order and status='active' and expires_at>now()) then
    update public.orders set status='CANCELLED' where id=p_order;
    return true;
  end if;
  return false;
end $$;
revoke all on function public.close_checkout_attempt(uuid) from public,anon,authenticated;
grant execute on function public.close_checkout_attempt(uuid) to service_role;
