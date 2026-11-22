// "Revisar instalación": prueba una por una las piezas que la app necesita en Supabase
// (tablas, archivos, funciones y claves) y dice qué falta y cómo arreglarlo.
// Solo lee: no cambia nada.
import { S, sb } from '../state.js';
import { SUPABASE_URL, SUPABASE_KEY, BUCKET } from '../config.js';
import { COLS } from '../constants.js';
import { esc } from '../utils.js';
import { openModal } from '../modal.js';
import { isAdmin } from '../roles.js';

// Versión que tiene que tener publicada cada función (la que está en supabase/functions).
const VERSIONES = { 'portal-chofer': '2026-11-22', postulacion: '2026-11-22' };
const EXTRAS = [['app_settings', 'sql/fase_settings_compartidos.sql'], ['profiles', 'sql/fase4_usuarios_roles.sql'], ['audit_log', 'sql/fase4_usuarios_roles.sql'],
  ['cajachica', 'sql/fase_profesional.sql'], ['app_errores', 'sql/fase_profesional.sql'], ['push_subscriptions', 'sql/fase_push.sql']];

const fila = (estado, titulo, detalle) => '<div class="row" style="gap:8px;align-items:flex-start;padding:6px 0;border-bottom:1px solid var(--line)">' +
  '<span style="width:20px;flex:none;color:' + (estado === 'ok' ? 'var(--ok)' : estado === 'warn' ? 'var(--warn)' : 'var(--bad)') + '">' + (estado === 'ok' ? '✓' : estado === 'warn' ? '!' : '✗') + '</span>' +
  '<div style="min-width:0"><b class="small">' + esc(titulo) + '</b>' + (detalle ? '<div class="small muted">' + detalle + '</div>' : '') + '</div></div>';

async function llamar(nombre, opciones) {
  try {
    const r = await fetch(SUPABASE_URL + '/functions/v1/' + nombre + (opciones && opciones.query || ''), Object.assign({ headers: { Authorization: 'Bearer ' + SUPABASE_KEY, apikey: SUPABASE_KEY } }, opciones || {}));
    const j = await r.json().catch(() => null);
    return { status: r.status, j };
  } catch (e) { return { status: 0, j: null }; }
}
const faltaFuncion = n => 'No está publicada. Se publica sola desde GitHub si cargaste el secreto SUPABASE_ACCESS_TOKEN (ver la guía), o a mano en Supabase → Edge Functions → ' + esc(n) + '.';

