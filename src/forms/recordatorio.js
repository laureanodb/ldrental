// Tareas y recordatorios. Una tarea se le puede asignar a alguien del equipo (por su
// email de usuario) y a un auto; cada uno ve las suyas en el celular y las marca como hechas.
// Sin asignar, es un recordatorio de quien lo cargó.
import { S, sb } from '../state.js';
import { val, uid, esc, iso, today, fdate, parse, days } from '../utils.js';
import { openModal, toast } from '../modal.js';
import { save, remove } from '../data.js';
import { canDelete, isAdmin, isSupervisor } from '../roles.js';
import { de } from '../memo.js';

const yo = () => ((S.user && S.user.email) || '').toLowerCase();
const nombreUsuario = email => String(email || '').split('@')[0];
export const esMia = r => (r.asignadoA ? r.asignadoA.toLowerCase() === yo() : !r.creadoPor || r.creadoPor.toLowerCase() === yo());
const veTodo = () => isAdmin() || isSupervisor();

// Usuarios del equipo para asignar. Si no se pueden leer (permisos), quedan los que ya aparecen en tareas.
let usuarios = null;
async function cargarUsuarios() {
  if (usuarios) return usuarios;
  const set = new Set([yo()].concat(S.recordatorios.flatMap(r => [r.asignadoA, r.creadoPor])).filter(Boolean).map(x => x.toLowerCase()));
  try {
    const r = sb ? await sb.from('profiles').select('email,activo') : null;
    if (r && !r.error) (r.data || []).filter(p => p.activo !== false && p.email).forEach(p => set.add(p.email.toLowerCase()));
  } catch (e) { /* sin acceso a la lista: quedan los conocidos */ }
  usuarios = [...set].sort();
  return usuarios;
}

