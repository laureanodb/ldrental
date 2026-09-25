import { S } from '../state.js';
import { $, val, uid, iso, today, esc, money, moneyUSD, num1 } from '../utils.js';
import { isContract, calc, carById, driverName, metodoPreferidoChofer, montoSugeridoCobro } from '../calc.js';
import { METODOS_PAGO } from '../constants.js';
import { openModal, closeModal, toast } from '../modal.js';
import { save, remove } from '../data.js';
import { actualizarKm } from './car.js';

export function payForm(carId) {
  const cars = S.cars.filter(c => isContract(c) && c.choferId);
  if (!cars.length) { toast('Primero cargá un auto alquilado o financiado con chofer'); return; }
  const c = cars.find(x => x.id === carId) || cars[0];
  const h = '<h3>Registrar cobro</h3>' +
  '<label class="f"><span>Auto</span><select id="p_car" onchange="onPayCar()">' + cars.map(x => '<option value="' + x.id + '"' + (x.id === c.id ? ' selected' : '') + '>' + esc(x.patente) + ' · ' + esc(driverName(x.choferId)) + '</option>').join('') + '</select></label>' +
  '<div class="small muted" id="p_info" style="margin:-4px 0 12px"></div>' +
  '<div class="two"><label class="f"><span id="p_lblmonto">Monto</span><input id="p_monto" inputmode="decimal"></label>' +
  '<label class="f"><span>Fecha</span><input id="p_fecha" type="date" value="' + iso(today()) + '"></label></div>' +
  '<div class="two"><label class="f"><span>Tipo</span><select id="p_tipo"><option value="alquiler">Alquiler</option><option value="cuota">Cuota de financiación</option><option value="otro">Otro (anticipo, seña, etc.)</option></select></label>' +
  '<label class="f"><span>Método de pago</span><select id="p_metodo">' + METODOS_PAGO.map(x => '<option value="' + x[0] + '">' + x[1] + '</option>').join('') + '</select></label></div>' +
  '<label class="chk"><input type="checkbox" id="p_parcial"><span>Es un pago parcial</span></label>' +
  '<label class="f"><span>Km actual <small>opcional</small></span><input id="p_km" inputmode="numeric" placeholder="' + esc(c.km || '') + '"></label>' +
  '<label class="f"><span>Nota</span><input id="p_nota"></label>' +
  '<div class="row"><button class="btn grow" onclick="savePay(this)">Guardar cobro</button><button class="btn sec" onclick="closeModal()">Cancelar</button></div>';
  openModal(h); onPayCar();
}
export function onPayCar() {
  const c = carById($('#p_car').value); if (!c) return;
  const i = calc(c);
  const mon = c.tipo === 'financiado' ? moneyUSD : money;
  $('#p_monto').value = montoSugeridoCobro(c) || '';
  $('#p_tipo').value = c.tipo === 'alquiler' ? 'alquiler' : 'cuota';
  $('#p_lblmonto').textContent = c.tipo === 'financiado' ? 'Monto (en dólares)' : 'Monto';
  $('#p_info').textContent = (i.debt > 0 ? 'Debe ' + mon(i.debt) + ' (' + num1(i.late) + ' semanas). ' : 'Está al día. ') + (c.tipo === 'alquiler' ? 'Alquiler' : 'Cuota') + ' semanal: ' + mon(c.monto) + '.';
  const metodoHabitual = metodoPreferidoChofer(c.choferId);
  if (metodoHabitual) $('#p_metodo').value = metodoHabitual;
}
let payAnomaloArmed = null;
export async function savePay(btn) {
  const c = carById(val('p_car')); const monto = +val('p_monto');
  if (!c) { toast('Elegí un auto'); return; }
  if (!monto || monto <= 0) { toast('Poné el monto cobrado'); return; }
  if (!val('p_fecha')) { toast('Poné la fecha'); return; }
  const parcial = document.getElementById('p_parcial').checked;
  const esperado = +c.monto || 0;
  if (!parcial && esperado && (monto > esperado * 1.5 || monto < esperado * 0.5) && payAnomaloArmed !== btn) {
    payAnomaloArmed = btn;
    const mon = c.tipo === 'financiado' ? moneyUSD : money;
    toast('Este monto (' + mon(monto) + ') es muy distinto al habitual (' + mon(esperado) + '). Tocá "Guardar cobro" de nuevo para confirmar.');
    return;
  }
  payAnomaloArmed = null;
  const o = { id: uid(), carId: c.id, choferId: c.choferId, fecha: val('p_fecha'), monto, tipo: val('p_tipo'), metodo: val('p_metodo'), parcial, nota: val('p_nota'), depositado: false };
  const km = val('p_km');
  if (await save('payments', o)) { if (km) await actualizarKm(c.id, km); closeModal(); toast('Cobro registrado'); }
}
export async function delPay(id) { if (await remove('payments', id)) toast('Cobro borrado'); }
export async function toggleDepositado(id) {
  const p = S.payments.find(x => x.id === id); if (!p) return;
  await save('payments', Object.assign({}, p, { depositado: !p.depositado }));
}
