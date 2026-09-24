import { S } from '../state.js';
import { val, iso, today, esc } from '../utils.js';
import { save } from '../data.js';
import { carById, driverName } from '../calc.js';
import { openModal, toast } from '../modal.js';
import { carForm, actualizarHistorialChoferes, actualizarHistorialMonto } from './car.js';
import { driverForm } from './driver.js';

function campos(prefix, tipo, c) {
  return '<label class="f"><span>Tipo</span><select id="' + prefix + '_tipo" onchange="onAsignacionTipo(\'' + prefix + '\')"><option value="alquiler"' + (tipo === 'alquiler' ? ' selected' : '') + '>Alquiler</option><option value="financiado"' + (tipo === 'financiado' ? ' selected' : '') + '>Financiado</option></select></label>' +
  '<div id="' + prefix + '_finbox" class="two" style="display:' + (tipo === 'financiado' ? '' : 'none') + '"><label class="f"><span>Total a pagar (USD)</span><input id="' + prefix + '_total" inputmode="decimal" value="' + esc((c && c.total) || '') + '" oninput="calcularCuotaAsignacion(\'' + prefix + '\')"></label>' +
  '<label class="f"><span>Cantidad de cuotas</span><input id="' + prefix + '_cuotas" inputmode="numeric" value="' + esc((c && c.cuotas) || '') + '" oninput="calcularCuotaAsignacion(\'' + prefix + '\')"></label></div>' +
  '<label class="f"><span id="' + prefix + '_lblmonto">' + (tipo === 'financiado' ? 'Cuota semanal (USD)' : 'Alquiler semanal') + '</span><input id="' + prefix + '_monto" inputmode="decimal" value="' + esc((c && c.monto) || '') + '" oninput="this.dataset.touched=1"></label>' +
  '<label class="f"><span>Fecha de inicio</span><input id="' + prefix + '_inicio" type="date" value="' + esc((c && c.inicio) || iso(today())) + '"></label>';
}
export function onAsignacionTipo(prefix) {
  const t = val(prefix + '_tipo');
  document.getElementById(prefix + '_finbox').style.display = t === 'financiado' ? '' : 'none';
  document.getElementById(prefix + '_lblmonto').textContent = t === 'financiado' ? 'Cuota semanal (USD)' : 'Alquiler semanal';
}
export function calcularCuotaAsignacion(prefix) {
  const m = document.getElementById(prefix + '_monto'); if (!m || m.dataset.touched) return;
  const t = +val(prefix + '_total'), n = +val(prefix + '_cuotas');
  if (t && n) m.value = Math.round(t / n);
}

async function liberarAuto(c) {
  return save('cars', Object.assign({}, c, { choferId: '', tipo: 'disponible', historialChoferes: actualizarHistorialChoferes(c, '') }));
}

export function asignarChoferForm(carId) {
  const c = carById(carId);
  if (!c) { toast('Auto no encontrado'); return; }
  const drivers = S.drivers.filter(d => !d.inactivo && !d.prospecto).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
  const tipo = c.tipo === 'financiado' ? 'financiado' : 'alquiler';
  const h = '<h3>Asignar chofer — ' + esc(c.patente) + '</h3>' +
  '<label class="f"><span>Chofer</span><select id="ac_chofer"><option value="">Elegir chofer</option>' + drivers.map(d => '<option value="' + d.id + '"' + (c.choferId === d.id ? ' selected' : '') + '>' + esc(d.nombre) + '</option>').join('') + '</select></label>' +
  campos('ac', tipo, c) +
  '<div class="row" style="margin-top:14px"><button class="btn grow" onclick="guardarAsignacionChofer(\'' + c.id + '\')">Asignar</button><button class="btn sec" onclick="carForm(\'' + c.id + '\')">Cancelar</button></div>';
  openModal(h);
}
export async function guardarAsignacionChofer(carId) {
  const c = carById(carId); if (!c) return;
  const choferId = val('ac_chofer');
  if (!choferId) { toast('Elegí un chofer'); return; }
  const anterior = S.cars.find(x => x.choferId === choferId && !x.vendido && x.id !== carId);
  if (anterior) await liberarAuto(anterior);
  const tipo = val('ac_tipo');
  const monto = +val('ac_monto') || 0;
  const inicio = val('ac_inicio') || iso(today());
  const o = Object.assign({}, c, {
    choferId, tipo, monto, inicio,
    total: tipo === 'financiado' ? (+val('ac_total') || 0) : (c.total || 0),
    cuotas: tipo === 'financiado' ? (+val('ac_cuotas') || 0) : (c.cuotas || 0),
    historialChoferes: actualizarHistorialChoferes(c, choferId),
    montoHistorial: actualizarHistorialMonto(c, monto),
  });
  if (await save('cars', o)) { toast('Chofer asignado: ' + driverName(choferId)); carForm(carId); }
}
export async function quitarChofer(carId) {
  const c = carById(carId); if (!c) return;
  if (await liberarAuto(c)) { toast('Chofer desasignado'); carForm(carId); }
}

export function asignarAutoForm(driverId) {
  const d = S.drivers.find(x => x.id === driverId);
  if (!d) { toast('Chofer no encontrado'); return; }
  const disponibles = S.cars.filter(c => c.tipo === 'disponible' && !c.vendido).sort((a, b) => String(a.patente).localeCompare(String(b.patente)));
  if (!disponibles.length) { toast('No hay autos disponibles para asignar'); return; }
  const h = '<h3>Asignar auto — ' + esc(d.nombre) + '</h3>' +
  '<label class="f"><span>Auto</span><select id="aa_auto"><option value="">Elegir auto</option>' + disponibles.map(c => '<option value="' + c.id + '">' + esc(c.patente) + '</option>').join('') + '</select></label>' +
  campos('aa', 'alquiler', null) +
  '<div class="row" style="margin-top:14px"><button class="btn grow" onclick="guardarAsignacionAuto(\'' + d.id + '\')">Asignar</button><button class="btn sec" onclick="driverForm(\'' + d.id + '\')">Cancelar</button></div>';
  openModal(h);
}
export async function guardarAsignacionAuto(driverId) {
  const carId = val('aa_auto');
  if (!carId) { toast('Elegí un auto'); return; }
  const c = S.cars.find(x => x.id === carId); if (!c) return;
  const anterior = S.cars.find(x => x.choferId === driverId && !x.vendido && x.id !== carId);
  if (anterior) await liberarAuto(anterior);
  const tipo = val('aa_tipo');
  const monto = +val('aa_monto') || 0;
  const inicio = val('aa_inicio') || iso(today());
  const o = Object.assign({}, c, {
    choferId: driverId, tipo, monto, inicio,
    total: tipo === 'financiado' ? (+val('aa_total') || 0) : 0,
    cuotas: tipo === 'financiado' ? (+val('aa_cuotas') || 0) : 0,
    historialChoferes: actualizarHistorialChoferes(c, driverId),
    montoHistorial: actualizarHistorialMonto(c, monto),
  });
  if (await save('cars', o)) { toast('Auto asignado: ' + (c.patente || '')); driverForm(driverId); }
}
export async function quitarAutoDeChofer(driverId, carId) {
  const c = S.cars.find(x => x.id === carId); if (!c) return;
  if (await liberarAuto(c)) { toast('Auto desasignado'); driverForm(driverId); }
}
