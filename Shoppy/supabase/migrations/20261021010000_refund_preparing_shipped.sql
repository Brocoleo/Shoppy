-- ============================================================================
-- SHOPY · 20261021010000_refund_preparing_shipped
-- Permite reembolsar un pedido que ya está en PREPARING o SHIPPED.
--
-- El problema (A-12): la Edge Function reembolsa primero en el proveedor y
-- después actualiza la BD. Al ejecutar finish_checkout_refund sobre un pedido
-- en PREPARING o SHIPPED, la transición a REFUNDED no estaba permitida por
-- check_order_transition → el RPC fallaba con INVALID_ORDER_TRANSITION → el
-- catch marcaba refund_state='review'. Resultado: **el dinero ya estaba
-- devuelto en el proveedor pero la BD quedaba con el pedido pagado, la prenda
-- en SOLD y sin forma de reintentar** (la UI solo ofrece el botón cuando
-- refund_state está vacío).
--
-- Además, refund_state='review' o 'processing' bloqueaban el botón de
-- reintento del panel: un reembolso a medio ejecutar quedaba sin salida.
--
-- Idempotente: se puede re-aplicar sin efectos.
-- ============================================================================
begin;

-- ---------------------------------------------------------------------------
-- 1) Transiciones de estado: el reembolso es válido desde cualquier estado
--    en el que el pedido ya estaba pagado.
-- ---------------------------------------------------------------------------
create or replace function public.check_order_transition()
returns trigger language plpgsql as $$
begin
  if old.status = new.status then return new; end if;
  if (old.status, new.status) not in (
    ('PENDING_PAYMENT', 'PAID'), ('PENDING_PAYMENT', 'CANCELLED'),
    ('PAID', 'PREPARING'), ('PAID', 'CANCELLED'), ('PAID', 'REFUNDED'),
    ('PREPARING', 'SHIPPED'), ('PREPARING', 'CANCELLED'), ('PREPARING', 'REFUNDED'),
    ('SHIPPED', 'DELIVERED'), ('SHIPPED', 'REFUNDED'),
    ('DELIVERED', 'REFUNDED')
  ) then
    raise exception 'INVALID_ORDER_TRANSITION: % -> %', old.status, new.status;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 2) finish_checkout_refund: devuelve la prenda al catálogo también cuando el
--    pedido estaba en PREPARING o SHIPPED.
-- ---------------------------------------------------------------------------
create or replace function public.finish_checkout_refund(p_payment uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
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
  elsif o.status in ('PAID','PREPARING','SHIPPED','DELIVERED') then
    perform public.restore_order_products(o.id);
    update public.orders set status='REFUNDED' where id=o.id;
  end if;
  update public.payments set status='refunded',refund_state='done',incident=null where id=p_payment;
end $$;
revoke all on function public.finish_checkout_refund(uuid) from public, anon, authenticated;
grant execute on function public.finish_checkout_refund(uuid) to service_role;

commit;
