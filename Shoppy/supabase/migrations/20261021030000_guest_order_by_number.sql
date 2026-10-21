-- ============================================================================
-- SHOPY · 20261021030000_guest_order_by_number
-- Permite rastrear un pedido de invitado por su número visible (SHO-XXXX),
-- además del UUID interno.
--
-- Motivo (A-04): el invitado solo conocía el número de pedido (es lo que ve en
-- la pantalla de éxito y en el correo) y el código de rastreo. El formulario de
-- tracking exigía el UUID, que no se le mostraba ni se le enviaba, así que
-- tras cerrar la app no podía volver a su pedido.
--
-- Igual que get_guest_order: exige el token, no expone el guest_token y no
-- devuelve nada si el token está caducado.
--
-- Idempotente: se puede re-aplicar sin efectos.
-- ============================================================================
begin;

create or replace function public.get_guest_order_by_number(p_order_number text, p_token text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare target uuid; result jsonb;
begin
  if p_order_number is null or p_order_number = '' or p_token is null or p_token = '' then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  select id into target
  from public.orders o
  where o.order_number = p_order_number
    and o.user_id is null
    and o.guest_token = p_token
    and (o.guest_token_expires_at is null or o.guest_token_expires_at > now());

  if target is null then raise exception 'ORDER_NOT_FOUND'; end if;
  result := public.get_guest_order(target, p_token);
  if result is null then raise exception 'ORDER_NOT_FOUND'; end if;
  return result;
end $$;

notify pgrst, 'reload schema';
commit;
