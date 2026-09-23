// LD Rental — alta pública de prospectos (formulario de postulación).
// Recibe nombre/teléfono/canal de origen/tipo de licencia/experiencia
// desde un formulario público (sin login, ver src/postulacion.js) y crea
// un chofer marcado como prospecto en etapa "Contacto inicial". Usa el
// service role solo para insertar esta única fila; no expone ni permite
// leer ningún dato existente.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
