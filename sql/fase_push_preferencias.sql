-- Preferencias granulares de notificaciones push: cada usuario elige qué
-- avisos quiere recibir en el resumen diario (vencimientos, deuda de
-- choferes, multas). Requiere haber corrido antes sql/fase_push.sql.
-- Es seguro volver a correrlo.

alter table public.push_subscriptions
  add column if not exists prefs jsonb not null default '{"vencimientos":true,"deuda":true,"multas":true}'::jsonb;
