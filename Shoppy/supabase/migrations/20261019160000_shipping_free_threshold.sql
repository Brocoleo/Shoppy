-- Envío gratis por umbral, por tarifa (bucket de región/transportista).
-- Si el subtotal neto (tras descuento) alcanza free_from_clp, el despacho se
-- cotiza en 0 sin cambiar el precio base de la tarifa.
--
-- Aditiva: las tarifas existentes quedan con free_from_clp = null (sin umbral).
begin;

alter table public.shipping_rates
  add column if not exists free_from_clp integer
  check (free_from_clp is null or free_from_clp >= 0);

comment on column public.shipping_rates.free_from_clp is
  'Subtotal neto (tras descuento) desde el cual el envío es gratis. NULL = sin envío gratis.';

notify pgrst, 'reload schema';
commit;
