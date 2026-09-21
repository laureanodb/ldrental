import { val, uid, iso, today, esc } from '../utils.js';
import { INSPECCION_ITEMS } from '../constants.js';
import { openModal, closeModal, toast } from '../modal.js';
import { save, remove } from '../data.js';
import { carById } from '../calc.js';

export function inspeccionForm(carId) {
  const c = carById(carId);
  if (!c) { toast('Auto no encontrado'); return; }
  const h = '<h3>Inspección — ' + esc(c.patente) + '</h3>' +
  '<div class="two"><label class="f"><span>Tipo</span><select id="i_tipo"><option value="entrega">Entrega al chofer</option><option value="recepcion">Recepción del chofer</option></select></label>' +
  '<label class="f"><span>Fecha</span><input id="i_fecha" type="date" value="' + iso(today()) + '"></label></div>' +
  '<div class="two"><label class="f"><span>Kilometraje</span><input id="i_km" inputmode="numeric" value="' + esc(c.km) + '"></label>' +
  '<label class="f"><span>Combustible</span><select id="i_combustible"><option value="lleno">Lleno</option><option value="3/4">3/4</option><option value="1/2">1/2</option><option value="1/4">1/4</option><option value="reserva">Reserva</option></select></label></div>' +
  '<div class="sec-t">Checklist</div>' + INSPECCION_ITEMS.map(x => '<label class="chk"><input type="checkbox" id="i_' + x[0] + '" checked><span>' + x[1] + '</span></label>').join('') +
  '<label class="f" style="margin-top:14px"><span>Observaciones</span><textarea id="i_notas"></textarea></label>' +
  '<div class="row"><button class="btn grow" onclick="saveInspeccion(\'' + c.id + '\')">Guardar</button><button class="btn sec" onclick="carForm(\'' + c.id + '\')">Cancelar</button></div>';
  openModal(h);
}
export async function saveInspeccion(carId) {
  const items = {};
  INSPECCION_ITEMS.forEach(x => { items[x[0]] = document.getElementById('i_' + x[0]).checked; });
  const c = carById(carId);
  const o = { id: uid(), carId, driverId: (c || {}).choferId || '', tipo: val('i_tipo'), fecha: val('i_fecha') || iso(today()), km: val('i_km'), combustible: val('i_combustible'), items, notas: val('i_notas') };
  if (await save('inspecciones', o)) { closeModal(); toast('Inspección guardada'); }
}
export async function delInspeccion(id) { if (await remove('inspecciones', id)) toast('Inspección borrada'); }
