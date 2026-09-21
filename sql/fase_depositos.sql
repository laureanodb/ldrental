-- Mi Flota — Depósitos de garantía: tabla nueva
-- Correr una sola vez en el SQL Editor de Supabase (Project → SQL Editor → New query).
-- Requiere haber corrido antes sql/fase4_usuarios_roles.sql (usa is_active_user()/is_admin()).
-- Es seguro volver a correrlo.

create table if not exists public.depositos (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.depositos enable row level security;

do $$
begin
  execute coalesce((
    select string_agg(format('drop policy if exists %I on public.depositos;', policyname), ' ')
    from pg_policies where schemaname='public' and tablename='depositos'
  ), 'select 1;');
  execute 'create policy depositos_select on public.depositos for select to authenticated using (is_active_user());';
  execute 'create policy depositos_insert on public.depositos for insert to authenticated with check (is_active_user());';
  execute 'create policy depositos_update on public.depositos for update to authenticated using (is_active_user()) with check (is_active_user());';
  execute 'create policy depositos_delete on public.depositos for delete to authenticated using (is_admin());';
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'depositos'
  ) then
    alter publication supabase_realtime add table public.depositos;
  end if;
end $$;
