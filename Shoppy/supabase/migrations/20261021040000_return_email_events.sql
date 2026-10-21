-- ============================================================================
-- SHOPY · 20261021040000_return_email_events
-- Habilita los correos de devolución: return_requested y return_rejected.
--
-- Motivo (A-13): la ficha del pedido promete al cliente "Solicitud enviada.
-- Revisaremos tu caso y te escribiremos por correo" y "La solicitud fue
-- rechazada. Te contactamos con el detalle", pero el catálogo de eventos de
-- order_notifications solo admitía los 7 eventos del ciclo de vida del pedido:
-- no existía forma de enviar esos correos.
--
-- Idempotente: se puede re-aplicar sin efectos.
-- ============================================================================
begin;

alter table public.order_notifications
  drop constraint if exists order_notifications_event_check;

alter table public.order_notifications
  add constraint order_notifications_event_check
  check (event in (
    'order_created', 'payment_confirmed', 'order_preparing',
    'order_shipped', 'order_delivered', 'order_cancelled', 'order_refunded',
    'return_requested', 'return_rejected'
  ));

commit;
