import { val, uid, iso, today, esc, money } from '../utils.js';
import { S } from '../state.js';
import { openModal, closeModal, toast } from '../modal.js';
import { save, remove } from '../data.js';
import { saldoDeposito } from '../calc.js';
import { driverForm } from './driver.js';

export function depositoForm(driverId) {
  const d = S.drivers.find(x => x.id === driverId);
  if (!d) { toast('Chofer no encontrado'); return; }
  const h = '<h3>Pago de depósito — ' + esc(d.nombre) + '</h3>' +
  '<div class="small muted" style="margin-bottom:12px">Objetivo: ' + money(d.depositoObjetivo || 0) + ' · Saldo actual: ' + money(saldoDeposito(d.id)) + '</div>' +
  '<label class="f"><span>Monto pagado</span><input id="dp_monto" inputmode="decimal"></label>' +
  '<label class="f"><span>Fecha</span><input id="dp_fecha" type="date" value="' + iso(today()) + '"></label>' +
  '<label class="f"><span>Nota</span><input id="dp_nota"></label>' +
  '<div class="row"><button class="btn grow" onclick="saveDeposito(\'' + d.id + '\')">Guardar</button><button class="btn sec" onclick="driverForm(\'' + d.id + '\')">Cancelar</button></div>';
  openModal(h);
}
export async function saveDeposito(driverId) {
  const monto = +val('dp_monto');
  if (!monto || monto <= 0) { toast('Poné el monto pagado'); return; }
  const o = { id: uid(), driverId, fecha: val('dp_fecha') || iso(today()), monto, tipo: 'cuota', nota: val('dp_nota') };
  if (await save('depositos', o)) { closeModal(); toast('Pago de depósito registrado'); driverForm(driverId); }
}
export async function delDeposito(id) {
  const dep = S.depositos.find(x => x.id === id);
  if (await remove('depositos', id)) { toast('Pago borrado'); if (dep) driverForm(dep.driverId); }
}
