-- Mi Flota — Fase 5: backups automáticos programados
-- Correr en el SQL Editor de Supabase DESPUÉS de haber desplegado la Edge
-- Function "backup-semanal" (ver supabase/functions/backup-semanal/ y las
-- instrucciones de despliegue). Reemplazá los dos placeholders marcados
-- <...> antes de correrlo.

-- 1) Bucket privado donde se van a guardar las copias automáticas.
insert into storage.buckets (id, name, public)
values ('backups', 'backups', false)
on conflict (id) do nothing;

-- No se agregan políticas públicas a propósito: solo la Edge Function
-- (que usa la service role key) puede escribir ahí. Para bajar una copia
-- manualmente, andá a Storage → backups en el dashboard de Supabase.

-- 2) Extensiones necesarias para programar tareas y llamar a la función.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 3) Tarea programada: todos los lunes a las 06:00 UTC (03:00 en Argentina).
--    Reemplazá:
--      <PROJECT_URL>            → la URL de tu proyecto, ej: https://xxxx.supabase.co
--      <SERVICE_ROLE_KEY>       → Project Settings → API → service_role key (secreta, no la publishable)
select cron.schedule(
  'backup-semanal-mi-flota',
  '0 6 * * 1',
  $$
  select net.http_post(
    url := '<PROJECT_URL>/functions/v1/backup-semanal',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Para cambiar el horario más adelante:
--   select cron.alter_job(job_id, schedule := '0 6 * * 1');   -- usá el job_id que te da cron.job
-- Para cancelarlo:
--   select cron.unschedule('backup-semanal-mi-flota');
