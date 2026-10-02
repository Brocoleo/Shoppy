-- ============================================================================
-- SHOPY · 20260929000000_storage
-- Bucket público product-images + policies (los paths los define el seed).
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

drop policy if exists "public read product-images" on storage.objects;
create policy "public read product-images"
  on storage.objects for select
  using (bucket_id = 'product-images');

-- Escritura vía service_role (bypass RLS); clientes suben vía backend (Fase 7).
drop policy if exists "service write product-images" on storage.objects;
create policy "service write product-images"
  on storage.objects for all
  using (bucket_id = 'product-images')
  with check (bucket_id = 'product-images');
