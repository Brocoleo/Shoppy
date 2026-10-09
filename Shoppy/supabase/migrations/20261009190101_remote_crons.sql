-- Crons del proyecto remoto (ver docs/DATABASE.md "Cron sugerido").
--  release_expired_reservations: cada minuto.
--  refresh_trending_scores:     cada 15 minutos.

-- Si la extensión no existe (ej. Postgres stock del harness local),
-- se omite sin error: los schedules solo tienen sentido donde hay pg_cron.
do $body$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule(
      'shopy-release-expired-reservations',
      '* * * * *',
      $$select public.release_expired_reservations();$$
    );
    perform cron.schedule(
      'shopy-refresh-trending-scores',
      '*/15 * * * *',
      $$select public.refresh_trending_scores();$$
    );
  else
    raise notice 'pg_cron no disponible: schedules omitidos.';
  end if;
end
$body$;
