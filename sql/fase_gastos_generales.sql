-- Mi Flota — Gastos generales de flota: tabla para gastos recurrentes que no son de un auto puntual
-- (herramientas, insumos, alquileres, sueldos, etc.). Los gastos en sí siguen viviendo en
-- "gastos" (con carId vacío); esta tabla nueva solo guarda las reglas recurrentes.
-- Correr una sola vez en el SQL Editor de Supabase (Project → SQL Editor → New query).
-- Requiere haber corrido antes sql/fase4_usuarios_roles.sql y sql/fase_rol_supervisor.sql
-- (usa is_active_user()/can_delete()).
-- Es seguro volver a correrlo.

create table if not exists public.gastosrecurrentes (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.gastosrecurrentes enable row level security;

do $$
begin
  execute coalesce((
    select string_agg(format('drop policy if exists %I on public.gastosrecurrentes;', policyname), ' ')
    from pg_policies where schemaname = 'public' and tablename = 'gastosrecurrentes'
  ), 'select 1;');
  create policy gastosrecurrentes_select on public.gastosrecurrentes for select to authenticated using (is_active_user());
  create policy gastosrecurrentes_insert on public.gastosrecurrentes for insert to authenticated with check (is_active_user());
  create policy gastosrecurrentes_update on public.gastosrecurrentes for update to authenticated using (is_active_user()) with check (is_active_user());
  create policy gastosrecurrentes_delete on public.gastosrecurrentes for delete to authenticated using (can_delete());
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'gastosrecurrentes'
  ) then
    alter publication supabase_realtime add table public.gastosrecurrentes;
  end if;
end $$;
