-- ============================================================================
-- SHOPY · 20261021000000_guard_order_cancel_live_payment
-- Impide cancelar un pedido que tiene un pago vivo.
--
-- Evidencia (reproducida con dos conexiones concurrentes, ver
-- supabase/tests/race_cancel_payment.sh):
--
--   CASO A · el cliente cancela y el backend liquida después
--     -> order=CANCELLED, payment=approved, producto de vuelta a AVAILABLE
--     -> el cliente PAGA y no recibe la prenda, que además queda libre para
--        otro comprador. Pérdida de dinero + sobreventa de la prenda única.
--
--   CASO B · el backend liquida y el cliente cancela después
--     -> order=PAID y el UPDATE del cliente afecta 0 filas SIN error
--     -> el cliente cree que canceló, pero fue cobrado.
--
-- Ninguna app usa la cancelación directa: el único camino sancionado es
-- close_checkout_attempt (Edge Function), que ya comprueba el pago y la
-- reserva. Este guard cierra el backdoor de la policy `orders_owner_cancel`
-- y protege también la cancelación manual del panel admin.
--
-- Se permiten las cancelaciones sin riesgo:
--   · el pedido no tiene pagos, o
--   · el pago está rechazado, o
--   · el pago sigue pendiente pero la reserva ya venció o se liberó
--     (en ese caso el pago tardío cae en REFUND_REQUIRED y lo resuelve el
--     reembolso automático del backend).
--
-- Idempotente: se puede re-aplicar sin efectos.
-- ============================================================================
begin;

create or replace function public.guard_order_cancel_live_payment()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- El backend (service_role) tiene sus propias comprobaciones
  -- (close_checkout_attempt, finish_checkout_refund) y necesita poder cancelar
  -- el pedido PENDING_PAYMENT de un pago tardío para devolver la prenda.
  if auth.role() = 'service_role' then return new; end if;
  if old.status = 'PENDING_PAYMENT' and new.status = 'CANCELLED' then
    -- El dinero ya está cobrado: hay que reembolsar, no cancelar.
    if exists (
      select 1 from public.payments p
      where p.order_id = new.id and p.status = 'approved'
    ) then
      raise exception 'PAYMENT_APPROVED: el pedido ya tiene un pago aprobado; reembolsa antes de cancelar';
    end if;
    -- El pago sigue en curso y la prenda está reservada: el pago podría
    -- liquidarse en cualquier momento y el cliente quedaría pagando sin
    -- contraparte.
    if exists (
      select 1 from public.payments p
      where p.order_id = new.id and p.status = 'pending'
    ) and exists (
      select 1 from public.product_reservations r
      where r.order_id = new.id and r.status = 'active' and r.expires_at > now()
    ) then
      raise exception 'PAYMENT_IN_FLIGHT: el pedido tiene un pago en curso; no se puede cancelar';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists orders_guard_cancel_payment on public.orders;
create trigger orders_guard_cancel_payment
before update of status on public.orders
for each row execute function public.guard_order_cancel_live_payment();

revoke execute on function public.guard_order_cancel_live_payment() from public, anon, authenticated;
grant  execute on function public.guard_order_cancel_live_payment() to service_role;

commit;
