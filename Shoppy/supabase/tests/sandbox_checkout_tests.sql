-- Disposable PostgreSQL only. All fixtures roll back. Never run against remote data.
begin;
reset role;
set app.role='service_role';
set app.uid='';

do $$ begin
  if has_table_privilege('authenticated','public.order_items','INSERT') then
    raise exception 'authenticated can insert order lines';
  end if;
  -- La firma vigente de create_checkout_order tiene 6 args (p_mode) desde
  -- 20261018120000; la de 5 args ya no existe y has_function_privilege
  -- lanzaría "function does not exist" contra el esquema real.
  if has_function_privilege('anon','public.create_checkout_order(uuid,uuid,text,jsonb,jsonb,text)','EXECUTE')
     or has_function_privilege('authenticated','public.settle_checkout_payment(uuid)','EXECUTE') then
    raise exception 'backend RPC exposed';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.checkout_attempts'::regclass) then
    raise exception 'attempt RLS absent';
  end if;
  raise notice 'PASS sandbox permissions';
end $$;

do $$ declare p uuid:=gen_random_uuid(); k uuid:=gen_random_uuid(); rate uuid; o jsonb; pay uuid;
  quote jsonb; data jsonb; failed boolean:=false;
begin
  insert into public.products(id,slug,name,price_clp,stock,published_at)
    values(p,'sandbox-local-'||p,'LOCAL TEST ONLY',1000,1,now());
  select id into rate from public.shipping_rates where is_active limit 1;
  insert into public.checkout_attempts(id,secret_hash,request_hash) values(k,'local-secret-hash','local-request');
  data:=jsonb_build_object('address',jsonb_build_object('region','Ñuble','comuna','Chillán','street','5 de Abril 1234'),
    'shipping_rate_id',rate,'items',jsonb_build_array(jsonb_build_object('product_id',p,'qty',1)));
  quote:=jsonb_build_object('subtotal_clp',1000,'discount_clp',0,'shipping_clp',0,'total_clp',1000,
    'lines',jsonb_build_array(jsonb_build_object('product_id',p,'product_slug','sandbox-local-'||p,
    'product_name','LOCAL TEST ONLY','condition','bueno','unit_price_clp',1000,'qty',1)));
  o:=public.create_checkout_order(k,null,'local-guest',data,quote);
  if (select stock from public.products where id=p)<>0 then raise exception 'stock not reserved'; end if;
  if (select shipping_address->>'region' from public.orders where id=(o->>'id')::uuid)<>'Ñuble' then
    raise exception 'official address changed';
  end if;
  begin
    perform public.create_checkout_order(k,null,'local-guest',data,quote);
  exception when others then
    if sqlerrm='ATTEMPT_NOT_AVAILABLE' then failed:=true; else raise; end if;
  end;
  if not failed then raise exception 'attempt duplicated'; end if;
  insert into public.payments(order_id,provider,amount_clp) values((o->>'id')::uuid,'mercadopago',1000) returning id into pay;
  if public.settle_checkout_payment(pay)<>'PAID' or public.settle_checkout_payment(pay)<>'PAID' then
    raise exception 'settlement not convergent';
  end if;
  if (select stock from public.products where id=p)<>0 then raise exception 'stock discounted twice'; end if;
  if (select count(*) from public.order_status_history where order_id=(o->>'id')::uuid and to_status='PAID')<>1 then
    raise exception 'paid history duplicated';
  end if;
  raise notice 'PASS sandbox reservation, duplicate attempt, address, settlement and one stock deduction';
end $$;

do $$ declare p uuid:=gen_random_uuid(); k uuid:=gen_random_uuid(); rate uuid; before_count bigint; failed boolean:=false;
begin
  insert into public.products(id,slug,name,price_clp,stock,published_at)
    values(p,'sandbox-no-stock-'||p,'LOCAL TEST ONLY',1000,0,now());
  select id into rate from public.shipping_rates where is_active limit 1;
  insert into public.checkout_attempts(id,secret_hash,request_hash) values(k,'local','local');
  select count(*) into before_count from public.orders;
  begin
    perform public.create_checkout_order(k,null,'local',jsonb_build_object('address','{}'::jsonb,'shipping_rate_id',rate,
      'items',jsonb_build_array(jsonb_build_object('product_id',p,'qty',1))),
      jsonb_build_object('subtotal_clp',1000,'discount_clp',0,'shipping_clp',0,'total_clp',1000,
        'lines',jsonb_build_array(jsonb_build_object('product_id',p,'product_slug','local','product_name','LOCAL',
          'condition','bueno','unit_price_clp',1000,'qty',1))));
  exception when others then
    if sqlerrm like 'INSUFFICIENT_STOCK:%' then failed:=true; else raise; end if;
  end;
  if not failed or (select count(*) from public.orders)<>before_count then raise exception 'failed reservation did not roll back order'; end if;
  if (select order_id from public.checkout_attempts where id=k) is not null then raise exception 'failed attempt linked order'; end if;
  raise notice 'PASS sandbox transaction rollback on unavailable stock';
end $$;

rollback;
