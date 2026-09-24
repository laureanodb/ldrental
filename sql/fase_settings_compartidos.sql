-- Comparte entre todos los dispositivos (y con el portal del chofer) el
-- nombre de la empresa, logo, teléfono, protocolo de emergencia y anuncios,
-- que hasta ahora solo vivían en el localStorage de cada admin.

create table if not exists public.app_settings (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='app_settings' and policyname='app_settings_select') then
    create policy "app_settings_select" on public.app_settings for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='app_settings' and policyname='app_settings_insert') then
    create policy "app_settings_insert" on public.app_settings for insert to authenticated with check (is_active_user());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='app_settings' and policyname='app_settings_update') then
    create policy "app_settings_update" on public.app_settings for update to authenticated using (is_active_user()) with check (is_active_user());
  end if;
end $$;
