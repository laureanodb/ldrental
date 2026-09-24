-- Último ingreso por usuario, desactivación temporal, y aviso de borrados de supervisores.

alter table public.profiles add column if not exists ultimo_ingreso timestamptz;
alter table public.profiles add column if not exists inactivo_hasta date;

create or replace function public.marcar_ultimo_ingreso()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set ultimo_ingreso = now() where id = auth.uid();
$$;
grant execute on function public.marcar_ultimo_ingreso() to authenticated;

create or replace function public.revisar_reactivacion()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set activo = true, inactivo_hasta = null
    where id = auth.uid() and activo = false and inactivo_hasta is not null and inactivo_hasta <= current_date;
$$;
grant execute on function public.revisar_reactivacion() to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='audit_log') then
    alter publication supabase_realtime add table public.audit_log;
  end if;
end $$;
