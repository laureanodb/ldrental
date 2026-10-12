// Lo que el chofer avisa desde el portal sobre la plata y el auto: gastos que
// pagó él (para descontar del alquiler si los aprobás), que se va a atrasar con
// el pago y qué día paga, y que va a devolver el auto.
import { S } from '../state.js';
import { esc, uid, iso, today, fdate, money, moneyUSD, parse, days } from '../utils.js';
import { toast } from '../modal.js';
import { save } from '../data.js';
import { de } from '../memo.js';
import { badge, isContract } from '../calc.js';
import { isSnoozed } from '../snooze.js';
import { cotizacion } from '../dolar.js';
import { GASTO_CATS } from '../constants.js';

const carDe = id => de('cars', 'id', id)[0];
const choferDe = id => de('drivers', 'id', id)[0];
const catLabel = k => (GASTO_CATS.find(x => x[0] === k) || [0, 'Otro gasto'])[1];

/* ---------- Estado de cada aviso ---------- */
// Un aviso de atraso se cumple si después de avisar pagó algo hasta el día que dijo.
export function estadoAvisoAtraso(d, a) {
  if (a.estado === 'cerrado') return 'cerrado';
  const pago = de('payments', 'choferId', d.id).some(p => p.choferId === d.id && p.fecha >= a.fecha && p.fecha <= a.pagaEl && p.tipo !== 'seguro');
  if (pago) return 'cumplido';
  return iso(today()) > a.pagaEl ? 'incumplido' : 'esperando';
}
export const avisoAtrasoVigente = d => (d.avisosAtraso || []).slice().sort((a, b) => String(b.fecha).localeCompare(a.fecha))[0] || null;

/* ---------- Tarjetas arriba en la ficha del chofer ---------- */
export function seccionPedidosChofer(d) {
  let h = '';
  const gastos = (d.gastosChofer || []).filter(g => g.estado === 'pendiente');
  gastos.forEach(g => {
    const c = carDe(g.carId);
    h += '<div class="card" style="margin-bottom:10px;border-color:var(--warn)"><div class="row between"><b>Gasto que pagó el chofer</b>' + badge('warn', 'Para aprobar') + '</div>' +
      '<div style="margin-top:4px">' + esc(g.concepto) + ' · <b>' + money(g.monto) + '</b></div>' +
      '<div class="small muted">' + fdate(g.fecha) + (c ? ' · ' + esc(c.patente) : '') + ' · ' + esc(catLabel(g.categoria)) + '</div>' +
      (g.foto ? '<a class="small tap" style="text-decoration:underline" onclick="viewFile(\'' + esc(g.foto.id) + '\',\'Ticket\')">Ver el ticket</a>' : '<div class="small muted">Sin foto del ticket</div>') +
      '<div class="row" style="margin-top:8px"><button class="btn sm grow" onclick="aprobarGastoChofer(\'' + d.id + '\',\'' + g.id + '\')">Aprobar y descontar</button><button class="btn sec sm" onclick="rechazarGastoChofer(\'' + d.id + '\',\'' + g.id + '\')">Rechazar</button></div></div>';
  });
  const a = avisoAtrasoVigente(d);
  if (a && a.estado !== 'cerrado') {
    const e = estadoAvisoAtraso(d, a);
    if (e !== 'cumplido' || days(parse(a.pagaEl), today()) <= 3) {
      h += '<div class="card" style="margin-bottom:10px;border-color:' + (e === 'incumplido' ? 'var(--bad)' : 'var(--line)') + '"><div class="row between"><b>Avisó que se atrasa con el pago</b>' +
        badge(e === 'cumplido' ? 'ok' : e === 'incumplido' ? 'bad' : 'info', e === 'cumplido' ? 'Pagó' : e === 'incumplido' ? 'No pagó el día que dijo' : 'Paga el ' + fdate(a.pagaEl)) + '</div>' +
        '<div class="small muted">Avisó el ' + fdate(a.fecha) + ' · dijo que paga el ' + fdate(a.pagaEl) + '</div>' + (a.motivo ? '<div class="small">' + esc(a.motivo) + '</div>' : '') +
        '<button class="btn sec sm" style="margin-top:6px" onclick="cerrarAvisoAtraso(\'' + d.id + '\',\'' + a.id + '\')">Listo, ya está resuelto</button></div>';
    }
  }
  const dv = d.devolucion;
  if (dv && dv.estado === 'avisada') {
    const c = carDe(dv.carId);
    h += '<div class="card" style="margin-bottom:10px;border-color:var(--warn)"><div class="row between"><b>Avisó que devuelve el auto</b>' + badge('warn', fdate(dv.fechaDevolucion)) + '</div>' +
      '<div class="small muted">' + (c ? esc(c.patente) + ' · ' : '') + 'avisó el ' + fdate(dv.fecha) + '</div>' + (dv.motivo ? '<div class="small">' + esc(dv.motivo) + '</div>' : '') +
      '<div class="row" style="margin-top:8px">' + (c ? '<button class="btn sm grow" onclick="carForm(\'' + c.id + '\')">Ir al auto (recibirlo)</button>' : '') +
      '<button class="btn sec sm" onclick="cerrarDevolucion(\'' + d.id + '\',\'recibida\')">Ya lo devolvió</button><button class="btn sec sm" onclick="cerrarDevolucion(\'' + d.id + '\',\'cancelada\')">Se queda</button></div></div>';
  }
  return h;
}

