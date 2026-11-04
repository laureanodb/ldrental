// LD Rental — tareas de administrador sobre los usuarios de la app.
// POST { accion: 'contrasena', userId, password } con el token de sesión del usuario
// (Authorization: Bearer ...). Solo un admin activo (tabla profiles) puede usarla.
// - contrasena: le pone una contraseña nueva a otro usuario (para cuando se la
//   olvidó y no le llega el mail de recuperación).
// Usa la clave de servicio solo para ese cambio; no devuelve datos de nadie.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'Método no permitido' }, 405);
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try {
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: u } = await sb.auth.getUser(jwt);
    if (!u || !u.user) return json({ ok: false, error: 'Tenés que iniciar sesión' }, 401);
    const { data: yo, error: errYo } = await sb.from('profiles').select('rol,activo').eq('id', u.user.id).maybeSingle();
    if (errYo) return json({ ok: false, error: 'No se pudo revisar tu usuario: ' + errYo.message }, 500);
    if (!yo || yo.rol !== 'admin' || yo.activo === false) return json({ ok: false, error: 'Solo un administrador puede hacer esto' }, 403);

    const body = await req.json().catch(() => ({}));
    if (body.accion !== 'contrasena') return json({ ok: false, error: 'Acción inválida' }, 400);
    const userId = String(body.userId || '');
    const password = String(body.password || '');
    if (!userId) return json({ ok: false, error: 'Falta el usuario' }, 400);
    if (password.length < 8) return json({ ok: false, error: 'La contraseña tiene que tener al menos 8 caracteres' }, 400);
    if (password.length > 72) return json({ ok: false, error: 'La contraseña es demasiado larga' }, 400);
    const { data: destino } = await sb.from('profiles').select('id,email').eq('id', userId).maybeSingle();
    if (!destino) return json({ ok: false, error: 'No se encontró el usuario' }, 404);

    const r = await sb.auth.admin.updateUserById(userId, { password });
    if (r.error) return json({ ok: false, error: 'No se pudo cambiar: ' + r.error.message }, 400);
    await sb.from('audit_log').insert({ user_id: u.user.id, user_email: u.user.email, accion: 'cambio_contrasena(' + (destino.email || '') + ')', tabla: 'usuarios', registro_id: userId }).then(() => {}, () => {});
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
