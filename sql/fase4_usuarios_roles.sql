-- Mi Flota — Fase 4: usuarios, roles, permisos y auditoría
-- Correr una sola vez en el SQL Editor de Supabase (Project → SQL Editor → New query).
-- Es seguro volver a correrlo.
--
-- Qué hace:
--   1. Crea la tabla profiles (un perfil por usuario de Supabase Auth), con rol
--      ('admin' o 'empleado') y activo (true/false). El PRIMER usuario que exista
--      en el proyecto al correr este script queda como admin automáticamente;
--      cualquier usuario que se cree después queda como 'empleado' hasta que un
--      admin lo cambie desde la app.
--   2. Reemplaza los permisos (RLS) de todas las tablas de datos: cualquier
--      usuario activo puede leer/crear/editar, pero SOLO un admin puede borrar.
--      Un usuario con activo=false pierde el acceso a todo, sin necesidad de
--      borrar su cuenta (eso es "revocar acceso" desde la app).
--   3. Crea audit_log: cada guardado/borrado que hace la app queda registrado
--      (quién, qué acción, en qué tabla). Solo un admin puede leerla, y nadie
--      puede editarla ni borrarla (ni siquiera un admin) una vez escrita.

-- 1) Perfiles -----------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  rol text not null default 'empleado' check (rol in ('admin','empleado')),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- Perfil inicial para los usuarios que ya existan (el más antiguo = admin).
insert into public.profiles (id, email, rol, activo)
select u.id, u.email,
  case when u.id = (select id from auth.users order by created_at asc limit 1) then 'admin' else 'empleado' end,
  true
from auth.users u
on conflict (id) do nothing;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and rol = 'admin' and activo = true);
$$;

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and activo = true);
$$;

-- Crea el perfil automáticamente cuando se registra un usuario nuevo.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, rol, activo)
  values (
    new.id, new.email,
    case when (select count(*) from public.profiles) = 0 then 'admin' else 'empleado' end,
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_select') then
    create policy "profiles_select" on public.profiles for select to authenticated using (id = auth.uid() or is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_update_admin') then
    create policy "profiles_update_admin" on public.profiles for update to authenticated using (is_admin()) with check (is_admin());
  end if;
end $$;

-- 2) Permisos por rol en las tablas de datos -----------------------------
do $$
declare t text;
begin
  foreach t in array array['cars','drivers','payments','gastos','proveedores','sanciones','prospectos','inspecciones'] loop
    -- limpia cualquier política previa (con el nombre que sea) para partir de cero
    execute coalesce((
      select string_agg(format('drop policy if exists %I on public.%I;', policyname, t), ' ')
      from pg_policies where schemaname='public' and tablename=t
    ), 'select 1;');
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy %I on public.%I for select to authenticated using (is_active_user());', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (is_active_user());', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (is_active_user()) with check (is_active_user());', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (is_admin());', t || '_delete', t);
  end loop;
end $$;

-- 3) Auditoría ------------------------------------------------------------
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  user_email text,
  accion text not null,
  tabla text not null,
  registro_id text,
  created_at timestamptz not null default now()
);
alter table public.audit_log enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='audit_log' and policyname='audit_log_select_admin') then
    create policy "audit_log_select_admin" on public.audit_log for select to authenticated using (is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='audit_log' and policyname='audit_log_insert_active') then
    create policy "audit_log_insert_active" on public.audit_log for insert to authenticated with check (is_active_user());
  end if;
end $$;

-- profiles y audit_log en tiempo real (opcional, pero mantiene todo consistente)
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='profiles') then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;
