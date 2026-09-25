import { val, uid, iso, today, esc, money } from '../utils.js';
import { S } from '../state.js';
import { openModal, closeModal, toast, confirmDel } from '../modal.js';
import { save } from '../data.js';
import { saldoAdelantos } from '../calc.js';
import { canDelete } from '../roles.js';
import { driverForm } from './driver.js';

export function adelantoForm(driverId) {
  const d = S.drivers.find(x => x.id === driverId);
  if (!d) { toast('Chofer no encontrado'); return; }
  const h = '<h3>Adelanto — ' + esc(d.nombre) + '</h3>' +
  '<div class="small muted" style="margin-bottom:12px">Un adelanto suma a la deuda del chofer. Cuando lo devuelva o quieras descontárselo, registrá una devolución.</div>' +
  '<label class="f"><span>Tipo</span><select id="ad_tipo"><option value="adelanto">Adelanto (le doy plata)</option><option value="devolucion">Devolución / descuento (me devuelve)</option></select></label>' +
  '<label class="f"><span>Monto</span><input id="ad_monto" inputmode="decimal"></label>' +
  '<label class="f"><span>Fecha</span><input id="ad_fecha" type="date" value="' + iso(today()) + '"></label>' +
  '<label class="f"><span>Motivo</span><input id="ad_motivo"></label>' +
  '<div class="row" style="margin-top:14px"><button class="btn grow" onclick="guardarAdelanto(\'' + d.id + '\')">Guardar</button><button class="btn sec" onclick="driverForm(\'' + d.id + '\')">Cancelar</button></div>';
  openModal(h);
}
export async function guardarAdelanto(driverId) {
  const tipo = val('ad_tipo');
  const montoAbs = +val('ad_monto');
  if (!montoAbs || montoAbs <= 0) { toast('Poné el monto'); return; }
  const monto = tipo === 'devolucion' ? -montoAbs : montoAbs;
  const d = S.drivers.find(x => x.id === driverId); if (!d) return;
  const adelanto = { id: uid(), fecha: val('ad_fecha') || iso(today()), monto, motivo: val('ad_motivo') };
  const adelantos = (d.adelantos || []).concat([adelanto]);
  if (await save('drivers', Object.assign({}, d, { adelantos }))) { closeModal(); toast('Registrado'); }
}
export async function borrarAdelanto(driverId, adelantoId) {
  const d = S.drivers.find(x => x.id === driverId); if (!d) return;
  const adelantos = (d.adelantos || []).filter(x => x.id !== adelantoId);
  if (await save('drivers', Object.assign({}, d, { adelantos }))) { toast('Borrado'); driverForm(driverId); }
}
export function seccionAdelantos(d) {
  const A = (d.adelantos || []).slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
  const saldo = saldoAdelantos(d.id);
  let h = '<div class="sec-t row between">Adelantos<span class="small muted">' + (saldo > 0 ? 'Debe ' + money(saldo) : saldo < 0 ? 'A favor ' + money(-saldo) : 'Sin saldo') + '</span></div>';
  if (A.length) h += A.map(a => '<div class="card row"><div class="grow"><div>' + (a.monto >= 0 ? '+' + money(a.monto) : '-' + money(-a.monto)) + ' <span class="small muted">' + a.fecha + '</span></div>' + (a.motivo ? '<div class="small muted">' + esc(a.motivo) + '</div>' : '') + '</div>' + (canDelete() ? '<button class="btn danger sm" onclick="confirmDel(this,()=>borrarAdelanto(\'' + d.id + '\',\'' + a.id + '\'))">Borrar</button>' : '') + '</div>').join('');
  else h += '<div class="small muted" style="margin-bottom:8px">Sin adelantos registrados.</div>';
  h += '<button class="btn sec block" style="margin:8px 0 20px" onclick="adelantoForm(\'' + d.id + '\')">+ Registrar adelanto / devolución</button>';
  return h;
}
