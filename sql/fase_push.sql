-- Mi Flota — Notificaciones push diarias
-- Correr en el SQL Editor de Supabase. Antes de correr la parte 3 necesitás:
--   1) Las claves VAPID del proyecto (públicas/privadas). Si ya te las dieron
--      junto con esta migración, guardalas como secretos de la Edge Function
--      "push-diario": VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
--      (ej: mailto:tu-email@ejemplo.com). También poné VITE_VAPID_PUBLIC_KEY
--      en las variables de entorno de Vercel con la clave pública.
--   2) Haber desplegado la Edge Function "push-diario"
--      (ver supabase/functions/push-diario/).
-- Requiere haber corrido antes sql/fase4_usuarios_roles.sql (usa is_active_user()).
-- Es seguro volver a correrlo.

-- 1) Tabla de suscripciones push (una fila por dispositivo/navegador suscripto).
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;

do $$
begin
  execute coalesce((
    select string_agg(format('drop policy if exists %I on public.push_subscriptions;', policyname), ' ')
    from pg_policies where schemaname = 'public' and tablename = 'push_subscriptions'
  ), 'select 1;');
  create policy push_subscriptions_select on public.push_subscriptions for select to authenticated using (auth.uid() = user_id);
  create policy push_subscriptions_insert on public.push_subscriptions for insert to authenticated with check (auth.uid() = user_id and is_active_user());
  create policy push_subscriptions_delete on public.push_subscriptions for delete to authenticated using (auth.uid() = user_id);
end $$;

-- 2) Extensiones necesarias para programar tareas y llamar a la función
--    (si ya corriste sql/fase5_backups_automaticos.sql, ya están activas).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 3) Tarea programada: todos los días a las 11:00 UTC (08:00 en Argentina).
--    Reemplazá:
--      <PROJECT_URL>            → la URL de tu proyecto, ej: https://xxxx.supabase.co
--      <SERVICE_ROLE_KEY>       → Project Settings → API → service_role key (secreta, no la publishable)
select cron.schedule(
  'push-diario-mi-flota',
  '0 11 * * *',
  $$
  select net.http_post(
    url := '<PROJECT_URL>/functions/v1/push-diario',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Para cambiar el horario más adelante:
--   select cron.alter_job(job_id, schedule := '0 11 * * *');   -- usá el job_id que te da cron.job
-- Para cancelarlo:
--   select cron.unschedule('push-diario-mi-flota');
