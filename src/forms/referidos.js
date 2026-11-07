// Premio por referido: el chofer que trae a otro gana una semana de alquiler bonificada
// cuando el nuevo cumple las semanas elegidas trabajando. El premio se da como un
// descuento (ajuste de deuda) en el auto del que lo refirió, así queda en su cuenta y en su portal.
import { S } from '../state.js';
import { esc, val, uid, iso, today, fdate, money, parse, days } from '../utils.js';
import { openModal, toast } from '../modal.js';
import { save } from '../data.js';
import { de } from '../memo.js';
import { settings, saveSettings } from '../settings.js';
import { carHistoryForDriver, isContract } from '../calc.js';
import { isSnoozed } from '../snooze.js';

const semanasRequeridas = () => +settings.referidoSemanas || 8;
const nombre = id => (de('drivers', 'id', id)[0] || {}).nombre || 'Chofer';
const autoDe = driverId => S.cars.find(c => c.choferId === driverId && !c.vendido && isContract(c) && c.tipo === 'alquiler') || null;

// Semanas que lleva trabajando desde que le asignaste el primer auto.
export function semanasTrabajadas(driverId) {
  const H = carHistoryForDriver(driverId);
  if (!H.length) return 0;
  const desde = H.reduce((m, h) => (h.desde < m ? h.desde : m), H[0].desde);
  return Math.max(0, Math.floor(days(parse(desde), today()) / 7));
}
// Choferes que vinieron referidos por otro chofer de la lista.
export function referidos() {
  return S.drivers.filter(d => d.referidoPorId && !d.prospecto).map(d => {
    const sem = semanasTrabajadas(d.id);
    const listo = !d.premioReferido && !d.inactivo && sem >= semanasRequeridas();
    return { d, quien: d.referidoPorId, sem, listo, dado: d.premioReferido || null };
  }).sort((a, b) => (b.listo - a.listo) || (b.sem - a.sem));
}

export function referidosView() {
  const R = referidos();
  let h = '<h3>Premio por referido</h3>' +
    '<div class="small muted" style="margin-bottom:10px">Cuando un chofer te trae a otro y el nuevo cumple ' + semanasRequeridas() + ' semanas trabajando, el que lo trajo gana una semana de alquiler bonificada. Se le descuenta de su deuda en su auto. Para anotarlo, en la ficha del chofer nuevo elegí "Referido por".</div>';
  if (!R.length) h += '<div class="card">Todavía no hay choferes referidos. Cuando cargues uno, elegí en su ficha quién lo trajo.</div>';
  h += R.map(x => {
    const auto = autoDe(x.quien);
    const estado = x.dado ? '<span class="badge b-ok">Premio dado el ' + fdate(x.dado.fecha) + (x.dado.monto ? ' · ' + money(x.dado.monto) : '') + '</span>'
      : x.d.inactivo ? '<span class="badge b-mute">Dejó antes de cumplir</span>'
      : x.listo ? '<span class="badge b-warn">Cumplió: falta dar el premio</span>'
      : '<span class="badge b-info">' + x.sem + ' de ' + semanasRequeridas() + ' semanas</span>';
    return '<div class="card"><div class="row between" style="gap:8px;flex-wrap:wrap"><div style="min-width:0"><b>' + esc(nombre(x.quien)) + '</b> <span class="small muted">trajo a</span> <b>' + esc(x.d.nombre) + '</b></div>' + estado + '</div>' +
      (x.listo ? (auto ? '<button class="btn block" style="margin-top:8px" onclick="darPremioReferido(\'' + x.d.id + '\')">Dar el premio: ' + money(auto.monto) + ' de descuento a ' + esc(nombre(x.quien)) + '</button>'
        : '<div class="small muted" style="margin-top:6px">' + esc(nombre(x.quien)) + ' no tiene un auto alquilado ahora: dale el premio a mano y marcalo como dado.</div><button class="btn sec sm" style="margin-top:6px" onclick="darPremioReferido(\'' + x.d.id + '\',true)">Marcar como dado</button>') : '') +
      '</div>';
  }).join('');
  h += '<div class="sec-t">Regla</div><label class="f"><span>Semanas que tiene que cumplir el nuevo</span><input id="rf_semanas" inputmode="numeric" value="' + semanasRequeridas() + '"></label>' +
    '<div class="row"><button class="btn sec grow" onclick="guardarReglaReferido()">Guardar la regla</button><button class="btn sec" onclick="closeModal()">Cerrar</button></div>';
  openModal(h);
}
export function guardarReglaReferido() {
  saveSettings({ referidoSemanas: Math.max(1, Math.round(+val('rf_semanas') || 8)) });
  toast('Regla guardada'); referidosView();
}
export async function darPremioReferido(referidoId, sinAuto) {
  const d = de('drivers', 'id', referidoId)[0]; if (!d || d.premioReferido) return;
  let monto = 0, carId = '';
  if (!sinAuto) {
    const c = autoDe(d.referidoPorId);
    if (!c) { toast('El que lo trajo no tiene auto alquilado'); return; }
    monto = +c.monto || 0; carId = c.id;
    const aj = { id: uid(), fecha: iso(today()), monto, motivo: 'Premio por referido: trajo a ' + (d.nombre || 'un chofer') };
    if (!(await save('cars', Object.assign({}, c, { ajustesDeuda: (c.ajustesDeuda || []).concat([aj]) })))) return;
  }
  await save('drivers', Object.assign({}, d, { premioReferido: { fecha: iso(today()), a: d.referidoPorId, monto, carId } }));
  toast(sinAuto ? 'Marcado como dado' : 'Premio dado: ' + money(monto) + ' de descuento');
  referidosView();
}
export function alertasReferidos() {
  return referidos().filter(x => x.listo).map(x => {
    const key = 'referido:' + x.d.id;
    if (isSnoozed(key)) return null;
    return { who: nombre(x.quien), sub: 'Premio por referido', kind: 'driver', id: x.quien, key, d: 3, cls: 'warn', t: x.d.nombre + ' cumplió ' + semanasRequeridas() + ' semanas: dale la semana bonificada', accion: 'referidosView()' };
  }).filter(Boolean);
}
// Select para la ficha del chofer.
export function campoReferidoPor(d) {
  const otros = S.drivers.filter(x => x.id !== d.id && !x.prospecto).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
  return '<label class="f"><span>Referido por <small>¿qué chofer lo trajo?</small></span><select id="d_referidoPorId"' + (d.premioReferido ? ' disabled' : '') + '><option value="">Ninguno / otra persona</option>' +
    otros.map(x => '<option value="' + esc(x.id) + '"' + (d.referidoPorId === x.id ? ' selected' : '') + '>' + esc(x.nombre) + '</option>').join('') + '</select></label>';
}
