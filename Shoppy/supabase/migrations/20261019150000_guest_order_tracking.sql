-- Seguimiento de invitado: además del pedido y sus prendas, devolver el
-- despacho (carrier / número / URL de rastreo). Requisito de la Fase 4 para
-- que un invitado pueda seguir su envío sin iniciar sesión.
--
-- Aditiva: reemplaza get_guest_order manteniendo el contrato previo (id,
-- order_number, status, total_clp, items) y sin exponer guest_token.
begin;

create or replace function public.get_guest_order(p_order_id uuid, p_token text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare result jsonb;
begin
  if p_token is null or p_token = '' then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  select (to_jsonb(o) - 'guest_token') || jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(to_jsonb(i) order by i.product_name)
      from public.order_items i where i.order_id = o.id
    ), '[]'::jsonb),
    'shipment', coalesce((
      select jsonb_build_object(
        'carrier', s.carrier,
        'tracking_number', s.tracking_number,
        'tracking_url', s.tracking_url
      )
      from public.shipments s where s.order_id = o.id
    ), 'null'::jsonb)
  )
  into result
  from public.orders o
  where o.id = p_order_id and o.user_id is null and o.guest_token = p_token;

  if result is null then raise exception 'ORDER_NOT_FOUND'; end if;
  return result;
end $$;

notify pgrst, 'reload schema';
commit;
