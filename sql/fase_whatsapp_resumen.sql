-- LD Rental — Resumen diario por WhatsApp (para el dueño de la flota)
-- Manda todos los días un mensaje de WhatsApp con lo cobrado en los
-- últimos 7 días, la deuda total, vencimientos urgentes y multas
-- pendientes. Usa la API oficial de WhatsApp Business (Meta) con una
-- plantilla aprobada, así puede mandarse sin que el dueño le haya
-- escrito antes al número del bot.
--
-- Requisitos previos (fuera de este SQL, todo en Meta/Supabase):
--   1) Tener un número de WhatsApp Business verificado en Meta Business
--      Manager, con el producto "WhatsApp" agregado a una app de Meta
--      for Developers.
--   2) Crear y enviar a aprobar (en Meta Business Manager > WhatsApp
--      Manager > Plantillas de mensaje) una plantilla:
--        Nombre: resumen_flota
--        Categoría: Utilidad (Utility)
--        Idioma: Español (AR) — es_AR
--        Cuerpo: "🚗 *Resumen de tu flota — LD Rental*
--
--        {{1}}
--
--        _Mensaje automático diario_"
--      La aprobación suele tardar de minutos a un día.
--   3) Desplegar la Edge Function "whatsapp-resumen"
--      (ver supabase/functions/whatsapp-resumen/).
--   4) Cargar estos secretos en la Edge Function (Project Settings >
--      Edge Functions > whatsapp-resumen > Secrets, o con
--      `supabase secrets set`):
--        WHATSAPP_TOKEN            → access token permanente de la app de Meta
--        WHATSAPP_PHONE_NUMBER_ID  → ID del número de WhatsApp Business (no el número en sí)
--        WHATSAPP_TO_NUMBER        → tu número personal, con código de país sin "+" (ej: 5491122334455)
--        WHATSAPP_TEMPLATE_NAME    → opcional, default "resumen_flota"
--        WHATSAPP_TEMPLATE_LANG    → opcional, default "es_AR"
--
-- Es seguro volver a correr este archivo.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Reemplazá:
--   <PROJECT_URL>       → la URL de tu proyecto, ej: https://xxxx.supabase.co
--   <SERVICE_ROLE_KEY>  → Project Settings → API → service_role key (secreta)
select cron.schedule(
  'whatsapp-resumen-ldrental',
  '0 11 * * *',
  $$
  select net.http_post(
    url := '<PROJECT_URL>/functions/v1/whatsapp-resumen',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Por defecto corre a las 11:00 UTC (08:00 en Argentina), igual que el
-- resumen push diario. Para cambiar el horario más adelante:
--   select cron.alter_job(job_id, schedule := '0 11 * * *');   -- usá el job_id que te da: select * from cron.job;
-- Para cancelarlo:
--   select cron.unschedule('whatsapp-resumen-ldrental');
