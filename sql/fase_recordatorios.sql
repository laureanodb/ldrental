-- Mi Flota — Recordatorios de tareas manuales: tabla nueva
-- Correr una sola vez en el SQL Editor de Supabase (Project → SQL Editor → New query).
-- Requiere haber corrido antes sql/fase4_usuarios_roles.sql y sql/fase_rol_supervisor.sql
-- (usa is_active_user()/can_delete()).
-- Es seguro volver a correrlo.

create table if not exists public.recordatorios (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.recordatorios enable row level security;

do $$
begin
  execute coalesce((
    select string_agg(format('drop policy if exists %I on public.recordatorios;', policyname), ' ')
    from pg_policies where schemaname = 'public' and tablename = 'recordatorios'
  ), 'select 1;');
  create policy recordatorios_select on public.recordatorios for select to authenticated using (is_active_user());
  create policy recordatorios_insert on public.recordatorios for insert to authenticated with check (is_active_user());
  create policy recordatorios_update on public.recordatorios for update to authenticated using (is_active_user()) with check (is_active_user());
  create policy recordatorios_delete on public.recordatorios for delete to authenticated using (can_delete());
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'recordatorios'
  ) then
    alter publication supabase_realtime add table public.recordatorios;
  end if;
end $$;
