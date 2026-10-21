-- ============================================================================
-- SHOPY · 20261021020000_payment_tx_id_guest_token_expiry
--
-- 1) A-11 · Identidad del cobro en el proveedor
--    payments.provider_payment_id guarda el id de la PREFERENCIA (mp_pref_…),
--    no el de la operación cobrada. Ese id real solo vivía en
--    raw_payload (jsonb, sin índice) y se SOBRESCRIBÍA en cada webhook, con lo
--    que un segundo cobro del mismo pedido pasaba desapercibido. Aquí se
--    registra en una columna propia y única: dos pagos no pueden reclamar la
--    misma operación del proveedor.
--
-- 2) A-16 · El token de invitado caduca y se puede revocar
--    orders.guest_token no tenía caducidad: si se filtraba (query string,
--    historial, logs, Referer) el pedido quedaba accesible de forma
--    indefinida, incluso tras el reembolso. Ahora caduca a los 180 días
--    (de sobra para el retracto de 10 días y las devoluciones) y existe un
--    RPC para revocarlo.
--
-- Idempotente: se puede re-aplicar sin efectos.
-- ============================================================================
begin;

-- ---------------------------------------------------------------------------
-- 1) Identidad del cobro
-- ---------------------------------------------------------------------------
alter table public.payments add column if not exists provider_tx_id text;

create unique index if not exists payments_provider_tx_id_uidx
  on public.payments (provider_tx_id)
  where provider_tx_id is not null;

-- ---------------------------------------------------------------------------
-- 2) Caducidad y revocación del token de invitado
-- ---------------------------------------------------------------------------
alter table public.orders add column if not exists guest_token_expires_at timestamptz;

update public.orders
   set guest_token_expires_at = created_at + interval '180 days'
 where guest_token is not null and guest_token_expires_at is null;

alter table public.orders
  alter column guest_token_expires_at set default (now() + interval '180 days');

-- El tracking por token exige que el token siga vigente.
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
  where o.id = p_order_id
    and o.user_id is null
    and o.guest_token = p_token
    and (o.guest_token_expires_at is null or o.guest_token_expires_at > now());

  if result is null then raise exception 'ORDER_NOT_FOUND'; end if;
  return result;
end $$;

-- Revocación: el backend o un admin invalidan el token (p. ej. ante una
-- sospecha de abuso). El token se mantiene hasta la entrega y las
-- devoluciones (10 días en Chile) salvo revocación explícita.
create or replace function public.revoke_guest_token(p_order uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.role() <> 'service_role' and not public.is_admin() then
    raise exception 'FORBIDDEN: solo backend o admin';
  end if;
  update public.orders
     set guest_token = null, guest_token_expires_at = null
   where id = p_order and user_id is null;
end $$;
revoke all on function public.revoke_guest_token(uuid) from public, anon, authenticated;
grant execute on function public.revoke_guest_token(uuid) to service_role;

commit;
