import { val, uid, iso, today, esc, money } from '../utils.js';
import { S } from '../state.js';
import { openModal, closeModal, toast } from '../modal.js';
import { save, remove } from '../data.js';
import { saldoDeposito, saldoSemanaAdelantada, depositosDeChofer } from '../calc.js';
import { driverForm } from './driver.js';

export function depositoForm(driverId) {
  const d = S.drivers.find(x => x.id === driverId);
  if (!d) { toast('Chofer no encontrado'); return; }
  const h = '<h3>Depósito de garantía — ' + esc(d.nombre) + '</h3>' +
  '<div class="small muted" style="margin-bottom:12px">Objetivo: ' + money(d.depositoObjetivo || 0) + ' · Saldo actual: ' + money(saldoDeposito(d.id)) + '</div>' +
  '<label class="f"><span>Movimiento</span><select id="dp_mov"><option value="pago">Pago (el chofer aporta)</option><option value="devolucion">Devolución parcial (le devolvemos)</option></select></label>' +
  '<label class="f"><span>Monto</span><input id="dp_monto" inputmode="decimal"></label>' +
  '<div class="two"><label class="f"><span>Fecha</span><input id="dp_fecha" type="date" value="' + iso(today()) + '"></label>' +
  '<label class="f"><span>Medio</span><select id="dp_medio"><option value="efectivo">Efectivo</option><option value="cuenta">En cuenta bancaria</option></select></label></div>' +
  '<label class="f"><span>Nota</span><input id="dp_nota"></label>' +
  '<div class="row"><button class="btn grow" onclick="saveDeposito(\'' + d.id + '\')">Guardar</button><button class="btn sec" onclick="driverForm(\'' + d.id + '\')">Cancelar</button></div>';
  openModal(h);
}
export async function saveDeposito(driverId) {
  const montoAbs = +val('dp_monto');
  if (!montoAbs || montoAbs <= 0) { toast('Poné el monto'); return; }
  const monto = val('dp_mov') === 'devolucion' ? -montoAbs : montoAbs;
  const o = { id: uid(), driverId, fecha: val('dp_fecha') || iso(today()), monto, tipo: 'garantia', medio: val('dp_medio'), nota: val('dp_nota') };
  if (await save('depositos', o)) { closeModal(); toast('Registrado'); driverForm(driverId); }
}
export async function delDeposito(id) {
  const dep = S.depositos.find(x => x.id === id);
  if (await remove('depositos', id)) { toast('Pago borrado'); if (dep) driverForm(dep.driverId); }
}
export function semanaAdelantadaForm(driverId) {
  const d = S.drivers.find(x => x.id === driverId);
  if (!d) { toast('Chofer no encontrado'); return; }
  const h = '<h3>Semana adelantada — ' + esc(d.nombre) + '</h3>' +
  '<div class="small muted" style="margin-bottom:12px">Plata que el chofer pagó de más, para cubrir semanas futuras. Se descuenta automáticamente de la deuda semanal hasta consumirse. Saldo actual: ' + money(saldoSemanaAdelantada(d.id)) + '</div>' +
  '<div class="two"><label class="f"><span>Monto</span><input id="sa_monto" inputmode="decimal"></label>' +
  '<label class="f"><span>Fecha</span><input id="sa_fecha" type="date" value="' + iso(today()) + '"></label></div>' +
  '<label class="f"><span>Medio</span><select id="sa_medio"><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option></select></label>' +
  '<label class="f"><span>Nota</span><input id="sa_nota" placeholder="ej: adelantó 2 semanas"></label>' +
  '<div class="row"><button class="btn grow" onclick="guardarSemanaAdelantada(\'' + d.id + '\')">Guardar</button><button class="btn sec" onclick="driverForm(\'' + d.id + '\')">Cancelar</button></div>';
  openModal(h);
}
export async function guardarSemanaAdelantada(driverId) {
  const monto = +val('sa_monto');
  if (!monto) { toast('Poné el monto'); return; }
  const o = { id: uid(), driverId, fecha: val('sa_fecha') || iso(today()), monto, tipo: 'semana_adelantada', medio: val('sa_medio'), nota: val('sa_nota') };
  if (await save('depositos', o)) { closeModal(); toast('Registrado'); driverForm(driverId); }
}
export function confirmarBorrarSemanaAdelantada(id) {
  const dep = S.depositos.find(x => x.id === id);
  if (!dep) return;
  const h = '<h3>Borrar movimiento de semana adelantada</h3>' +
  '<div class="small muted" style="margin-bottom:14px">Esto va a borrar el movimiento de ' + money(Math.abs(dep.monto)) + ' del ' + esc(dep.fecha) + '. No se puede deshacer.</div>' +
  '<div class="row"><button class="btn danger grow" onclick="delSemanaAdelantada(\'' + id + '\')">Sí, borrar</button><button class="btn sec" onclick="driverForm(\'' + dep.driverId + '\')">Cancelar</button></div>';
  openModal(h);
}
export async function delSemanaAdelantada(id) {
  const dep = S.depositos.find(x => x.id === id);
  if (await remove('depositos', id)) { toast('Borrado'); if (dep) driverForm(dep.driverId); }
}
export function gruposDuplicadosLedger(driverId, tipo) {
  const items = depositosDeChofer(driverId, tipo);
  const grupos = {};
  items.forEach(x => {
    const key = x.fecha + '|' + x.monto + '|' + (x.medio || '');
    (grupos[key] = grupos[key] || []).push(x);
  });
  return Object.values(grupos).filter(g => g.length > 1);
}
export async function fusionarDuplicadosLedger(driverId, tipo) {
  const grupos = gruposDuplicadosLedger(driverId, tipo);
  if (!grupos.length) { toast('No hay duplicados para fusionar'); return; }
  let n = 0;
  for (const g of grupos) {
    for (const x of g.slice(1)) { if (await remove('depositos', x.id)) n++; }
  }
  toast(n + ' movimiento' + (n === 1 ? '' : 's') + ' duplicado' + (n === 1 ? '' : 's') + ' fusionado' + (n === 1 ? '' : 's'));
  driverForm(driverId);
}
