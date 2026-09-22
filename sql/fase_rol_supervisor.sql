-- Mi Flota — Rol supervisor: puede ver rentabilidad y borrar registros,
-- pero no cambiar roles ni ver la auditoría completa (eso sigue siendo solo admin).
-- Correr una sola vez en el SQL Editor de Supabase (Project → SQL Editor → New query).
-- Requiere haber corrido antes sql/fase4_usuarios_roles.sql.
-- Es seguro volver a correrlo.

-- 1) Permitir el valor 'supervisor' en profiles.rol
alter table public.profiles drop constraint if exists profiles_rol_check;
alter table public.profiles add constraint profiles_rol_check check (rol in ('admin','empleado','supervisor'));

-- 2) Función: admin o supervisor activos pueden borrar (empleado no).
create or replace function public.can_delete() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and rol in ('admin','supervisor') and activo = true);
$$;

-- 3) Reemplaza la política de borrado (antes solo admin) en todas las tablas de datos.
do $$
declare t text;
begin
  foreach t in array array['cars','drivers','payments','gastos','proveedores','sanciones','prospectos','inspecciones','mantenimientos','multas','depositos'] loop
    execute format('drop policy if exists %I on public.%I;', t || '_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using (can_delete());', t || '_delete', t);
  end loop;
end $$;
