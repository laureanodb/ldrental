-- Mi Flota — Fase 2: tablas nuevas (gastos, proveedores, sanciones, prospectos, inspecciones)
-- Correr una sola vez en el SQL Editor de Supabase (Project → SQL Editor → New query).
-- Usa el mismo patrón que las tablas existentes cars/drivers/payments: id + data jsonb + updated_at.
-- Es seguro volver a correrlo (IF NOT EXISTS / DO blocks).

create table if not exists public.gastos (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public.proveedores (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public.sanciones (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public.prospectos (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public.inspecciones (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.gastos enable row level security;
alter table public.proveedores enable row level security;
alter table public.sanciones enable row level security;
alter table public.prospectos enable row level security;
alter table public.inspecciones enable row level security;

do $$
declare t text;
begin
  foreach t in array array['gastos','proveedores','sanciones','prospectos','inspecciones'] loop
    if not exists (
      select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_all_authenticated'
    ) then
      execute format(
        'create policy %I on public.%I for all to authenticated using (true) with check (true)',
        t || '_all_authenticated', t
      );
    end if;
  end loop;
end $$;

-- Habilita realtime (igual que ya está en cars/drivers/payments) para que los cambios se reflejen en vivo.
do $$
declare t text;
begin
  foreach t in array array['gastos','proveedores','sanciones','prospectos','inspecciones'] loop
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
