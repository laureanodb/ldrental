-- LD Rental — Resumen semanal por notificación push
-- Se dispara los lunes con un resumen de lo cobrado la semana anterior,
-- la deuda total y los vencimientos próximos. Usa la misma tabla de
-- suscripciones push (push_subscriptions) que el resumen diario, pero
-- una Edge Function separada (push-semanal) y un cron job aparte, así
-- no interfiere con el horario del resumen diario.
-- Requiere haber corrido antes sql/fase_push.sql y haber desplegado la
-- Edge Function "push-semanal" (ver supabase/functions/push-semanal/).
-- Es seguro volver a correrlo.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Reemplazá:
--   <PROJECT_URL>            → la URL de tu proyecto, ej: https://xxxx.supabase.co
--   <SERVICE_ROLE_KEY>       → Project Settings → API → service_role key (secreta)
select cron.schedule(
  'push-semanal-mi-flota',
  '0 11 * * 1',
  $$
  select net.http_post(
    url := '<PROJECT_URL>/functions/v1/push-semanal',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Para cambiar el horario más adelante:
--   select cron.alter_job(job_id, schedule := '0 11 * * 1');   -- usá el job_id que te da cron.job
-- Para cancelarlo:
--   select cron.unschedule('push-semanal-mi-flota');
