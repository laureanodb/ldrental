-- Mi Flota — Mantenimiento y Multas: tablas nuevas
-- Correr una sola vez en el SQL Editor de Supabase (Project → SQL Editor → New query).
-- Requiere haber corrido antes sql/fase4_usuarios_roles.sql (usa is_active_user()/is_admin()).
-- Es seguro volver a correrlo.

create table if not exists public.mantenimientos (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public.multas (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.mantenimientos enable row level security;
alter table public.multas enable row level security;

do $$
declare t text;
begin
  foreach t in array array['mantenimientos','multas'] loop
    execute coalesce((
      select string_agg(format('drop policy if exists %I on public.%I;', policyname, t), ' ')
      from pg_policies where schemaname='public' and tablename=t
    ), 'select 1;');
    execute format('create policy %I on public.%I for select to authenticated using (is_active_user());', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (is_active_user());', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (is_active_user()) with check (is_active_user());', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (is_admin());', t || '_delete', t);
  end loop;
end $$;

-- Realtime, igual que el resto de las tablas de datos.
do $$
declare t text;
begin
  foreach t in array array['mantenimientos','multas'] loop
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
