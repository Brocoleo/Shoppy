#!/bin/bash
# ============================================================================
# Reproduce la carrera entre la cancelación del pedido y la liquidación del
# pago (A-03), con DOS conexiones concurrentes sobre Postgres 16.
#
# Uso:
#   docker run -d --name shopy-pg-race -e POSTGRES_PASSWORD=postgres \
#     -e POSTGRES_DB=shopy -p 5436:5432 postgres:16
#   for f in supabase/tests/setup_local.sql supabase/migrations/*.sql; do
#     docker exec -i shopy-pg-race psql -U postgres -d shopy -v ON_ERROR_STOP=1 -f - < "$f"
#   done
#   supabase/tests/race_cancel_payment.sh shopy-pg-race
#
# CASO A · el cliente cancela y el backend liquida después
#   Sin el guard (20261021000000) el resultado era:
#     order=CANCELLED, payment=approved, producto AVAILABLE
#     → el cliente pagaba sin recibir y la prenda volvía al catálogo.
#   Con el guard, la cancelación se rechaza (PAYMENT_IN_FLIGHT) y el pedido
#   queda PAID con la prenda reservada para quien pagó.
#
# CASO B · el backend liquida y el cliente cancela después
#   El UPDATE del cliente afecta 0 filas (el USING ya no aplica): no hay doble
#   venta, pero el cliente no obtiene error. Ninguna app usa esa cancelación
#   directa: el camino sancionado es close_checkout_attempt (Edge Function).
#
# Nota: el fixture no crea order_items, por eso el producto queda con
# stock=0 y availability=AVAILABLE (mark_order_paid marca SOLD a partir de
# order_items, que el flujo real siempre crea).
# ============================================================================
set -u
cd "$(dirname "$0")/../.."
C="${1:-shopy-pg-race}"
P="psql -U postgres -d shopy -v ON_ERROR_STOP=1 -t -A"
UID2="22222222-2222-4222-8222-222222222222"

mk() { echo "a${1}000000-0000-4000-8000-000000000001 a${1}000000-0000-4000-8000-0000000000c1 a${1}000000-0000-4000-8000-0000000000a1"; }

setup() {
  read -r ORDER PAY PROD <<< "$(mk "$1")"
  docker exec -i "$C" $P >/dev/null <<SQL
insert into auth.users (id, email) values ('$UID2','race@shopy.cl') on conflict do nothing;
insert into public.orders (id, user_id, status, subtotal_clp, total_clp, shipping_address)
values ('$ORDER','$UID2','PENDING_PAYMENT',10000,10000,'{"fullName":"Race"}');
insert into public.products (id, slug, name, price_clp, stock, published_at)
values ('$PROD','race-prenda-$1','Prenda Race',10000,0,now());
insert into public.product_reservations (product_id, order_id, qty, status, expires_at)
values ('$PROD','$ORDER',1,'active', now() + interval '15 minutes');
insert into public.payments (id, order_id, provider, amount_clp, status)
values ('$PAY','$ORDER','mock',10000,'pending');
SQL
}

state() {
  read -r ORDER PAY PROD <<< "$(mk "$1")"
  docker exec -i "$C" $P <<SQL
select '  order    = ' || status from public.orders where id='$ORDER';
select '  payment  = ' || status || ' / incident=' || coalesce(incident,'-') from public.payments where id='$PAY';
select '  producto = stock=' || stock || ' / ' || availability from public.products where id='$PROD';
select '  reserva  = ' || status from public.product_reservations where order_id='$ORDER';
SQL
}

echo "############ CASO A: el cliente cancela PRIMERO, el webhook llega después ############"
setup a
read -r ORDER PAY PROD <<< "$(mk a)"
docker exec -i "$C" $P > /tmp/opencode/race-A.log 2>&1 <<SQL &
set role authenticated;
set app.uid = '$UID2';
begin;
update public.orders set status='CANCELLED' where id='$ORDER';
select pg_sleep(4);
commit;
SQL
sleep 2
docker exec -i "$C" $P > /tmp/opencode/race-B.log 2>&1 <<SQL
set app.role = 'service_role';
select 'settle -> ' || public.settle_checkout_payment('$PAY');
SQL
wait
echo "  cliente : $(cat /tmp/opencode/race-A.log | tr '\n' ' ' | tail -c 110)"
echo "  backend : $(cat /tmp/opencode/race-B.log | tr '\n' ' ' | tail -c 110)"
state a

echo
echo "############ CASO B: el backend liquida PRIMERO, el cliente cancela después ############"
setup b
read -r ORDER PAY PROD <<< "$(mk b)"
docker exec -i "$C" $P > /tmp/opencode/race-B2.log 2>&1 <<SQL
set app.role = 'service_role';
select 'settle -> ' || public.settle_checkout_payment('$PAY');
SQL
echo "  backend : $(cat /tmp/opencode/race-B2.log | tr '\n' ' ' | tail -c 110)"
docker exec -i "$C" $P > /tmp/opencode/race-A2.log 2>&1 <<SQL
set role authenticated;
set app.uid = '$UID2';
update public.orders set status='CANCELLED' where id='$ORDER';
SQL
echo "  cliente : $(cat /tmp/opencode/race-A2.log | tr '\n' ' ' | tail -c 110)"
state b
