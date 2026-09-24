import { S } from '../state.js';
import { val, iso, today, esc } from '../utils.js';
import { save } from '../data.js';
import { carById, driverName, plate } from '../calc.js';
import { openModal, toast } from '../modal.js';
import { carForm } from './car.js';

export function reemplazoTemporalForm(carId) {
  const c = carById(carId);
  if (!c || c.tipo !== 'taller') { toast('El auto tiene que estar en taller'); return; }
  if (!c.choferId) { toast('Este auto no tiene chofer asignado'); return; }
  const disponibles = S.cars.filter(x => x.tipo === 'disponible' && !x.vendido);
  if (!disponibles.length) { toast('No hay autos disponibles para asignar como reemplazo'); return; }
  const h = '<h3>Auto de reemplazo temporal</h3>' +
  '<div class="small muted" style="margin-bottom:10px">' + esc(driverName(c.choferId)) + ' va a manejar este auto mientras ' + plate(c.patente) + ' está en el taller.</div>' +
  '<label class="f"><span>Auto disponible</span><select id="rt_auto"><option value="">Elegir auto…</option>' +
  disponibles.map(x => '<option value="' + x.id + '">' + esc(x.patente) + '</option>').join('') + '</select></label>' +
  '<div class="row" style="margin-top:14px"><button class="btn grow" onclick="saveReemplazoTemporal(\'' + c.id + '\')">Asignar</button><button class="btn sec" onclick="carForm(\'' + c.id + '\')">Cancelar</button></div>';
  openModal(h);
}
export async function saveReemplazoTemporal(carId) {
  const c = carById(carId);
  if (!c) return;
  const tempId = val('rt_auto');
  const temp = carById(tempId);
  if (!temp) { toast('Elegí un auto'); return; }
  const choferId = c.choferId;
  await save('cars', Object.assign({}, c, {
    reemplazoTemporalActivo: true, reemplazoTemporalCarId: tempId, reemplazoTemporalChoferId: choferId, reemplazoTemporalDesde: iso(today()),
  }));
  await save('cars', Object.assign({}, temp, {
    tipo: 'alquiler', choferId, monto: temp.monto || c.monto, inicio: iso(today()), esReemplazoTemporalDe: carId,
  }));
  toast('Reemplazo temporal asignado');
  carForm(carId);
}
export async function finalizarReemplazoTemporal(carId) {
  const c = carById(carId);
  if (!c || !c.reemplazoTemporalActivo) return;
  const temp = carById(c.reemplazoTemporalCarId);
  if (temp) {
    await save('cars', Object.assign({}, temp, { tipo: 'disponible', choferId: '', esReemplazoTemporalDe: '' }));
  }
  await save('cars', Object.assign({}, c, {
    reemplazoTemporalActivo: false, reemplazoTemporalCarId: '', reemplazoTemporalChoferId: '', reemplazoTemporalDesde: '',
  }));
  toast('Reemplazo temporal finalizado');
}
