alter table public.push_subscriptions
  add column if not exists ultimo_envio date;
