-- LD Rental — Tablas para la profesionalización (noviembre 2026)
-- Correr una sola vez en el SQL Editor de Supabase (Project → SQL Editor → New query → pegar → Run).
-- Es seguro volver a correrlo. Usa las funciones is_active_user(), is_admin() y can_delete()
-- que ya crearon los scripts anteriores.
--
-- Qué crea:
--   1. cajachica: los movimientos de la caja chica (antes estaban dentro de los ajustes).
--      La app los pasa sola a esta tabla la primera vez que la encuentra.
--   2. app_errores: los errores que tiene la app en los celulares, para poder arreglarlos.
--      Cualquier usuario activo puede anotar un error; solo el administrador los ve.
--   3. arca_config: la clave, el certificado y el ticket de acceso de la facturación
--      electrónica. No la puede leer nadie desde la app: solo la función facturar-arca.

-- 1) Caja chica ---------------------------------------------------------
create table if not exists public.cajachica (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.cajachica enable row level security;

do $$
begin
  execute coalesce((
    select string_agg(format('drop policy if exists %I on public.cajachica;', policyname), ' ')
    from pg_policies where schemaname = 'public' and tablename = 'cajachica'
  ), 'select 1;');
  create policy cajachica_select on public.cajachica for select to authenticated using (is_active_user());
  create policy cajachica_insert on public.cajachica for insert to authenticated with check (is_active_user());
  create policy cajachica_update on public.cajachica for update to authenticated using (is_active_user()) with check (is_active_user());
  create policy cajachica_delete on public.cajachica for delete to authenticated using (can_delete());
end $$;

-- 2) Errores de la app --------------------------------------------------
create table if not exists public.app_errores (
  id bigint generated always as identity primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.app_errores enable row level security;

do $$
begin
  execute coalesce((
    select string_agg(format('drop policy if exists %I on public.app_errores;', policyname), ' ')
    from pg_policies where schemaname = 'public' and tablename = 'app_errores'
  ), 'select 1;');
  create policy app_errores_insert on public.app_errores for insert to authenticated with check (is_active_user());
  create policy app_errores_select on public.app_errores for select to authenticated using (is_admin());
  create policy app_errores_delete on public.app_errores for delete to authenticated using (is_admin());
end $$;

-- Para que la tabla de errores no crezca sin fin: se borran solos los de más de 90 días
-- cada vez que entra uno nuevo.
create or replace function public.limpiar_app_errores() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.app_errores where created_at < now() - interval '90 days';
  return new;
end $$;
drop trigger if exists app_errores_limpiar on public.app_errores;
create trigger app_errores_limpiar after insert on public.app_errores
  for each statement execute function public.limpiar_app_errores();

-- 3) Facturación electrónica (ARCA) -------------------------------------
-- Con RLS activado y sin políticas: desde la app no se puede leer ni escribir.
create table if not exists public.arca_config (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.arca_config enable row level security;
