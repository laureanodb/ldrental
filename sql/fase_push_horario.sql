-- Mi Flota — Horario configurable del push diario
-- Agrega una función que le permite a un admin cambiar la hora del resumen
-- push diario desde la propia app, sin tocar el SQL Editor cada vez.
-- Correr en el SQL Editor de Supabase. Requiere haber corrido antes
-- sql/fase_push.sql (la tarea "push-diario-mi-flota" tiene que existir).
-- Es seguro volver a correrlo.

create or replace function public.set_push_schedule(hora_utc int)
returns void
language plpgsql
security definer
set search_path = public as $$
declare
  jid bigint;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and rol = 'admin' and activo = true) then
    raise exception 'Solo un administrador puede cambiar el horario';
  end if;
  if hora_utc < 0 or hora_utc > 23 then
    raise exception 'Hora inválida (0 a 23)';
  end if;
  select jobid into jid from cron.job where jobname = 'push-diario-mi-flota';
  if jid is null then
    raise exception 'No se encontró la tarea programada. Corré primero sql/fase_push.sql';
  end if;
  perform cron.alter_job(job_id := jid, schedule := '0 ' || hora_utc || ' * * *');
end;
$$;

grant execute on function public.set_push_schedule(int) to authenticated;
