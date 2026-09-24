import { $, esc } from '../utils.js';
import { S, sb } from '../state.js';
import { openModal, toast } from '../modal.js';
import { isAdmin } from '../roles.js';

function renderUsuarios(list) {
  return '<div id="us_list">' + list.map(p => '<div class="card"><div class="row between"><b>' + esc(p.email) + '</b>' + (p.activo ? '' : '<span class="badge b-mute">Inactivo</span>') + '</div>' +
  '<div class="row" style="margin-top:8px;gap:8px">' +
  '<select onchange="cambiarRol(\'' + p.id + '\',this.value)"' + (p.id === S.user.id ? ' disabled' : '') + '><option value="empleado"' + (p.rol === 'empleado' ? ' selected' : '') + '>Empleado</option><option value="supervisor"' + (p.rol === 'supervisor' ? ' selected' : '') + '>Supervisor</option><option value="admin"' + (p.rol === 'admin' ? ' selected' : '') + '>Admin</option></select>' +
  '<button class="btn sec sm"' + (p.id === S.user.id ? ' disabled' : '') + ' onclick="toggleActivo(\'' + p.id + '\',' + !p.activo + ')">' + (p.activo ? 'Revocar acceso' : 'Restaurar acceso') + '</button>' +
  '</div></div>').join('') + '</div>';
}
export async function usuariosView() {
  if (!isAdmin()) { toast('Solo un administrador puede ver esto'); return; }
  openModal('<h3>Usuarios</h3><div class="small muted" style="margin-bottom:12px">Para dar de alta a alguien nuevo, cargalo primero en Supabase → Authentication → Add user. Después va a aparecer acá para asignarle rol.</div><div id="us_list" class="small muted">Cargando…</div><div class="sec-t">Actividad reciente <small class="muted">últimos 30 días</small></div><div id="us_actividad" class="small muted">Cargando…</div>');
  const r = await sb.from('profiles').select('*').order('created_at');
  const el = $('#us_list'); if (!el) return;
  if (r.error) { el.textContent = 'No se pudo cargar: ' + r.error.message; return; }
  el.outerHTML = renderUsuarios(r.data || []);
  const desde = new Date(Date.now() - 30 * 864e5).toISOString();
  const ra = await sb.from('audit_log').select('user_email').gte('created_at', desde);
  const elA = $('#us_actividad'); if (!elA) return;
  if (ra.error) { elA.textContent = 'No se pudo cargar: ' + ra.error.message; return; }
  const conteo = {};
  (ra.data || []).forEach(x => { const e = x.user_email || 'Desconocido'; conteo[e] = (conteo[e] || 0) + 1; });
  const entries = Object.entries(conteo).sort((a, b) => b[1] - a[1]);
  elA.outerHTML = '<div id="us_actividad">' + (entries.length ? entries.map(([email, n]) => '<div class="row between small" style="padding:2px 0"><span>' + esc(email) + '</span><b>' + n + ' acción' + (n === 1 ? '' : 'es') + '</b></div>').join('') : '<div class="small muted">Sin actividad registrada.</div>') + '</div>';
}
export async function cambiarRol(id, rol) {
  const r = await sb.from('profiles').update({ rol }).eq('id', id);
  if (r.error) { toast('No se pudo cambiar: ' + r.error.message); return; }
  toast('Rol actualizado'); usuariosView();
}
export async function toggleActivo(id, activo) {
  const r = await sb.from('profiles').update({ activo }).eq('id', id);
  if (r.error) { toast('No se pudo cambiar: ' + r.error.message); return; }
  toast(activo ? 'Acceso restaurado' : 'Acceso revocado'); usuariosView();
}
