import { $, val, uid, iso, today, esc } from '../utils.js';
import { S } from '../state.js';
import { MANTENIMIENTO_CHECKLIST, STOCK_UNIDADES } from '../constants.js';
import { openModal, closeModal, toast } from '../modal.js';
import { save, remove } from '../data.js';
import { carById, proveedoresActivos, repuestosActivos } from '../calc.js';
import { carForm, actualizarKm, marcarEnTaller } from './car.js';
import { renderFiles } from '../files.js';
import { registrarSalidaStock } from './repuesto.js';

const unidadLabel = k => (STOCK_UNIDADES.find(x => x[0] === k) || [0, 'Unidad'])[1];

function proveedoresParaSelect(actualId) {
  const L = proveedoresActivos();
  if (actualId && !L.some(p => p.id === actualId)) {
    const actual = S.proveedores.find(p => p.id === actualId);
    if (actual) return [actual].concat(L);
  }
  return L;
}
export function mantenimientoForm(carId, editId, presetItem) {
  const cars = S.cars.filter(x => !x.vendido).slice().sort((a, b) => String(a.patente).localeCompare(String(b.patente)));
  const c = carById(carId) || (carId ? null : cars[0]);
  if (!c) { toast('Auto no encontrado'); return; }
  const ex = editId ? S.mantenimientos.find(x => x.id === editId) : null;
  const elegido = ex ? ex.item : (presetItem || '');
  const plan = c.mantenimientoPlan || [];
  const h = '<h3>' + (carId ? 'Mantenimiento — ' + esc(c.patente) : 'Nuevo mantenimiento') + '</h3>' +
  '<input type="hidden" id="m_carid" value="' + esc(c.id) + '">' +
  (carId ? '' : '<label class="f"><span>Auto</span><select id="m_car" onchange="onMantCar()">' + cars.map(x => '<option value="' + x.id + '"' + (x.id === c.id ? ' selected' : '') + '>' + esc(x.patente) + '</option>').join('') + '</select></label>') +
  '<label class="f"><span>Ítem</span><select id="m_item" onchange="onMantItem()">' +
    plan.map(p => '<option value="' + esc(p.item) + '"' + (elegido === p.item ? ' selected' : '') + '>' + esc(p.label || p.item) + '</option>').join('') +
    (ex ? '' : '<option value="__custom__">+ Ítem personalizado…</option>') +
  '</select></label>' +
  (ex ? '' : '<div id="m_custom" style="display:none" class="two"><label class="f"><span>Nombre del ítem</span><input id="m_customLabel"></label>' +
  '<label class="f"><span>Cada cuántos km <small>opcional</small></span><input id="m_customKm" inputmode="numeric"></label></div>') +
  '<div class="two"><label class="f"><span>Tipo</span><select id="m_tipo"><option value="preventivo"' + ((!ex || ex.tipo === 'preventivo') ? ' selected' : '') + '>Preventivo</option><option value="correctivo"' + (ex && ex.tipo === 'correctivo' ? ' selected' : '') + '>Correctivo</option></select></label>' +
  '<label class="f"><span>Fecha</span><input id="m_fecha" type="date" value="' + esc(ex ? ex.fecha : iso(today())) + '"></label></div>' +
  '<div class="two"><label class="f"><span>Km del auto</span><input id="m_km" inputmode="numeric" value="' + esc(ex ? ex.km : (c.km || '')) + '"></label>' +
  '<label class="f"><span>Costo</span><input id="m_costo" inputmode="decimal" value="' + esc(ex ? ex.costo : '') + '"></label></div>' +
  '<div class="two"><label class="f"><span>Marca / Producto <small>opcional</small></span><input id="m_marca" placeholder="ej: Shell, Michelin, Bosch..." value="' + esc(ex ? ex.marca : '') + '"></label>' +
  '<label class="f"><span>Especificación <small>opcional</small></span><input id="m_especificacion" placeholder="ej: 5W30 sintético, 195/65R15..." value="' + esc(ex ? ex.especificacion : '') + '"></label></div>' +
  '<label class="f"><span>Taller / proveedor</span><select id="m_proveedor"><option value="">Sin especificar</option>' + proveedoresParaSelect(ex && ex.proveedorId).map(p => '<option value="' + p.id + '"' + (ex && ex.proveedorId === p.id ? ' selected' : '') + '>' + esc(p.nombre) + '</option>').join('') + '</select></label>' +
  '<div class="sec-t">Checklist</div>' + MANTENIMIENTO_CHECKLIST.map(x => '<label class="chk"><input type="checkbox" id="mc_' + x[0] + '"' + (!ex || (ex.checklist || {})[x[0]] ? ' checked' : '') + '><span>' + x[1] + '</span></label>').join('') +
  '<div class="two"><label class="f"><span>Garantía <small>meses</small></span><input id="m_garMeses" inputmode="numeric" value="' + esc(ex ? ex.garantiaMeses || '' : '') + '"></label>' +
  '<label class="f"><span>Garantía <small>km</small></span><input id="m_garKm" inputmode="numeric" value="' + esc(ex ? ex.garantiaKm || '' : '') + '"></label></div>' +
  (c.tipo !== 'taller' ? '<label class="chk"><input type="checkbox" id="m_taller"><span>El auto queda parado en el taller</span></label>' : '') +
  '<label class="chk"><input type="checkbox" id="m_sinFactura"' + (ex && ex.sinFactura ? ' checked' : '') + '><span>Sin factura</span></label>' +
  (!ex && repuestosActivos().length ? '<div class="sec-t">Repuestos usados <small>opcional, descuenta del stock</small></div><div id="mnt_repuestos"></div><button type="button" class="btn sec sm" style="margin-bottom:14px" onclick="addRepuestoMantRow()">+ Agregar repuesto</button>' : '') +
  '<label class="f"><span>Notas</span><textarea id="m_notas">' + esc(ex ? ex.notas : '') + '</textarea></label>' +
  '<div class="sec-t">Archivos</div><div id="files"></div><div id="fstatus" class="small" style="margin:-4px 0 12px;overflow-wrap:anywhere"></div>' +
  '<div class="row"><button class="btn grow" onclick="saveMantenimiento(' + (ex ? "'" + ex.id + "'" : 'null') + ')">Guardar</button><button class="btn sec" onclick="' + (carId ? "carForm('" + c.id + "')" : 'closeModal()') + '">Cancelar</button></div>';
  openModal(h);
  onMantItem();
  renderFiles('mantenimientos', ex ? ex.id : null);
}
export function onMantCar() { mantenimientoForm(val('m_car')); }
export function onMantItem() {
  const sel = $('#m_item'); if (!sel) return;
  const box = $('#m_custom'); if (box) box.style.display = sel.value === '__custom__' ? '' : 'none';
}
function repuestoRowMant() {
  return '<div class="two mnt-rep"><select class="mnt-rep-id">' + repuestosActivos().map(r => '<option value="' + r.id + '">' + esc(r.nombre) + ' (' + (r.stockActual || 0) + ' ' + esc(unidadLabel(r.unidad)) + ')</option>').join('') + '</select>' +
  '<div class="row"><input class="mnt-rep-cant grow" inputmode="decimal" placeholder="Cantidad" value="1"><button type="button" class="btn danger sm" onclick="this.closest(\'.mnt-rep\').remove()">✕</button></div></div>';
}
export function addRepuestoMantRow() { const el = $('#mnt_repuestos'); if (el) el.insertAdjacentHTML('beforeend', repuestoRowMant()); }
export async function saveMantenimiento(editId) {
  const carId = val('m_carid');
  const c = carById(carId);
  if (!c) return;
  let itemKey = val('m_item'), label = '';
  let plan = (c.mantenimientoPlan || []).slice();
  const fecha = val('m_fecha') || iso(today());
  const km = +val('m_km') || 0;
  if (itemKey === '__custom__') {
    label = val('m_customLabel');
    if (!label) { toast('Poné el nombre del ítem'); return; }
    itemKey = 'custom_' + uid();
    const intervaloKm = +val('m_customKm') || null;
    plan = plan.concat([{ item: itemKey, label, intervaloKm, intervaloMeses: null, ultimoKm: km, ultimaFecha: fecha }]);
  } else {
    const idx = plan.findIndex(p => p.item === itemKey);
    if (idx >= 0) { label = plan[idx].label || itemKey; plan[idx] = Object.assign({}, plan[idx], { ultimoKm: km, ultimaFecha: fecha }); }
  }
  const checklist = {}; MANTENIMIENTO_CHECKLIST.forEach(x => { const cb = document.getElementById('mc_' + x[0]); checklist[x[0]] = cb ? cb.checked : false; });
  const o = {
    id: editId || uid(), carId, item: itemKey, label, tipo: val('m_tipo'), fecha, km,
    marca: val('m_marca'), especificacion: val('m_especificacion'),
    proveedorId: val('m_proveedor'), costo: +val('m_costo') || 0, checklist,
    garantiaMeses: +val('m_garMeses') || 0, garantiaKm: +val('m_garKm') || 0,
    sinFactura: document.getElementById('m_sinFactura').checked,
    notas: val('m_notas'), files: (editId && S.mantenimientos.find(x => x.id === editId) || {}).files || [],
  };
  if (!(await save('mantenimientos', o))) return;
  await save('cars', Object.assign({}, c, { mantenimientoPlan: plan }));
  if (km) await actualizarKm(carId, km);
  const marcarTaller = document.getElementById('m_taller');
  if (marcarTaller && marcarTaller.checked) await marcarEnTaller(carId);
  if (!editId) {
    const filasRepuesto = [...document.querySelectorAll('.mnt-rep')];
    for (const fila of filasRepuesto) {
      const repId = fila.querySelector('.mnt-rep-id').value;
      const cant = +fila.querySelector('.mnt-rep-cant').value;
      if (repId && cant > 0) await registrarSalidaStock(repId, cant, fecha, carId, 'Usado en mantenimiento: ' + (label || itemKey));
    }
    toast('Mantenimiento registrado. Podés adjuntar la factura o una foto.'); mantenimientoForm(carId, o.id);
  }
  else { closeModal(); toast('Mantenimiento guardado'); carForm(carId); }
}
export async function delMantenimiento(id) {
  const m = S.mantenimientos.find(x => x.id === id);
  if (await remove('mantenimientos', id)) { toast('Mantenimiento borrado'); if (m) carForm(m.carId); }
}
export function editarPlanMantenimiento(carId) {
  const c = carById(carId);
  if (!c) { toast('Auto no encontrado'); return; }
  const plan = c.mantenimientoPlan || [];
  if (!plan.length) { toast('Este auto no tiene ítems en su plan'); return; }
  const h = '<h3>Editar plan — ' + esc(c.patente) + '</h3>' +
  '<div class="small muted" style="margin-bottom:12px">Dejá vacío el campo que no aplique para cada ítem. Se avisa cuando se cumpla cualquiera de los dos, lo que llegue primero.</div>' +
  plan.map((p, i) => '<div class="sec-t">' + esc(p.label || p.item) + '</div><div class="two"><label class="f"><span>Cada cuántos km</span><input id="ep_km_' + i + '" inputmode="numeric" value="' + esc(p.intervaloKm || '') + '"></label>' +
  '<label class="f"><span>Cada cuántos meses</span><input id="ep_meses_' + i + '" inputmode="numeric" value="' + esc(p.intervaloMeses || '') + '"></label></div>').join('') +
  '<div class="row" style="margin-top:14px"><button class="btn grow" onclick="guardarPlanMantenimiento(\'' + c.id + '\')">Guardar</button><button class="btn sec" onclick="closeModal()">Cancelar</button></div>';
  openModal(h);
}
export async function guardarPlanMantenimiento(carId) {
  const c = carById(carId);
  if (!c) return;
  const plan = (c.mantenimientoPlan || []).map((p, i) => Object.assign({}, p, {
    intervaloKm: +val('ep_km_' + i) || null,
    intervaloMeses: +val('ep_meses_' + i) || null,
  }));
  if (await save('cars', Object.assign({}, c, { mantenimientoPlan: plan }))) { closeModal(); toast('Plan de mantenimiento actualizado'); }
}
