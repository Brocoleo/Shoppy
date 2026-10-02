-- ============================================================================
-- SHOPY · 20260929000003_notifications_log
-- Registro de notificaciones por pedido+evento (idempotencia + auditoría).
-- ============================================================================

create table public.order_notifications (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  event text not null check (event in (
    'order_created', 'payment_confirmed', 'order_preparing',
    'order_shipped', 'order_delivered', 'order_cancelled', 'order_refunded'
  )),
  channel text not null default 'email',
  recipient text not null,
  provider_message_id text,
  created_at timestamptz not null default now(),
  unique (order_id, event)
);
create index order_notifications_order_idx on public.order_notifications (order_id);

alter table public.order_notifications enable row level security;
create policy order_notifications_admin_all on public.order_notifications
  for all using (public.is_admin()) with check (public.is_admin());
create policy order_notifications_owner_select on public.order_notifications
  for select using (exists (select 1 from public.orders o
    where o.id = order_id and o.user_id = auth.uid()));
