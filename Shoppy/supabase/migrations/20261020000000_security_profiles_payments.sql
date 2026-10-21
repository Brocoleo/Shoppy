-- ============================================================================
-- SHOPY · 20261020000000_security_profiles_payments
-- Cierra la escalada de privilegios en public.profiles (A-01) y quita la
-- escritura directa sobre public.payments y la liquidacion de pedidos a los
-- clientes y a los admins (A-05).
--
-- Estado verificado contra la BD remota (2026-10-20, ref evzlqwiipdjgtrqjlwba):
--
--   1) profiles: policy unica `profiles_owner_rw ... for all using (id =
--      auth.uid()) with check (id = auth.uid())`. FOR ALL cubre INSERT y
--      DELETE, y el WITH CHECK no valida `role`. El trigger `profiles_guard_role`
--      es BEFORE UPDATE, por lo que no cubre ni INSERT ni DELETE. Un cliente
--      podia borrar su perfil y reinsertarlo con role='admin' -> is_admin()=true
--      -> control del catalogo, de todos los pedidos y del bucket de imagenes.
--
--   2) profiles: NO existia policy de UPDATE para admins. El toggle "Hacer
--      admin" del panel (apps/admin/clientes) actualizaba 0 filas por RLS y la
--      UI no mostraba error: falso exito. El test T12b lo daba por bueno
--      porque un UPDATE que no afecta filas no lanza excepcion.
--
--   3) payments: policy `payments_admin_all ... for all using (is_admin())` mas
--      `grant select, insert, update, delete on all tables in schema public to
--      authenticated`. Un admin (o un admin auto-proclamado) podia poner
--      status='approved' a mano y el `confirm` liquidaba el pedido sin cobrar.
--
--   4) mark_order_paid conservaba EXECUTE para anon/authenticated (el guard
--      interno acepta is_admin()) -> liquidacion de pedidos sin pago verificado.
--
-- Idempotente: se puede re-aplicar sin efectos.
-- ============================================================================
begin;

-- ---------------------------------------------------------------------------
-- 1) profiles · policies explicitas por comando
-- ---------------------------------------------------------------------------
drop policy if exists profiles_owner_rw on public.profiles;

-- Lectura de la propia fila.
create policy profiles_owner_select on public.profiles
  for select using (id = auth.uid());

-- Edicion de la propia fila. El cambio de `role` lo bloquea el trigger
-- guard_profile_role (BEFORE UPDATE): un cliente no puede auto-asignarse admin.
create policy profiles_owner_update on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Alta del propio perfil: el rol solo puede ser 'customer'. Esto es lo que
-- cierra la escalada DELETE + INSERT: aunque se pueda borrar la fila, el
-- re-INSERT con role='admin' choca contra el WITH CHECK.
create policy profiles_owner_insert on public.profiles
  for insert with check (id = auth.uid() and role = 'customer');

-- Borrado del propio perfil. Se mantiene por el derecho de supresion de datos;
-- no abre escalada porque el INSERT posterior exige role='customer'.
create policy profiles_owner_delete on public.profiles
  for delete using (id = auth.uid());

-- El admin SI debe poder cambiar roles (toggle en apps/admin/clientes).
create policy profiles_admin_update on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2) payments · el estado del pago solo lo mueve el backend
--    (webhook firmado, verifyPayment, refund). Los admins solo lo leen.
-- ---------------------------------------------------------------------------
drop policy if exists payments_admin_all on public.payments;
create policy payments_admin_select on public.payments
  for select using (public.is_admin());

revoke insert, update, delete on public.payments from public, anon, authenticated;
grant select, insert, update, delete on public.payments to service_role;

-- ---------------------------------------------------------------------------
-- 3) Funciones de backend y de trigger · EXECUTE solo para service_role
--    mark_order_paid queda llamada desde settle_checkout_payment (SECURITY
--    DEFINER), que se ejecuta con el propietario de la funcion: el revoke no
--    afecta esa llamada, solo impide el acceso directo por RPC.
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname in ('mark_order_paid','record_order_history','guard_profile_role','guardar_prenda_unica')
  loop
    execute format('revoke execute on function public.%I(%s) from public, anon, authenticated', r.proname, r.args);
    execute format('grant  execute on function public.%I(%s) to service_role', r.proname, r.args);
  end loop;
end $$;

commit;
