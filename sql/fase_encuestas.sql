-- LD Rental — Encuestas de satisfacción (NPS) de choferes.
-- Hasta ahora la encuesta del portal solo mandaba un push y se perdía: no
-- quedaba registro para ver la tendencia. Esta tabla la persiste.
-- Correr una sola vez en el SQL Editor de Supabase (Project → SQL Editor →
-- New query). Requiere haber corrido antes sql/fase4_usuarios_roles.sql y
-- sql/fase_rol_supervisor.sql (usa is_active_user()/can_delete()).
-- Es seguro volver a correrlo.

create table if not exists public.encuestas (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.encuestas enable row level security;

do $$
begin
  execute coalesce((
    select string_agg(format('drop policy if exists %I on public.encuestas;', policyname), ' ')
    from pg_policies where schemaname = 'public' and tablename = 'encuestas'
  ), 'select 1;');
  create policy encuestas_select on public.encuestas for select to authenticated using (is_active_user());
  create policy encuestas_insert on public.encuestas for insert to authenticated with check (is_active_user());
  create policy encuestas_update on public.encuestas for update to authenticated using (is_active_user()) with check (is_active_user());
  create policy encuestas_delete on public.encuestas for delete to authenticated using (can_delete());
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'encuestas'
  ) then
    alter publication supabase_realtime add table public.encuestas;
  end if;
end $$;
