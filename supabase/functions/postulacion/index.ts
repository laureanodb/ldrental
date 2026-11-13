// LD Rental — alta pública de prospectos (formulario de postulación).
// GET devuelve los datos públicos de la página de la empresa (nombre, logo y los textos
// que se cargan en la app); no expone nada más de app_settings.
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

const txt = (v: unknown, max = 300) => String(v || '').trim().slice(0, max);
const lista = (v: unknown) => (Array.isArray(v) ? v : String(v || '').split('\n')).map((x: unknown) => txt(x, 200)).filter(Boolean).slice(0, 12);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  // GET: datos públicos para la página de la empresa (lo que se carga en Más → Página de la empresa).
  if (req.method === 'GET') {
    try {
      const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const { data: row } = await sb.from('app_settings').select('data').eq('id', 'main').maybeSingle();
      const cfg = (row && row.data) || {};
      const s = cfg.sitioEmpresa || {};
      return json({
        ok: true, companyName: txt(cfg.companyName, 80), companyLogo: String(cfg.companyLogo || '').slice(0, 400000),
        sitio: { titulo: txt(s.titulo, 120), bajada: txt(s.bajada, 400), quienes: txt(s.quienes, 1500), requisitos: lista(s.requisitos), beneficios: lista(s.beneficios),
          zona: txt(s.zona, 160), horario: txt(s.horario, 160), whatsapp: txt(s.whatsapp, 40), instagram: txt(s.instagram, 80), direccion: txt(s.direccion, 160) },
      });
    } catch (e) {
      return json({ ok: false, error: String(e) }, 500);
    }
  }
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