let filtro = 'mias';
export async function recordatoriosView(editId, f) {
  if (f) filtro = f;
  if (!veTodo() && filtro === 'todas') filtro = 'mias';
  const hoy = iso(today());
  const R = S.recordatorios.filter(r => (filtro === 'hechas' ? r.hecho : !r.hecho) && (filtro === 'todas' || filtro === 'hechas' ? (veTodo() || esMia(r)) : esMia(r)))
    .sort((a, b) => String(a.fecha || '9').localeCompare(b.fecha || '9'));
  const ed = editId ? de('recordatorios', 'id', editId)[0] : null;
  const U = await cargarUsuarios();
  const tab = (k, t) => '<button class="btn ' + (filtro === k ? '' : 'sec ') + 'sm grow" onclick="recordatoriosView(null,\'' + k + '\')">' + t + '</button>';
  let h = '<h3>Tareas y recordatorios</h3><div class="small muted" style="margin-bottom:10px">Cargá una tarea con fecha y, si querés, asignásela a alguien del equipo y a un auto. Cada uno ve las suyas en el Panel y en la Agenda.</div>' +
    '<div class="row" style="margin-bottom:10px">' + tab('mias', 'Mías') + (veTodo() ? tab('todas', 'Todo el equipo') : '') + tab('hechas', 'Hechas') + '</div>';
  h += R.length ? R.map(r => {
    const c = r.carId ? de('cars', 'id', r.carId)[0] : null;
    const vencida = !r.hecho && r.fecha && r.fecha < hoy;
    return '<div class="card row" style="gap:8px"><div class="grow tap" style="min-width:0" onclick="recordatoriosView(\'' + r.id + '\')"><div style="' + (r.hecho ? 'text-decoration:line-through;color:var(--muted)' : '') + '">' + esc(r.texto) + '</div>' +
      '<div class="small" style="color:' + (vencida ? 'var(--bad)' : 'var(--muted)') + '">' + [r.fecha ? (r.fecha === hoy ? 'Hoy' : (vencida ? 'Venció el ' : '') + fdate(r.fecha)) : 'Sin fecha', c ? c.patente : '', r.asignadoA && !esMia(r) ? 'para ' + nombreUsuario(r.asignadoA) : r.asignadoA ? 'asignada a vos' + (r.creadoPor && r.creadoPor !== r.asignadoA ? ' por ' + nombreUsuario(r.creadoPor) : '') : '', r.hecho && r.hechoPor ? 'hecha por ' + nombreUsuario(r.hechoPor) + (r.hechoEl ? ' el ' + fdate(r.hechoEl) : '') : ''].filter(Boolean).map(esc).join(' · ') + '</div></div>' +
      '<button class="btn sec sm" onclick="event.stopPropagation();toggleHechoRecordatorio(\'' + r.id + '\')">' + (r.hecho ? 'Reabrir' : 'Hecha') + '</button></div>';
  }).join('') : '<div class="small muted" style="margin-bottom:8px">' + (filtro === 'hechas' ? 'Todavía no hay tareas hechas.' : 'No tenés tareas pendientes.') + '</div>';
  const autos = S.cars.filter(c => !c.vendido).sort((a, b) => String(a.patente).localeCompare(String(b.patente)));
  h += '<div class="sec-t">' + (ed ? 'Editar tarea' : 'Nueva tarea') + '</div>' +
    '<label class="f"><span>Qué hay que hacer</span><input id="rc_texto" value="' + esc(ed ? ed.texto : '') + '" placeholder="ej: llevar el auto a la VTV"></label>' +
    '<div class="two"><label class="f"><span>Para cuándo</span><input id="rc_fecha" type="date" value="' + esc(ed ? ed.fecha || '' : iso(today())) + '"></label>' +
    '<label class="f"><span>Para quién</span><select id="rc_para"><option value="">Para mí</option>' + U.filter(e => e !== yo()).map(e => '<option value="' + esc(e) + '"' + (ed && (ed.asignadoA || '').toLowerCase() === e ? ' selected' : '') + '>' + esc(e) + '</option>').join('') + '</select></label></div>' +
    '<label class="f"><span>Auto <small>opcional</small></span><select id="rc_auto"><option value="">Ninguno</option>' + autos.map(c => '<option value="' + c.id + '"' + (ed && ed.carId === c.id ? ' selected' : '') + '>' + esc(c.patente) + '</option>').join('') + '</select></label>' +
    '<div class="row"><button class="btn grow" onclick="saveRecordatorio(' + (ed ? "'" + ed.id + "'" : 'null') + ')">Guardar</button>' + (ed ? '<button class="btn sec" onclick="recordatoriosView()">Cancelar</button>' : '<button class="btn sec" onclick="closeModal()">Cerrar</button>') + '</div>' +
    (U.length < 2 && veTodo() ? '<div class="small muted" style="margin-top:6px">Para asignarle tareas a alguien, primero tiene que tener usuario (Más → Usuarios y permisos).</div>' : '') +
    (ed && canDelete() ? '<div style="margin-top:8px"><button class="btn danger block" onclick="confirmDel(this,()=>delRecordatorio(\'' + ed.id + '\'))">Eliminar tarea</button></div>' : '');
  openModal(h);
}
export async function saveRecordatorio(editId) {
  const texto = val('rc_texto');
  if (!texto) { toast('Escribí qué hay que hacer'); return; }
  const ex = editId ? de('recordatorios', 'id', editId)[0] : null;
  const para = val('rc_para');
  const o = Object.assign({}, ex || {}, { id: editId || uid(), texto, fecha: val('rc_fecha'), asignadoA: para, carId: val('rc_auto'), hecho: (ex || {}).hecho || false, creadoPor: (ex && ex.creadoPor) || yo() });
  if (await save('recordatorios', o)) { toast(para ? 'Tarea asignada a ' + nombreUsuario(para) : 'Tarea guardada'); recordatoriosView(); }
}
export async function toggleHechoRecordatorio(id, volver) {
  const r = de('recordatorios', 'id', id)[0]; if (!r) return;
  const hecho = !r.hecho;
  if (await save('recordatorios', Object.assign({}, r, { hecho, hechoPor: hecho ? yo() : '', hechoEl: hecho ? iso(today()) : '' }))) {
    if (volver === 'agenda') window.agendaView(); else if (volver === 'panel') toast(hecho ? 'Hecha' : 'Reabierta'); else recordatoriosView();
  }
}
export async function delRecordatorio(id) { if (await remove('recordatorios', id)) { toast('Tarea borrada'); recordatoriosView(); } }

// Para el Panel: mis tareas de hoy o atrasadas.
export function misTareasPendientes() {
  const hoy = iso(today());
  return S.recordatorios.filter(r => !r.hecho && esMia(r) && r.fecha && r.fecha <= hoy).sort((a, b) => a.fecha.localeCompare(b.fecha));
}
export function tarjetaMisTareas() {
  const L = misTareasPendientes(); if (!L.length) return '';
  const hoy = iso(today());
  return '<div class="card"><div class="row between"><b>Mis tareas</b><button class="btn sec sm" onclick="recordatoriosView()">Ver todas</button></div>' +
    L.slice(0, 5).map(r => { const c = r.carId ? de('cars', 'id', r.carId)[0] : null; const d = days(parse(r.fecha), today());
      return '<div class="row between small" style="padding:4px 0;gap:8px"><span style="min-width:0">' + esc(r.texto) + (c ? ' <span class="muted">· ' + esc(c.patente) + '</span>' : '') + (r.fecha < hoy ? ' <span style="color:var(--bad)">· hace ' + (-d) + (d === -1 ? ' día' : ' días') + '</span>' : '') + '</span>' +
        '<button class="btn sec sm" onclick="toggleHechoRecordatorio(\'' + r.id + '\',\'panel\')">Hecha</button></div>'; }).join('') +
    (L.length > 5 ? '<div class="small muted">y ' + (L.length - 5) + ' más</div>' : '') + '</div>';
}
