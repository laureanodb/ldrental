-- Mi Flota — Módulo de siniestros: tabla nueva
-- Correr una sola vez en el SQL Editor de Supabase (Project → SQL Editor → New query).
-- Requiere haber corrido antes sql/fase4_usuarios_roles.sql y sql/fase_rol_supervisor.sql
-- (usa is_active_user()/can_delete()).
-- Es seguro volver a correrlo.

create table if not exists public.siniestros (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.siniestros enable row level security;

do $$
begin
  execute coalesce((
    select string_agg(format('drop policy if exists %I on public.siniestros;', policyname), ' ')
    from pg_policies where schemaname = 'public' and tablename = 'siniestros'
  ), 'select 1;');
  create policy siniestros_select on public.siniestros for select to authenticated using (is_active_user());
  create policy siniestros_insert on public.siniestros for insert to authenticated with check (is_active_user());
  create policy siniestros_update on public.siniestros for update to authenticated using (is_active_user()) with check (is_active_user());
  create policy siniestros_delete on public.siniestros for delete to authenticated using (can_delete());
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'siniestros'
  ) then
    alter publication supabase_realtime add table public.siniestros;
  end if;
end $$;
