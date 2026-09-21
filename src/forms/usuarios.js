import { $, esc } from '../utils.js';
import { S, sb } from '../state.js';
import { openModal, toast } from '../modal.js';
import { isAdmin } from '../roles.js';

function renderUsuarios(list) {
  return '<div id="us_list">' + list.map(p => '<div class="card"><div class="row between"><b>' + esc(p.email) + '</b>' + (p.activo ? '' : '<span class="badge b-mute">Inactivo</span>') + '</div>' +
  '<div class="row" style="margin-top:8px;gap:8px">' +
  '<select onchange="cambiarRol(\'' + p.id + '\',this.value)"' + (p.id === S.user.id ? ' disabled' : '') + '><option value="empleado"' + (p.rol === 'empleado' ? ' selected' : '') + '>Empleado</option><option value="admin"' + (p.rol === 'admin' ? ' selected' : '') + '>Admin</option></select>' +
  '<button class="btn sec sm"' + (p.id === S.user.id ? ' disabled' : '') + ' onclick="toggleActivo(\'' + p.id + '\',' + !p.activo + ')">' + (p.activo ? 'Revocar acceso' : 'Restaurar acceso') + '</button>' +
  '</div></div>').join('') + '</div>';
}
export async function usuariosView() {
  if (!isAdmin()) { toast('Solo un administrador puede ver esto'); return; }
  openModal('<h3>Usuarios</h3><div class="small muted" style="margin-bottom:12px">Para dar de alta a alguien nuevo, cargalo primero en Supabase → Authentication → Add user. Después va a aparecer acá para asignarle rol.</div><div id="us_list" class="small muted">Cargando…</div>');
  const r = await sb.from('profiles').select('*').order('created_at');
  const el = $('#us_list'); if (!el) return;
  if (r.error) { el.textContent = 'No se pudo cargar: ' + r.error.message; return; }
  el.outerHTML = renderUsuarios(r.data || []);
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
