import { S } from '../state.js';
import { val, uid, esc, iso, today, fdate, money } from '../utils.js';
import { openModal, closeModal, toast, confirmDel } from '../modal.js';
import { save, remove } from '../data.js';
import { canDelete } from '../roles.js';
import { badge, gastoTotalProveedor } from '../calc.js';
import { RATINGS } from '../constants.js';

const ratingLabel = r => (RATINGS.find(x => x[0] === r) || [])[1];
const ratingCls = r => r === 'malo' ? 'bad' : r === 'regular' ? 'soft' : 'ok';

export function proveedoresView(editId) {
  const P = S.proveedores.slice().sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
  const ed = editId ? S.proveedores.find(x => x.id === editId) : null;
  let h = '<h3>Proveedores y talleres</h3>';
  h += P.length ? P.map(p => {
    const total = gastoTotalProveedor(p.id);
    return '<div class="card tap" onclick="proveedoresView(\'' + p.id + '\')"><div class="row between"><div>' + (p.preferido ? '★ ' : '') + esc(p.nombre) + (p.inactivo ? ' ' + badge('mute', 'Inactivo') : '') + '</div>' + (ratingLabel(p.rating) ? badge(ratingCls(p.rating), ratingLabel(p.rating)) : '') + '</div><div class="small muted">' + esc([p.rubro, p.tel].filter(Boolean).join(' · ')) + (total ? ' · ' + money(total) + ' gastado' : '') + '</div>' +
    (p.deudaPendiente ? '<div class="small" style="color:var(--bad)">Pendiente de pago: ' + money(p.deudaPendiente) + (p.fechaPago ? ' · vence ' + fdate(p.fechaPago) : '') + '</div>' : '') +
    (p.notas ? '<div class="small muted">' + esc(p.notas) + '</div>' : '') + '</div>';
  }).join('') : '<div class="small muted" style="margin-bottom:8px">Todavía no cargaste proveedores.</div>';
  h += '<div class="sec-t">' + (ed ? 'Editar proveedor' : 'Agregar proveedor') + '</div>' +
  '<label class="f"><span>Nombre</span><input id="pr_nombre" value="' + esc(ed ? ed.nombre : '') + '"></label>' +
  '<div class="two"><label class="f"><span>Rubro</span><input id="pr_rubro" placeholder="Taller, gomería..." value="' + esc(ed ? ed.rubro : '') + '"></label>' +
  '<label class="f"><span>Teléfono</span><input id="pr_tel" type="tel" value="' + esc(ed ? ed.tel : '') + '"></label></div>' +
  '<label class="f"><span>Calificación</span><select id="pr_rating"><option value="">Sin calificar</option>' + RATINGS.map(x => '<option value="' + x[0] + '"' + (ed && ed.rating === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select></label>' +
  '<label class="chk"><input type="checkbox" id="pr_preferido"' + (ed && ed.preferido ? ' checked' : '') + '><span>Preferido en su rubro (aparece primero al elegirlo)</span></label>' +
  '<div class="sec-t">Cuenta por pagar <small class="muted">opcional</small></div>' +
  '<div class="two"><label class="f"><span>Monto pendiente</span><input id="pr_deuda" inputmode="decimal" value="' + esc(ed && ed.deudaPendiente || '') + '"></label>' +
  '<label class="f"><span>Fecha de pago</span><input id="pr_fechaPago" type="date" value="' + esc(ed ? ed.fechaPago : '') + '"></label></div>' +
  '<label class="f"><span>Notas</span><textarea id="pr_notas">' + esc(ed ? ed.notas : '') + '</textarea></label>' +
  (ed ? '<label class="chk"><input type="checkbox" id="pr_inactivo"' + (ed.inactivo ? ' checked' : '') + '><span>Inactivo (no aparece para elegir en gastos/mantenimiento)</span></label>' : '') +
  '<div class="row"><button class="btn grow" onclick="saveProveedor(' + (ed ? "'" + ed.id + "'" : 'null') + ')">Guardar</button>' + (ed ? '<button class="btn sec" onclick="proveedoresView()">Cancelar</button>' : '<button class="btn sec" onclick="closeModal()">Cerrar</button>') + '</div>' +
  (ed && canDelete() ? '<div style="margin-top:8px"><button class="btn danger block" onclick="confirmDel(this,()=>delProveedor(\'' + ed.id + '\'))">Eliminar proveedor</button></div>' : '');
  openModal(h);
}
export async function saveProveedor(editId) {
  const nombre = val('pr_nombre');
  if (!nombre) { toast('Falta el nombre'); return; }
  const inactivoEl = document.getElementById('pr_inactivo');
  const o = {
    id: editId || uid(), nombre, rubro: val('pr_rubro'), tel: val('pr_tel'), rating: val('pr_rating'), notas: val('pr_notas'),
    preferido: document.getElementById('pr_preferido').checked,
    deudaPendiente: +val('pr_deuda') || 0, fechaPago: val('pr_fechaPago'),
    inactivo: inactivoEl ? inactivoEl.checked : false,
  };
  if (await save('proveedores', o)) { toast('Proveedor guardado'); proveedoresView(); }
}
export async function delProveedor(id) { if (await remove('proveedores', id)) { toast('Proveedor borrado'); proveedoresView(); } }
