-- Devoluciones / retracto (Ley 19.496).
--
-- Flujo: el cliente solicita la devolución de un pedido ENTREGADO (dentro de
-- 10 días). El admin aprueba → se reembolsa por el proveedor (RPC
-- finish_checkout_refund) → la prenda única vuelve a AVAILABLE para revenderse
-- → email order_refunded.
--
-- Aditiva e idempotente: no reescribe pedidos, pagos ni productos existentes.
begin;

-- 1) Solicitudes de devolución.
create table if not exists public.return_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  reason text not null,
  detail text,
  status text not null default 'requested'
    check (status in ('requested', 'approved', 'rejected', 'cancelled', 'completed')),
  resolution_note text,
  resolved_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists return_requests_order_idx on public.return_requests (order_id);
-- Una sola solicitud abierta por pedido.
create unique index if not exists return_requests_open_uidx
  on public.return_requests (order_id) where status in ('requested', 'approved');

alter table public.return_requests enable row level security;

drop policy if exists return_requests_owner_select on public.return_requests;
create policy return_requests_owner_select on public.return_requests
  for select using (user_id = auth.uid());

drop policy if exists return_requests_owner_cancel on public.return_requests;
create policy return_requests_owner_cancel on public.return_requests
  for update using (user_id = auth.uid() and status = 'requested')
  with check (user_id = auth.uid() and status = 'cancelled');

drop policy if exists return_requests_admin_all on public.return_requests;
create policy return_requests_admin_all on public.return_requests
  for all using (public.is_admin()) with check (public.is_admin());

-- 2) El cliente crea la solicitud (valida dueño, estado ENTREGADO y ventana de 10 días).
create or replace function public.request_return(p_order uuid, p_reason text, p_detail text default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare o public.orders%rowtype; delivered timestamptz; rid uuid;
begin
  if auth.uid() is null then raise exception 'FORBIDDEN'; end if;
  if p_reason is null or length(btrim(p_reason)) < 3 then raise exception 'REASON_REQUIRED'; end if;
  select * into o from public.orders where id = p_order;
  if not found or o.user_id is distinct from auth.uid() then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.status <> 'DELIVERED' then raise exception 'ORDER_NOT_DELIVERED'; end if;
  select max(created_at) into delivered from public.order_status_history
    where order_id = o.id and to_status = 'DELIVERED';
  if delivered is not null and delivered < now() - interval '10 days' then
    raise exception 'RETURN_WINDOW_CLOSED';
  end if;
  insert into public.return_requests (order_id, user_id, reason, detail)
  values (o.id, auth.uid(), btrim(p_reason), nullif(btrim(coalesce(p_detail, '')), ''))
  returning id into rid;
  return rid;
end $$;
revoke all on function public.request_return(uuid, text, text) from public, anon;
grant execute on function public.request_return(uuid, text, text) to authenticated;

-- 3) Devuelve la prenda al catálogo (stock y disponibilidad). Solo backend/admin.
create or replace function public.restore_order_products(p_order uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare it record;
begin
  if not (auth.role() = 'service_role' or public.is_admin()) then raise exception 'FORBIDDEN'; end if;
  for it in select product_id, qty from public.order_items where order_id = p_order and product_id is not null loop
    update public.products
       set stock = stock + it.qty,
           availability = case when availability in ('SOLD', 'RESERVED')
                               then 'AVAILABLE'::public.product_availability else availability end,
           updated_at = now()
     where id = it.product_id and availability <> 'ARCHIVED' and published_at is not null;
  end loop;
end $$;
revoke all on function public.restore_order_products(uuid) from public, anon, authenticated;
grant execute on function public.restore_order_products(uuid) to service_role;

-- 4) El reembolso también devuelve la prenda al catálogo (pedidos PAID/DELIVERED).
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
    perform public.restore_order_products(o.id);
    update public.orders set status='REFUNDED' where id=o.id;
  end if;
  update public.payments set status='refunded',refund_state='done',incident=null where id=p_payment;
end $$;
revoke all on function public.finish_checkout_refund(uuid) from public,anon,authenticated;
grant execute on function public.finish_checkout_refund(uuid) to service_role;

notify pgrst, 'reload schema';
commit;