/* ---------- Acciones ---------- */
export async function aprobarGastoChofer(id, gid) {
  const d = choferDe(id); if (!d) return;
  const g = (d.gastosChofer || []).find(x => x.id === gid); if (!g) return;
  const c = carDe(g.carId) || S.cars.find(x => x.choferId === id && isContract(x));
  if (!c) { toast('El chofer no tiene un auto alquilado para descontarle'); return; }
  let monto = +g.monto || 0, nota = '';
  if (c.tipo === 'financiado') {
    const cot = cotizacion();
    if (!cot) { toast('Para descontarlo de la cuota en dólares cargá el dólar del día en Ajustes'); return; }
    monto = Math.round(monto / cot.valor * 100) / 100; nota = ' (' + money(g.monto) + ' a ' + money(cot.valor) + ')';
  }
  const ajuste = { id: uid(), fecha: iso(today()), monto, motivo: 'Gasto pagado por el chofer: ' + g.concepto + nota, gastoChoferId: g.id };
  if (!(await save('cars', Object.assign({}, c, { ajustesDeuda: (c.ajustesDeuda || []).concat([ajuste]) })))) return;
  const gasto = { id: uid(), carId: c.id, categoria: g.categoria || 'otro', fecha: g.fecha, costo: +g.monto || 0, descripcion: g.concepto + ' (lo pagó ' + (d.nombre || 'el chofer') + ', se le descontó)', pagadoPorChofer: id, sinFactura: !g.foto };
  if (g.foto) gasto.files = [{ id: g.foto.id, name: 'ticket-chofer-' + g.fecha + '.jpg', cat: 'factura', type: g.foto.type || 'image/jpeg', fecha: g.fecha }];
  await save('gastos', gasto);
  if (await save('drivers', Object.assign({}, choferDe(id), { gastosChofer: (d.gastosChofer || []).map(x => (x.id === gid ? Object.assign({}, x, { estado: 'aprobado', resuelto: iso(today()), ajusteId: ajuste.id }) : x)) }))) {
    toast('Aprobado: se le descontaron ' + (c.tipo === 'financiado' ? moneyUSD(monto) : money(monto)) + ' de lo que debe'); window.driverForm(id);
  }
}
export async function rechazarGastoChofer(id, gid) {
  const d = choferDe(id); if (!d) return;
  const motivo = prompt('¿Por qué no se descuenta? (lo ve el chofer en el portal)') || '';
  if (await save('drivers', Object.assign({}, d, { gastosChofer: (d.gastosChofer || []).map(x => (x.id === gid ? Object.assign({}, x, { estado: 'rechazado', resuelto: iso(today()), nota: motivo.trim().slice(0, 200) }) : x)) }))) { toast('Gasto rechazado'); window.driverForm(id); }
}
export async function cerrarAvisoAtraso(id, aid) {
  const d = choferDe(id); if (!d) return;
  if (await save('drivers', Object.assign({}, d, { avisosAtraso: (d.avisosAtraso || []).map(a => (a.id === aid ? Object.assign({}, a, { estado: 'cerrado', resultado: estadoAvisoAtraso(d, a) }) : a)) }))) window.driverForm(id);
}
export async function cerrarDevolucion(id, estado) {
  const d = choferDe(id); if (!d || !d.devolucion) return;
  if (await save('drivers', Object.assign({}, d, { devolucion: Object.assign({}, d.devolucion, { estado, cerrada: iso(today()) }) }))) { toast(estado === 'recibida' ? 'Devolución registrada' : 'Listo'); window.driverForm(id); }
}

/* ---------- Avisos ---------- */
export function alertasPedidosChofer() {
  const out = [];
  const add = o => { if (!isSnoozed(o.key)) out.push(o); };
  S.drivers.filter(d => !d.inactivo).forEach(d => {
    const n = (d.gastosChofer || []).filter(g => g.estado === 'pendiente');
    if (n.length) add({ who: d.nombre, sub: 'Gasto que pagó el chofer para aprobar', kind: 'driver', id: d.id, key: 'driver:' + d.id + ':gastochofer:' + n.map(g => g.id).join(','), d: 1, cls: 'warn', t: money(n.reduce((s, g) => s + (+g.monto || 0), 0)) + ' · ' + n.map(g => g.concepto).join(', ').slice(0, 60) });
    const a = avisoAtrasoVigente(d);
    if (a && a.estado !== 'cerrado') {
      const e = estadoAvisoAtraso(d, a);
      if (e === 'esperando') add({ who: d.nombre, sub: 'Avisó que se atrasa con el pago', kind: 'driver', id: d.id, key: 'driver:' + d.id + ':atraso:' + a.id, d: days(today(), parse(a.pagaEl)), cls: 'soft', t: 'Dice que paga el ' + fdate(a.pagaEl) });
      if (e === 'incumplido') add({ who: d.nombre, sub: 'No pagó el día que había avisado', kind: 'driver', id: d.id, key: 'driver:' + d.id + ':atrasoinc:' + a.id, d: 0, cls: 'bad', t: 'Iba a pagar el ' + fdate(a.pagaEl) });
    }
    const dv = d.devolucion;
    if (dv && dv.estado === 'avisada') add({ who: d.nombre, sub: 'Va a devolver el auto', kind: 'driver', id: d.id, key: 'driver:' + d.id + ':devolucion:' + dv.id, d: Math.max(0, days(today(), parse(dv.fechaDevolucion))), cls: 'warn', t: fdate(dv.fechaDevolucion) + ((carDe(dv.carId) || {}).patente ? ' · ' + carDe(dv.carId).patente : '') });
  });
  return out;
}
export function pedidosChoferPendientes() {
  return S.drivers.filter(d => !d.inactivo).reduce((n, d) => n + (d.gastosChofer || []).filter(g => g.estado === 'pendiente').length + (d.devolucion && d.devolucion.estado === 'avisada' ? 1 : 0), 0);
}
