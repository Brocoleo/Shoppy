-- Registro de boleta/factura electrónica (DTE) por pedido.
--
-- Estrategia $0 para el piloto: la boleta (o factura) se emite en el
-- **Portal MiPyme del SII** (sistema gratuito y oficial) y aquí se registra
-- su folio + PDF para trazabilidad, reenvío al cliente y respaldo contable.
--
-- Deja preparada la columna `dte_provider` como "seam": si más adelante se
-- automatiza la emisión (LibreDTE self-hosted u otra API), basta con cambiar
-- el valor; no hay que migrar el modelo.
--
-- Aditiva e idempotente: no reescribe pedidos, precios ni pagos existentes.
begin;

alter table public.orders
  add column if not exists dte_kind text
    check (dte_kind in ('boleta', 'factura', 'exenta')),
  add column if not exists dte_folio text,
  add column if not exists dte_pdf_url text,
  add column if not exists dte_status text not null default 'pending'
    check (dte_status in ('pending', 'issued', 'accepted', 'rejected', 'annulled')),
  add column if not exists dte_provider text not null default 'manual',
  add column if not exists dte_issued_at timestamptz;

comment on column public.orders.dte_status is
  'pending = sin emitir; issued = registrada (emitida en el Portal MiPyme del SII); accepted/rejected = respuesta del SII si se automatiza.';
comment on column public.orders.dte_provider is
  'manual = registrada a mano; libre_dte/base_api = emisión automatizada a futuro.';

commit;
