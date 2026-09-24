import { S } from '../state.js';
import { val, uid, esc, iso, today, fdate } from '../utils.js';
import { openModal, toast, confirmDel } from '../modal.js';
import { save, remove } from '../data.js';
import { canDelete } from '../roles.js';

export function recordatoriosView(editId) {
  const R = S.recordatorios.slice().sort((a, b) => (Boolean(a.hecho) - Boolean(b.hecho)) || String(a.fecha || '').localeCompare(b.fecha || ''));
  const ed = editId ? S.recordatorios.find(x => x.id === editId) : null;
  let h = '<h3>Recordatorios</h3><div class="small muted" style="margin-bottom:10px">Tareas manuales con fecha, como "llamar al contador" o "renovar el seguro de la oficina".</div>';
  h += R.length ? R.map(r => '<div class="card row"><div class="grow tap" onclick="recordatoriosView(\'' + r.id + '\')"><div style="' + (r.hecho ? 'text-decoration:line-through;color:var(--muted)' : '') + '">' + esc(r.texto) + '</div><div class="small muted">' + (r.fecha ? fdate(r.fecha) : 'Sin fecha') + '</div></div>' +
  '<button class="btn sec sm" onclick="event.stopPropagation();toggleHechoRecordatorio(\'' + r.id + '\')">' + (r.hecho ? 'Reabrir' : 'Hecho') + '</button></div>').join('') : '<div class="small muted" style="margin-bottom:8px">Sin recordatorios cargados.</div>';
  h += '<div class="sec-t">' + (ed ? 'Editar recordatorio' : 'Agregar recordatorio') + '</div>' +
  '<label class="f"><span>Texto</span><input id="rc_texto" value="' + esc(ed ? ed.texto : '') + '"></label>' +
  '<label class="f"><span>Fecha</span><input id="rc_fecha" type="date" value="' + esc(ed ? ed.fecha : iso(today())) + '"></label>' +
  '<div class="row"><button class="btn grow" onclick="saveRecordatorio(' + (ed ? "'" + ed.id + "'" : 'null') + ')">Guardar</button>' + (ed ? '<button class="btn sec" onclick="recordatoriosView()">Cancelar</button>' : '<button class="btn sec" onclick="closeModal()">Cerrar</button>') + '</div>' +
  (ed && canDelete() ? '<div style="margin-top:8px"><button class="btn danger block" onclick="confirmDel(this,()=>delRecordatorio(\'' + ed.id + '\'))">Eliminar recordatorio</button></div>' : '');
  openModal(h);
}
export async function saveRecordatorio(editId) {
  const texto = val('rc_texto');
  if (!texto) { toast('Falta el texto'); return; }
  const ex = editId ? S.recordatorios.find(x => x.id === editId) : null;
  const o = { id: editId || uid(), texto, fecha: val('rc_fecha'), hecho: (ex || {}).hecho || false };
  if (await save('recordatorios', o)) { toast('Recordatorio guardado'); recordatoriosView(); }
}
export async function toggleHechoRecordatorio(id) {
  const r = S.recordatorios.find(x => x.id === id); if (!r) return;
  if (await save('recordatorios', Object.assign({}, r, { hecho: !r.hecho }))) recordatoriosView();
}
export async function delRecordatorio(id) { if (await remove('recordatorios', id)) { toast('Recordatorio borrado'); recordatoriosView(); } }