export async function revisarInstalacion() {
  if (!isAdmin()) return;
  openModal('<h3>Revisar instalación</h3><div class="small muted" style="margin-bottom:10px">Pruebo cada pieza que la app necesita. No cambia nada.</div><div id="dg_res" class="small muted">Revisando…</div>' +
    '<button class="btn sec block" style="margin-top:12px" onclick="closeModal()">Cerrar</button>');
  const out = [];
  const pintar = () => { const el = document.getElementById('dg_res'); if (el) el.innerHTML = out.join('') + '<div class="small muted" style="margin-top:6px">Revisando…</div>'; };

  // 1. Conexión y sesión
  const g = await sb.auth.getSession().catch(() => null);
  const token = g && g.data && g.data.session && g.data.session.access_token;
  out.push(fila(token ? 'ok' : 'bad', 'Conexión y sesión', token ? '' : 'No hay sesión activa. Cerrá sesión y volvé a entrar.')); pintar();

  // 2. Tablas
  const faltan = [];
  await Promise.all(COLS.map(async c => { const r = await sb.from(c).select('id').limit(1); if (r.error) faltan.push([c, 'sql/fase2_tablas.sql (o el script de esa función)']); }));
  await Promise.all(EXTRAS.map(async ([t, sql]) => { const r = await sb.from(t).select('*').limit(1); if (r.error) faltan.push([t, sql]); }));
  out.push(fila(faltan.length ? (faltan.every(f => ['cajachica', 'app_errores', 'push_subscriptions'].includes(f[0])) ? 'warn' : 'bad') : 'ok', 'Tablas de la base de datos',
    faltan.length ? 'Faltan: ' + faltan.map(f => '<b>' + esc(f[0]) + '</b> (' + esc(f[1]) + ')').join(', ') + '. Se crean corriendo ese archivo en Supabase → SQL Editor.' : 'Están todas (' + (COLS.length + EXTRAS.length) + ').')); pintar();

  // 3. Usuario y permisos
  out.push(fila(S.profilesEnabled ? 'ok' : 'warn', 'Usuarios y roles', S.profilesEnabled ? 'Tu rol: ' + esc((S.profile && S.profile.rol) || '—') : 'No está activada la tabla de perfiles: todos los usuarios son administradores. Correr sql/fase4_usuarios_roles.sql.'));

  // 4. Archivos
  const st = await sb.storage.from(BUCKET).list('', { limit: 1 }).catch(e => ({ error: e }));
  out.push(fila(st && !st.error ? 'ok' : 'bad', 'Archivos (fotos y PDF)', st && !st.error ? '' : 'No se puede leer el espacio de archivos "' + esc(BUCKET) + '". Revisá en Supabase → Storage que exista y tenga sus permisos.')); pintar();

  // 5. Ajustes compartidos
  const cfg = await sb.from('app_settings').select('id').eq('id', 'main').maybeSingle();
  out.push(fila(cfg && cfg.data ? 'ok' : 'warn', 'Ajustes compartidos', cfg && cfg.data ? '' : 'Todavía no se guardaron. Entrá a Más → Ajustes y guardá algo (por ejemplo el nombre de la empresa).'));

  // 6. Funciones
  if (token) {
    const r = await llamar('leer-documento', { method: 'POST', headers: { Authorization: 'Bearer ' + token, apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo: '__diagnostico__' }) });
    const e = r.j && r.j.error;
    out.push(fila(r.status === 404 || !r.j ? 'bad' : e === 'sin_ia' ? 'warn' : 'ok', 'Lectura de documentos con IA',
      r.status === 404 || !r.j ? faltaFuncion('leer-documento') : e === 'sin_ia' ? 'La función está, pero falta la clave ANTHROPIC_API_KEY en Supabase → Edge Functions → Secrets.' : ''));
    const u = await llamar('usuarios-admin', { method: 'POST', headers: { Authorization: 'Bearer ' + token, apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: '__diagnostico__' }) });
    out.push(fila(u.status === 404 || !u.j ? 'bad' : 'ok', 'Cambio de contraseñas de usuarios', u.status === 404 || !u.j ? faltaFuncion('usuarios-admin') : ''));
    pintar();
  }
  const po = await llamar('postulacion');
  out.push(fila(!po.j ? 'bad' : po.j.version === VERSIONES.postulacion ? 'ok' : 'warn', 'Formulario de postulación',
    !po.j ? faltaFuncion('postulacion') : po.j.version === VERSIONES.postulacion ? '' : 'Está publicada una versión vieja' + (po.j.version ? ' (' + esc(po.j.version) + ')' : '') + '. Hay que volver a publicarla.'));
  const d = S.drivers.find(x => x.portalToken && !x.inactivo);
  const pc = await llamar('portal-chofer', { query: d ? '?id=' + encodeURIComponent(d.id) + '&t=' + encodeURIComponent(d.portalToken) : '?id=x&t=x' });
  const ver = pc.j && pc.j.version;
  out.push(fila(!pc.j ? 'bad' : ver === VERSIONES['portal-chofer'] ? 'ok' : d && pc.j.ok ? 'warn' : 'ok', 'Portal del chofer',
    !pc.j ? faltaFuncion('portal-chofer') : ver === VERSIONES['portal-chofer'] ? '' : d && pc.j.ok ? 'Está publicada una versión vieja. Hay que volver a publicarla (color, horario de atención y términos no se ven).' : 'Está publicada (no hay ningún chofer con link para ver la versión).'));

  // 7. La app
  const sw = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration().catch(() => null) : null;
  out.push(fila(location.protocol === 'https:' ? 'ok' : 'warn', 'Dirección segura (https)', location.protocol === 'https:' ? esc(location.host) : 'La app no está en https.'));
  out.push(fila(sw ? 'ok' : 'warn', 'Funciona sin internet', sw ? '' : 'Este navegador no instaló el modo sin conexión. Probá abrir la app desde Chrome o Safari.'));

  const el = document.getElementById('dg_res'); if (!el) return;
  const malos = out.filter(x => x.includes('var(--bad)')).length, avisos = out.filter(x => x.includes('var(--warn)')).length;
  el.innerHTML = '<div class="card" style="margin-bottom:8px"><b>' + (malos ? '✗ Hay ' + malos + ' cosa(s) para arreglar' : avisos ? '! Funciona, con ' + avisos + ' aviso(s)' : '✓ Está todo bien instalado') + '</b></div>' + out.join('');
}
