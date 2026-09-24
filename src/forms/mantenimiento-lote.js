import { val, uid, iso, today, esc } from '../utils.js';
import { S, ui } from '../state.js';
import { MANTENIMIENTO_ITEMS } from '../constants.js';
import { openModal, closeModal, toast } from '../modal.js';
import { save } from '../data.js';
import { proveedoresActivos, carById } from '../calc.js';
import { actualizarKm } from './car.js';
import { render } from '../nav.js';

export function mantenimientoLoteForm() {
  const cars = S.cars.filter(c => !c.vendido).slice().sort((a, b) => String(a.patente).localeCompare(String(b.patente)));
  const h = '<h3>Mantenimiento preventivo en lote</h3>' +
  '<div class="small muted" style="margin-bottom:10px">Registrá el mismo mantenimiento en varios autos a la vez (ej: cambio de aceite de temporada).</div>' +
  '<label class="f"><span>Ítem</span><select id="ml_item"><option value="">Elegir…</option>' +
  MANTENIMIENTO_ITEMS.map(x => '<option value="' + x[0] + '">' + x[1] + '</option>').join('') + '<option value="__custom__">+ Ítem personalizado…</option></select></label>' +
  '<div id="ml_custom" style="display:none"><label class="f"><span>Nombre del ítem</span><input id="ml_customLabel"></label></div>' +
  '<div class="two"><label class="f"><span>Fecha</span><input id="ml_fecha" type="date" value="' + iso(today()) + '"></label>' +
  '<label class="f"><span>Costo por auto</span><input id="ml_costo" inputmode="decimal" value="0"></label></div>' +
  '<label class="f"><span>Taller / proveedor</span><select id="ml_proveedor"><option value="">Sin especificar</option>' + proveedoresActivos().map(p => '<option value="' + p.id + '">' + esc(p.nombre) + '</option>').join('') + '</select></label>' +
  '<label class="f"><span>Notas</span><textarea id="ml_notas"></textarea></label>' +
  '<div class="sec-t">Autos</div>' +
  '<div class="row" style="margin-bottom:6px"><button class="btn sec sm" onclick="marcarTodosLote(true)">Marcar todos</button><button class="btn sec sm" onclick="marcarTodosLote(false)">Ninguno</button></div>' +
  cars.map(c => '<label class="chk"><input type="checkbox" class="ml_car" value="' + c.id + '"><span>' + esc(c.patente) + '</span></label>').join('') +
  '<div class="row" style="margin-top:14px"><button class="btn grow" onclick="saveMantenimientoLote()">Registrar en los autos marcados</button><button class="btn sec" onclick="closeModal()">Cancelar</button></div>';
  openModal(h);
  document.getElementById('ml_item').onchange = function () {
    document.getElementById('ml_custom').style.display = this.value === '__custom__' ? '' : 'none';
  };
}
export function marcarTodosLote(v) {
  document.querySelectorAll('.ml_car').forEach(cb => { cb.checked = v; });
}
export async function saveMantenimientoLote() {
  let itemKey = val('ml_item');
  if (!itemKey) { toast('Elegí un ítem'); return; }
  let label = '';
  if (itemKey === '__custom__') {
    label = val('ml_customLabel');
    if (!label) { toast('Poné el nombre del ítem'); return; }
  } else {
    label = (MANTENIMIENTO_ITEMS.find(x => x[0] === itemKey) || [0, itemKey])[1];
  }
  const fecha = val('ml_fecha') || iso(today());
  const costo = +val('ml_costo') || 0;
  const proveedorId = val('ml_proveedor');
  const notas = val('ml_notas');
  const ids = Array.from(document.querySelectorAll('.ml_car:checked')).map(cb => cb.value);
  if (!ids.length) { toast('Marcá al menos un auto'); return; }
  for (const carId of ids) {
    const c = carById(carId);
    if (!c) continue;
    let key = itemKey === '__custom__' ? 'custom_' + uid() : itemKey;
    let plan = (c.mantenimientoPlan || []).slice();
    const idx = plan.findIndex(p => p.item === key);
    if (idx >= 0) plan[idx] = Object.assign({}, plan[idx], { ultimoKm: c.km || 0, ultimaFecha: fecha });
    else if (itemKey === '__custom__') plan = plan.concat([{ item: key, label, intervaloKm: null, intervaloMeses: null, ultimoKm: c.km || 0, ultimaFecha: fecha }]);
    const o = { id: uid(), carId, item: key, label, tipo: 'preventivo', fecha, km: c.km || 0, marca: '', especificacion: '', proveedorId, costo, checklist: {}, garantiaMeses: 0, garantiaKm: 0, sinFactura: false, notas };
    await save('mantenimientos', o);
    await save('cars', Object.assign({}, c, { mantenimientoPlan: plan }));
    if (c.km) await actualizarKm(carId, c.km);
  }
  closeModal();
  toast(ids.length + ' mantenimiento' + (ids.length === 1 ? '' : 's') + ' registrado' + (ids.length === 1 ? '' : 's'));
  ui.masView = 'mantenimiento';
  render();
}
