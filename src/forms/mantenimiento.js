import { $, val, uid, iso, today, esc } from '../utils.js';
import { S } from '../state.js';
import { MANTENIMIENTO_CHECKLIST } from '../constants.js';
import { openModal, closeModal, toast } from '../modal.js';
import { save, remove } from '../data.js';
import { carById } from '../calc.js';
import { carForm, actualizarKm, marcarEnTaller } from './car.js';
import { renderFiles } from '../files.js';

export function mantenimientoForm(carId, editId) {
  const c = carById(carId);
  if (!c) { toast('Auto no encontrado'); return; }
  const ex = editId ? S.mantenimientos.find(x => x.id === editId) : null;
  const plan = c.mantenimientoPlan || [];
  const h = '<h3>Mantenimiento — ' + esc(c.patente) + '</h3>' +
  '<label class="f"><span>Ítem</span><select id="m_item" onchange="onMantItem()">' +
    plan.map(p => '<option value="' + esc(p.item) + '"' + ((ex ? ex.item : '') === p.item ? ' selected' : '') + '>' + esc(p.label || p.item) + '</option>').join('') +
    (ex ? '' : '<option value="__custom__">+ Ítem personalizado…</option>') +
  '</select></label>' +
  (ex ? '' : '<div id="m_custom" style="display:none" class="two"><label class="f"><span>Nombre del ítem</span><input id="m_customLabel"></label>' +
  '<label class="f"><span>Cada cuántos km <small>opcional</small></span><input id="m_customKm" inputmode="numeric"></label></div>') +
  '<div class="two"><label class="f"><span>Tipo</span><select id="m_tipo"><option value="preventivo"' + ((!ex || ex.tipo === 'preventivo') ? ' selected' : '') + '>Preventivo</option><option value="correctivo"' + (ex && ex.tipo === 'correctivo' ? ' selected' : '') + '>Correctivo</option></select></label>' +
  '<label class="f"><span>Fecha</span><input id="m_fecha" type="date" value="' + esc(ex ? ex.fecha : iso(today())) + '"></label></div>' +
  '<div class="two"><label class="f"><span>Km del auto</span><input id="m_km" inputmode="numeric" value="' + esc(ex ? ex.km : (c.km || '')) + '"></label>' +
  '<label class="f"><span>Costo</span><input id="m_costo" inputmode="decimal" value="' + esc(ex ? ex.costo : '') + '"></label></div>' +
  '<label class="f"><span>Taller / proveedor</span><select id="m_proveedor"><option value="">Sin especificar</option>' + S.proveedores.slice().sort((a, b) => String(a.nombre).localeCompare(String(b.nombre))).map(p => '<option value="' + p.id + '"' + (ex && ex.proveedorId === p.id ? ' selected' : '') + '>' + esc(p.nombre) + '</option>').join('') + '</select></label>' +
  '<div class="sec-t">Checklist</div>' + MANTENIMIENTO_CHECKLIST.map(x => '<label class="chk"><input type="checkbox" id="mc_' + x[0] + '"' + (!ex || (ex.checklist || {})[x[0]] ? ' checked' : '') + '><span>' + x[1] + '</span></label>').join('') +
  '<div class="two"><label class="f"><span>Garantía <small>meses</small></span><input id="m_garMeses" inputmode="numeric" value="' + esc(ex ? ex.garantiaMeses || '' : '') + '"></label>' +
  '<label class="f"><span>Garantía <small>km</small></span><input id="m_garKm" inputmode="numeric" value="' + esc(ex ? ex.garantiaKm || '' : '') + '"></label></div>' +
  (c.tipo !== 'taller' ? '<label class="chk"><input type="checkbox" id="m_taller"><span>El auto queda parado en el taller</span></label>' : '') +
  '<label class="f"><span>Notas</span><textarea id="m_notas">' + esc(ex ? ex.notas : '') + '</textarea></label>' +
  '<div class="sec-t">Archivos</div><div id="files"></div><div id="fstatus" class="small" style="margin:-4px 0 12px;overflow-wrap:anywhere"></div>' +
  '<div class="row"><button class="btn grow" onclick="saveMantenimiento(\'' + c.id + '\'' + (ex ? ",'" + ex.id + "'" : '') + ')">Guardar</button><button class="btn sec" onclick="carForm(\'' + c.id + '\')">Cancelar</button></div>';
  openModal(h);
  onMantItem();
  renderFiles('mantenimientos', ex ? ex.id : null);
}
export function onMantItem() {
  const sel = $('#m_item'); if (!sel) return;
  const box = $('#m_custom'); if (box) box.style.display = sel.value === '__custom__' ? '' : 'none';
}
export async function saveMantenimiento(carId, editId) {
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
    proveedorId: val('m_proveedor'), costo: +val('m_costo') || 0, checklist,
    garantiaMeses: +val('m_garMeses') || 0, garantiaKm: +val('m_garKm') || 0,
    notas: val('m_notas'), files: (editId && S.mantenimientos.find(x => x.id === editId) || {}).files || [],
  };
  if (!(await save('mantenimientos', o))) return;
  await save('cars', Object.assign({}, c, { mantenimientoPlan: plan }));
  if (km) await actualizarKm(carId, km);
  const marcarTaller = document.getElementById('m_taller');
  if (marcarTaller && marcarTaller.checked) await marcarEnTaller(carId);
  if (!editId) { toast('Mantenimiento registrado. Podés adjuntar la factura o una foto.'); mantenimientoForm(carId, o.id); }
  else { closeModal(); toast('Mantenimiento guardado'); carForm(carId); }
}
export async function delMantenimiento(id) {
  const m = S.mantenimientos.find(x => x.id === id);
  if (await remove('mantenimientos', id)) { toast('Mantenimiento borrado'); if (m) carForm(m.carId); }
}
