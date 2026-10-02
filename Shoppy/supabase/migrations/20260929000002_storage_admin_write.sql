-- ============================================================================
-- SHOPY · 20260929000002_storage_admin_write
-- Solo admin (o service_role) puede escribir en product-images.
-- La lectura pública sigue abierta (ver 20260929000000_storage).
-- ============================================================================

drop policy if exists "service write product-images" on storage.objects;
create policy "admin write product-images"
  on storage.objects for all
  using (bucket_id = 'product-images' and public.is_admin())
  with check (bucket_id = 'product-images' and public.is_admin());
