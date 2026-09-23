import { val, uid, iso, today, esc, money, fdate } from '../utils.js';
import { S } from '../state.js';
import { GASTO_CATS } from '../constants.js';
import { openModal, closeModal, toast, confirmDel } from '../modal.js';
import { save, remove } from '../data.js';
import { proveedoresActivos, badge } from '../calc.js';
import { canDelete } from '../roles.js';

const catLabel = k => (GASTO_CATS.find(x => x[0] === k) || [0, 'Gasto'])[1];

export function gastosGenerales() {
  return S.gastos.filter(g => !g.carId).sort((a, b) => b.fecha.localeCompare(a.fecha));
}
export function gastosGeneralesDelMes() {
  const mesActual = iso(today()).slice(0, 7);
  return gastosGenerales().filter(g => (g.fecha || '').slice(0, 7) === mesActual).reduce((a, g) => a + (+g.costo || 0), 0);
}
export function gastosGeneralesView() {
  const G = gastosGenerales();
  const R = S.gastosrecurrentes.slice().sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
  let h = '<h3>Gastos generales de flota</h3>' +
  '<div class="small muted" style="margin-bottom:10px">Gastos que no son de un auto puntual: herramientas, insumos, repuestos en stock, alquileres, sueldos, etc.</div>' +
  '<div class="card row between" style="margin-bottom:10px"><span class="muted">Gastado este mes</span><b>' + money(gastosGeneralesDelMes()) + '</b></div>';
  h += '<div class="sec-t">Gastos recurrentes</div>';
  h += R.length ? R.map(r => '<div class="card tap" onclick="gastoRecurrenteForm(\'' + r.id + '\')"><div class="row between"><div>' + esc(r.nombre) + ' <span class="small muted">' + esc(catLabel(r.categoria)) + '</span></div>' + (r.activo === false ? badge('mute', 'Pausado') : badge('ok', money(r.montoMensual) + '/mes')) + '</div></div>').join('') : '<div class="small muted" style="margin-bottom:8px">Sin gastos recurrentes cargados.</div>';
  h += '<button class="btn sec block" style="margin:8px 0 20px" onclick="gastoRecurrenteForm()">+ Nuevo gasto recurrente</button>';
  h += '<div class="sec-t">Gastos puntuales</div>';
  h += G.length ? G.map(g => '<div class="card tap" onclick="gastoGeneralForm(\'' + g.id + '\')"><div class="row between"><div>' + money(g.costo) + ' <span class="small muted">' + esc(catLabel(g.categoria)) + (g.sinFactura ? ' · sin factura' : '') + '</span></div><span class="small muted">' + fdate(g.fecha) + '</span></div>' + (g.proveedor || g.descripcion ? '<div class="small muted" style="margin-top:2px">' + esc([g.proveedor, g.descripcion].filter(Boolean).join(' · ')) + '</div>' : '') + '</div>').join('') : '<div class="small muted" style="margin-bottom:8px">Sin gastos generales cargados.</div>';
  h += '<button class="btn sec block" style="margin:8px 0 20px" onclick="gastoGeneralForm()">+ Registrar gasto general</button>' +
  '<button class="btn sec block" onclick="closeModal()">Cerrar</button>';
  openModal(h);
}
export function gastoGeneralForm(editId) {
  const ex = editId ? S.gastos.find(x => x.id === editId) : null;
  const h = '<h3>' + (ex ? 'Editar gasto general' : 'Nuevo gasto general') + '</h3>' +
  '<div class="two"><label class="f"><span>Categoría</span><select id="gg_cat">' + GASTO_CATS.map(x => '<option value="' + x[0] + '"' + (ex && ex.categoria === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select></label>' +
  '<label class="f"><span>Fecha</span><input id="gg_fecha" type="date" value="' + esc(ex ? ex.fecha : iso(today())) + '"></label></div>' +
  '<label class="f"><span>Costo</span><input id="gg_costo" inputmode="decimal" value="' + esc(ex ? ex.costo : '') + '"></label>' +
  '<label class="f"><span>Proveedor <small>opcional</small></span><select id="gg_proveedorSel" onchange="document.getElementById(\'gg_proveedorOtroBox\').style.display=this.value===\'__otro__\'?\'\':\'none\'"><option value="">Sin especificar</option>' + proveedoresActivos().map(p => '<option value="' + esc(p.nombre) + '"' + (ex && ex.proveedor === p.nombre ? ' selected' : '') + '>' + esc(p.nombre) + '</option>').join('') + '<option value="__otro__">Otro (escribir)</option></select></label>' +
  '<div id="gg_proveedorOtroBox" style="display:none"><label class="f"><span>Nombre del proveedor</span><input id="gg_proveedorOtro" value="' + esc(ex ? ex.proveedor : '') + '"></label></div>' +
  '<label class="f"><span>Descripción</span><textarea id="gg_desc">' + esc(ex ? ex.descripcion : '') + '</textarea></label>' +
  '<label class="chk"><input type="checkbox" id="gg_sinFactura"' + (ex && ex.sinFactura ? ' checked' : '') + '><span>Sin factura</span></label>' +
  '<div class="row"><button class="btn grow" onclick="saveGastoGeneral(' + (ex ? "'" + ex.id + "'" : 'null') + ')">Guardar</button><button class="btn sec" onclick="gastosGeneralesView()">Cancelar</button></div>' +
  (ex && canDelete() ? '<div style="margin-top:8px"><button class="btn danger block" onclick="confirmDel(this,()=>delGastoGeneral(\'' + ex.id + '\'))">Eliminar gasto</button></div>' : '');
  openModal(h);
}
export async function saveGastoGeneral(editId) {
  const costo = +val('gg_costo');
  if (!costo || costo <= 0) { toast('Poné el costo del gasto'); return; }
  const selProveedor = val('gg_proveedorSel');
  const proveedor = selProveedor === '__otro__' ? val('gg_proveedorOtro') : selProveedor;
  const ex = editId ? S.gastos.find(x => x.id === editId) : null;
  const o = {
    id: editId || uid(), carId: '', categoria: val('gg_cat'), fecha: val('gg_fecha') || iso(today()), costo,
    proveedor, descripcion: val('gg_desc'), sinFactura: document.getElementById('gg_sinFactura').checked,
    generadoAuto: (ex && ex.generadoAuto) || false, recurrenteId: (ex && ex.recurrenteId) || '',
  };
  if (await save('gastos', o)) { toast('Gasto guardado'); gastosGeneralesView(); }
}
export async function delGastoGeneral(id) {
  if (await remove('gastos', id)) { toast('Gasto borrado'); gastosGeneralesView(); }
}
export function gastoRecurrenteForm(editId) {
  const ex = editId ? S.gastosrecurrentes.find(x => x.id === editId) : null;
  const h = '<h3>' + (ex ? 'Editar gasto recurrente' : 'Nuevo gasto recurrente') + '</h3>' +
  '<div class="small muted" style="margin-bottom:10px">Se genera solo un gasto general por mes con este monto, mientras esté activo.</div>' +
  '<label class="f"><span>Nombre</span><input id="gr_nombre" placeholder="ej: Alquiler del depósito" value="' + esc(ex ? ex.nombre : '') + '"></label>' +
  '<div class="two"><label class="f"><span>Categoría</span><select id="gr_cat">' + GASTO_CATS.map(x => '<option value="' + x[0] + '"' + (ex && ex.categoria === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select></label>' +
  '<label class="f"><span>Monto mensual</span><input id="gr_monto" inputmode="decimal" value="' + esc(ex ? ex.montoMensual : '') + '"></label></div>' +
  '<label class="chk"><input type="checkbox" id="gr_activo"' + (!ex || ex.activo !== false ? ' checked' : '') + '><span>Activo (se genera automáticamente cada mes)</span></label>' +
  '<div class="row"><button class="btn grow" onclick="saveGastoRecurrente(' + (ex ? "'" + ex.id + "'" : 'null') + ')">Guardar</button><button class="btn sec" onclick="gastosGeneralesView()">Cancelar</button></div>' +
  (ex && canDelete() ? '<div style="margin-top:8px"><button class="btn danger block" onclick="confirmDel(this,()=>delGastoRecurrente(\'' + ex.id + '\'))">Eliminar recurrente</button></div>' : '');
  openModal(h);
}
export async function saveGastoRecurrente(editId) {
  const nombre = val('gr_nombre');
  if (!nombre) { toast('Poné un nombre'); return; }
  const o = { id: editId || uid(), nombre, categoria: val('gr_cat'), montoMensual: +val('gr_monto') || 0, activo: document.getElementById('gr_activo').checked };
  if (await save('gastosrecurrentes', o)) { toast('Gasto recurrente guardado'); gastosGeneralesView(); }
}
export async function delGastoRecurrente(id) {
  if (await remove('gastosrecurrentes', id)) { toast('Gasto recurrente borrado'); gastosGeneralesView(); }
}
