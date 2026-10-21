-- ============================================================================
-- SHOPY · 20261021050000_purge_orphan_images
-- Purga automática de las imágenes huérfanas del bucket product-images.
--
-- Motivo (A-25): el trigger queue_image_cleanup encola en public.image_cleanup
-- cada imagen borrada de product_images, pero el ÚNICO consumidor era el panel
-- admin (al abrir un producto). Sin pasar por el panel, los objetos seguían en
-- el bucket: costo de storage y archivos públicos que nadie reclama.
--
-- La purga comprueba que la imagen ya no esté referenciada en product_images
-- antes de borrar el objeto (mismo criterio que usaba el panel).
--
-- Idempotente: se puede re-aplicar sin efectos.
-- ============================================================================
begin;

create or replace function public.purge_orphan_images()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; n integer := 0;
begin
  for r in
    select c.storage_path
    from public.image_cleanup c
    where not exists (
      select 1 from public.product_images i where i.storage_path = c.storage_path
    )
    order by c.storage_path
  loop
    delete from storage.objects
     where bucket_id = 'product-images' and name = r.storage_path;
    delete from public.image_cleanup where storage_path = r.storage_path;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.purge_orphan_images() from public, anon, authenticated;
grant execute on function public.purge_orphan_images() to service_role;

-- El harvest es horario (a los 17 minutos pasteles) para no competir con la
-- liberación de reservas, que corre cada minuto.
do $body$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule(
      'shopy-purge-orphan-images',
      '17 * * * *',
      $$select public.purge_orphan_images();$$
    );
  else
    raise notice 'pg_cron no disponible: schedule omitido.';
  end if;
end
$body$;

commit;
