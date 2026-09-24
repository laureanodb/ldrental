import { S } from '../state.js';
import { val, uid, iso, today, esc } from '../utils.js';
import { INSPECCION_ITEMS } from '../constants.js';
import { openModal, toast } from '../modal.js';
import { save } from '../data.js';
import { carById, driverName } from '../calc.js';
import { carForm, actualizarKm, actualizarHistorialChoferes } from './car.js';

export function traspasoForm(carId) {
  const c = carById(carId);
  if (!c) { toast('Auto no encontrado'); return; }
  const salienteNombre = c.choferId ? driverName(c.choferId) : 'Sin chofer';
  const h = '<h3>Traspaso — ' + esc(c.patente) + '</h3>' +
  '<div class="small muted" style="margin-bottom:10px">Un solo checklist para la recepción del chofer saliente y la entrega al entrante.</div>' +
  '<div class="two"><label class="f"><span>Chofer saliente</span><input value="' + esc(salienteNombre) + '" disabled></label>' +
  '<label class="f"><span>Chofer entrante</span><select id="tr_entrante"><option value="">Elegir chofer</option>' +
  S.drivers.filter(d => d.id !== c.choferId && !d.inactivo).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre))).map(d => '<option value="' + d.id + '">' + esc(d.nombre) + '</option>').join('') + '</select></label></div>' +
  '<div class="two"><label class="f"><span>Fecha</span><input id="tr_fecha" type="date" value="' + iso(today()) + '"></label>' +
  '<label class="f"><span>Kilometraje</span><input id="tr_km" inputmode="numeric" value="' + esc(c.km) + '"></label></div>' +
  '<label class="f"><span>Combustible</span><select id="tr_combustible"><option value="lleno">Lleno</option><option value="3/4">3/4</option><option value="1/2">1/2</option><option value="1/4">1/4</option><option value="reserva">Reserva</option></select></label>' +
  '<div class="sec-t">Checklist (estado al momento del traspaso)</div>' + INSPECCION_ITEMS.map(x => '<label class="chk"><input type="checkbox" id="tr_' + x[0] + '" checked><span>' + x[1] + '</span></label>').join('') +
  '<label class="f" style="margin-top:14px"><span>Observaciones</span><textarea id="tr_notas"></textarea></label>' +
  '<div class="row"><button class="btn grow" onclick="saveTraspaso(\'' + c.id + '\')">Guardar traspaso</button><button class="btn sec" onclick="carForm(\'' + c.id + '\')">Cancelar</button></div>';
  openModal(h);
}
export async function saveTraspaso(carId) {
  const c = carById(carId);
  if (!c) return;
  const entranteId = val('tr_entrante');
  if (!entranteId) { toast('Elegí el chofer entrante'); return; }
  const items = {};
  INSPECCION_ITEMS.forEach(x => { items[x[0]] = document.getElementById('tr_' + x[0]).checked; });
  const fecha = val('tr_fecha') || iso(today());
  const km = val('tr_km');
  const combustible = val('tr_combustible');
  const notas = val('tr_notas');
  const traspasoId = uid();
  const registros = [];
  if (c.choferId) registros.push({ id: uid(), carId, driverId: c.choferId, tipo: 'recepcion', fecha, km, combustible, items, notas, traspasoId });
  registros.push({ id: uid(), carId, driverId: entranteId, tipo: 'entrega', fecha, km, combustible, items, notas, traspasoId });
  for (const r of registros) await save('inspecciones', r);
  const historialChoferes = actualizarHistorialChoferes(c, entranteId);
  await save('cars', Object.assign({}, c, { choferId: entranteId, historialChoferes }));
  if (km) await actualizarKm(carId, km);
  toast('Traspaso registrado');
  carForm(carId);
}
