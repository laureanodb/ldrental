// LD Rental — alta pública de prospectos (formulario de postulación).
// Recibe nombre/teléfono/canal de origen/tipo de licencia/experiencia
// desde un formulario público (sin login, ver src/postulacion.js) y crea
// un chofer marcado como prospecto en etapa "Contacto inicial". Usa el
// service role solo para insertar esta única fila; no expone ni permite
// leer ningún dato existente. Además manda una notificación push a los
// dispositivos suscriptos avisando del prospecto nuevo.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type' };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'Método no permitido' }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const nombre = String(body.nombre || '').trim().slice(0, 120);
    const tel = String(body.tel || '').trim().slice(0, 40);
    if (!nombre || !tel) return json({ ok: false, error: 'Faltan datos' }, 400);
    const canalOrigen = String(body.canalOrigen || '').trim().slice(0, 20);
    const canalOrigenOtro = String(body.canalOrigenOtro || '').trim().slice(0, 60);
    const tipoLicencia = String(body.tipoLicencia || '').trim().slice(0, 100);
    const experienciaChofer = String(body.experienciaChofer || '').trim().slice(0, 500);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(supabaseUrl, serviceKey);

    const id = crypto.randomUUID();
    const data = {
      nombre, tel, canalOrigen, canalOrigenOtro, tipoLicencia, experienciaChofer,
      prospecto: true, etapaProspecto: 'contacto', docs: {}, onboarding: {}, files: [],
    };
    const { error } = await sb.from('drivers').insert({ id, data, updated_at: new Date().toISOString() });
    if (error) return json({ ok: false, error: 'No se pudo guardar' }, 500);

    // Aviso push: no debe bloquear ni fallar la respuesta al que se postuló.
    try {
      const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY');
      const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY');
      if (vapidPublic && vapidPrivate) {
        const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com';
        webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
        const { data: subs } = await sb.from('push_subscriptions').select('id,endpoint,p256dh,auth');
        for (const s of subs || []) {
          try {
            await webpush.sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              JSON.stringify({ title: 'Nuevo prospecto', body: nombre + ' se postuló para manejar', url: './' })
            );
          } catch (e: any) {
            if (e && (e.statusCode === 404 || e.statusCode === 410)) {
              await sb.from('push_subscriptions').delete().eq('id', s.id);
            }
          }
        }
      }
    } catch (e) {
      // El aviso push es best-effort: un error acá no debe romper el alta.
    }

    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
