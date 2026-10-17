-- Se ejecuta después de rls_tests.sql. Todo dato de prueba se revierte.
begin;
reset role;
set app.role='service_role';
set app.uid='';

do $$ declare k uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); rate uuid; o jsonb; pay uuid; result text;
begin
  insert into public.products(id,slug,name,price_clp,stock,published_at) values(p,'beta-test-product','Beta test',1000,1,now());
  select id into rate from public.shipping_rates limit 1;
  insert into public.checkout_attempts(id,secret_hash,request_hash) values(k,'secret','request');
  o:=public.create_checkout_order(k,null,'guest',jsonb_build_object('address','{}'::jsonb,'shipping_rate_id',rate,'items',jsonb_build_array(jsonb_build_object('product_id',p,'qty',1))),
    jsonb_build_object('subtotal_clp',1000,'discount_clp',0,'shipping_clp',0,'total_clp',1000,'lines',jsonb_build_array(jsonb_build_object('product_id',p,'product_slug','beta-test-product','product_name','Beta test','condition','bueno','unit_price_clp',1000,'qty',1))));
  if (select stock from public.products where id=p)<>0 then raise exception 'stock no reservado'; end if;
  begin
    perform public.create_checkout_order(k,null,'guest','{}','{}');
    raise exception 'se permitió duplicar intento';
  exception when others then
    if sqlerrm not like '%ATTEMPT_NOT_AVAILABLE%' then raise; end if;
  end;
  insert into public.payments(order_id,provider,amount_clp) values((o->>'id')::uuid,'mock',1000) returning id into pay;
  result:=public.settle_checkout_payment(pay);
  if result<>'PAID' or public.settle_checkout_payment(pay)<>'PAID' then raise exception 'confirmación no idempotente'; end if;
  if (select count(*) from public.order_status_history where order_id=(o->>'id')::uuid and to_status='PAID')<>1 then raise exception 'historial duplicado'; end if;
  if public.claim_order_notification((o->>'id')::uuid,'payment_confirmed','test@example.test') is null then raise exception 'correo no reservado'; end if;
  if public.claim_order_notification((o->>'id')::uuid,'payment_confirmed','test@example.test') is not null then raise exception 'correo concurrente'; end if;
  update public.order_notifications set status='failed' where order_id=(o->>'id')::uuid;
  if public.claim_order_notification((o->>'id')::uuid,'payment_confirmed','test@example.test') is null then raise exception 'correo no reintentable'; end if;
  update public.order_notifications set status='sent' where order_id=(o->>'id')::uuid;
  if public.claim_order_notification((o->>'id')::uuid,'payment_confirmed','test@example.test') is not null then raise exception 'correo enviado repetido'; end if;
end $$;

do $$ declare o uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); pay uuid;
begin
  insert into public.products(id,slug,name,price_clp,stock,published_at) values(p,'beta-expired-product','Beta expired',1000,1,now());
  insert into public.orders(id,status,subtotal_clp,total_clp,shipping_address,guest_token) values(o,'PENDING_PAYMENT',1000,1000,'{}','beta-guest');
  perform public.reserve_products(o,jsonb_build_array(jsonb_build_object('product_id',p,'qty',1)));
  update public.product_reservations set expires_at=now()-interval '1 minute' where order_id=o;
  perform public.release_expired_reservations();
  insert into public.payments(order_id,provider,amount_clp) values(o,'mock',1000) returning id into pay;
  if public.settle_checkout_payment(pay)<>'REFUND_REQUIRED' then raise exception 'pago tardío no detectado'; end if;
  if (select status from public.orders where id=o)<>'PENDING_PAYMENT' then raise exception 'pago tardío entregó inventario'; end if;
  update public.payments set refund_state='processing' where id=pay;
  perform public.finish_checkout_refund(pay);
  perform public.finish_checkout_refund(pay);
  if (select stock from public.products where id=p)<>1 then raise exception 'stock duplicado al reembolsar'; end if;
  if (select status from public.payments where id=pay)<>'refunded' then raise exception 'reembolso no registrado'; end if;
end $$;

set app.role='authenticated';
set app.uid='11111111-1111-4111-8111-111111111111';
set role authenticated;
do $$ declare p uuid; m uuid:=gen_random_uuid(); result jsonb;
begin
  select id into p from public.products where availability='AVAILABLE' and published_at is not null limit 1;
  perform public.sync_my_cart('[]',null);
  result:=public.sync_my_cart(jsonb_build_array(jsonb_build_object('productId',p,'qty',2)),m);
  result:=public.sync_my_cart(jsonb_build_array(jsonb_build_object('productId',p,'qty',2)),m);
  if (result->0->>'qty')::int<>2 then raise exception 'fusión repetida duplicó cantidades'; end if;
  begin
    perform public.sync_my_cart(jsonb_build_array(jsonb_build_object('productId',p,'qty',0)),null);
    raise exception 'aceptó cantidad inválida';
  exception when others then if sqlerrm not like '%INVALID_QTY%' then raise; end if; end;
  if (public.sync_my_cart(null,null)->0->>'qty')::int<>2 then raise exception 'escritura inválida borró carrito'; end if;
  begin
    perform public.admin_set_product_cover(p,gen_random_uuid());
    raise exception 'cliente cambió portada';
  exception when others then if sqlerrm not like '%FORBIDDEN%' then raise; end if; end;
end $$;
set app.uid='22222222-2222-4222-8222-222222222222';
do $$ begin
  if public.sync_my_cart(null,null)<>'[]'::jsonb then raise exception 'carrito filtrado entre cuentas'; end if;
end $$;
reset role;
set app.uid='33333333-3333-4333-8333-333333333333';
set role authenticated;
do $$ declare p uuid; a uuid; b uuid;
begin
  select product_id,id into p,a from public.product_images order by product_id,sort_order limit 1;
  select id into b from public.product_images where product_id=p and id<>a limit 1;
  perform public.admin_set_product_cover(p,b);
  if (select count(*) from public.product_images where product_id=p and is_cover)<>1 then raise exception 'portada no única'; end if;
  perform public.admin_swap_product_images(p,a,b);
  delete from public.product_images where id=b;
  if not exists(select 1 from public.product_images where product_id=p and is_cover) then raise exception 'sin portada tras borrar'; end if;
  if not exists(select 1 from public.image_cleanup where product_id=p) then raise exception 'sin limpieza durable'; end if;
end $$;
reset role;
rollback;
