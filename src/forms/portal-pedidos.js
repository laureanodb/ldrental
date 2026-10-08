// Lo que llega desde el portal del chofer: turnos de service, auxilios,
// cambios de datos, luces del tablero y arreglos que siguen fallando.
import { S } from '../state.js';
import { esc, val, iso, today, fdate } from '../utils.js';
import { openModal, closeModal, toast } from '../modal.js';
import { save } from '../data.js';
import { de } from '../memo.js';
import { badge } from '../calc.js';
import { isSnoozed } from '../snooze.js';

const carDe = id => de('cars', 'id', id)[0];
const nombre = id => ((de('drivers', 'id', id)[0] || {}).nombre || 'Chofer');
const fechaHora = isoStr => { try { const d = new Date(isoStr); return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return isoStr; } };

/* ---------- Turnos de service ---------- */
export function seccionTurnos(c) {
  const L = (c.turnosService || []).slice().reverse().slice(0, 5);
  if (!L.length) return '';
  return '<div class="sec-t">Turnos pedidos por el chofer</div>' + L.map(t => '<div class="card row between"><div style="min-width:0"><div>' + esc(t.motivo || 'Service') + '</div><div class="small muted">Pedido el ' + fdate(t.pedidoEl) +
    (t.fecha ? ' · para el ' + fdate(t.fecha) + (t.hora ? ' ' + esc(t.hora) : '') : '') + (t.fechaConfirmada ? ' · confirmado ' + fdate(t.fechaConfirmada) + (t.horaConfirmada ? ' ' + esc(t.horaConfirmada) : '') : '') + '</div></div>' +
    (t.estado === 'pedido' ? '<button class="btn sm" onclick="turnoServiceForm(\'' + c.id + '\',\'' + t.id + '\')">Responder</button>' : badge(t.estado === 'confirmado' ? 'ok' : 'mute', t.estado === 'confirmado' ? 'Confirmado' : 'Rechazado')) + '</div>').join('');
}
export function turnoServiceForm(carId, tid) {
  const c = carDe(carId); const t = c && (c.turnosService || []).find(x => x.id === tid); if (!t) return;
  openModal('<h3>Turno de service · ' + esc(c.patente) + '</h3>' +
    '<div class="card small" style="margin-bottom:10px">' + esc(nombre(c.choferId)) + ' pidió: ' + esc(t.motivo || 'service') + (t.fecha ? '<br>Le queda bien el ' + fdate(t.fecha) + (t.hora ? ' a las ' + esc(t.hora) : '') : '') + '</div>' +
    '<div class="two"><label class="f"><span>Día</span><input id="ts_fecha" type="date" value="' + esc(t.fecha || iso(today())) + '"></label>' +
    '<label class="f"><span>Hora</span><input id="ts_hora" type="time" value="' + esc(t.hora || '') + '"></label></div>' +
    '<label class="f"><span>Nota para el chofer <small>opcional, la ve en el portal</small></span><input id="ts_nota" placeholder="ej: traelo al taller de calle Mitre"></label>' +
    '<div class="row"><button class="btn grow" onclick="responderTurno(\'' + c.id + '\',\'' + t.id + '\',\'confirmado\')">Confirmar</button><button class="btn sec" onclick="responderTurno(\'' + c.id + '\',\'' + t.id + '\',\'rechazado\')">No se puede</button></div>' +
    '<button class="btn sec block" style="margin-top:8px" onclick="carForm(\'' + c.id + '\')">Volver</button>');
}
export async function responderTurno(carId, tid, estado) {
  const c = carDe(carId); if (!c) return;
  const patch = { estado, nota: val('ts_nota'), respondido: iso(today()) };
  if (estado === 'confirmado') { patch.fechaConfirmada = val('ts_fecha'); patch.horaConfirmada = val('ts_hora'); if (!patch.fechaConfirmada) { toast('Poné el día'); return; } }
  if (await save('cars', Object.assign({}, c, { turnosService: (c.turnosService || []).map(t => (t.id === tid ? Object.assign({}, t, patch) : t)) }))) {
    toast(estado === 'confirmado' ? 'Turno confirmado: el chofer lo ve en el portal' : 'Turno rechazado');
    window.carForm(carId); window.setTabAuto('mant');
  }
}

/* ---------- Auxilio ---------- */
export function auxilioView(carId, aid) {
  const c = carDe(carId); const a = c && (c.auxilios || []).find(x => x.id === aid); if (!a) return;
  const mapa = a.lat != null ? 'https://maps.google.com/?q=' + a.lat + ',' + a.lng : '';
  const d = de('drivers', 'id', a.choferId)[0];
  openModal('<h3>Pedido de auxilio</h3>' +
    '<div class="card"><b>' + esc(nombre(a.choferId)) + '</b> · ' + esc(c.patente) + '<div class="small muted">' + fechaHora(a.fecha) + (a.precision ? ' · precisión ~' + a.precision + ' m' : '') + '</div>' +
    (a.mensaje ? '<div style="margin-top:6px">' + esc(a.mensaje) + '</div>' : '') + '</div>' +
    (mapa ? '<a class="btn block" style="margin:8px 0" target="_blank" rel="noopener" href="' + mapa + '">Ver en el mapa</a>' : '<div class="card small" style="color:var(--warn)">No llegó la ubicación: llamalo para saber dónde está.</div>') +
    (d && d.tel ? '<a class="btn sec block" style="margin-bottom:8px" href="tel:' + esc(d.tel) + '">Llamar a ' + esc(d.tel) + '</a><a class="btn sec block" style="margin-bottom:8px" target="_blank" href="https://wa.me/' + esc(String(d.tel).replace(/\D/g, '')) + '">WhatsApp</a>' : '') +
    (a.atendido ? '<div class="small muted">Atendido el ' + fdate(a.atendido) + '.</div>' : '<button class="btn sec block" onclick="atenderAuxilio(\'' + c.id + '\',\'' + a.id + '\')">Marcar como atendido</button>') +
    '<button class="btn sec block" style="margin-top:8px" onclick="closeModal()">Cerrar</button>');
}
export async function atenderAuxilio(carId, aid) {
  const c = carDe(carId); if (!c) return;
  if (await save('cars', Object.assign({}, c, { auxilios: (c.auxilios || []).map(a => (a.id === aid ? Object.assign({}, a, { atendido: iso(today()) }) : a)) }))) { closeModal(); toast('Marcado como atendido'); }
}

/* ---------- Cambios de datos del chofer ---------- */
export function seccionCambiosDatos(d) {
  const x = d.cambiosPendientes; if (!x) return '';
  const filas = [['Teléfono', d.tel, x.tel], ['Domicilio', d.domicilio, x.domicilio], ['Email', d.email, x.email]].filter(f => f[2]);
  return '<div class="card" style="margin-bottom:10px;border-color:var(--warn)"><b>Pidió actualizar sus datos</b> <span class="small muted">desde el portal, el ' + fdate(x.fecha) + '</span>' +
    filas.map(f => '<div class="small" style="padding:3px 0"><span class="muted">' + f[0] + ':</span> ' + (f[1] ? '<s>' + esc(f[1]) + '</s> → ' : '') + '<b>' + esc(f[2]) + '</b></div>').join('') +
    '<div class="row" style="margin-top:8px"><button class="btn sm grow" onclick="aprobarCambiosDatos(\'' + d.id + '\')">Aplicar cambios</button><button class="btn sec sm" onclick="rechazarCambiosDatos(\'' + d.id + '\')">Descartar</button></div></div>';
}
export async function aprobarCambiosDatos(id) {
  const d = de('drivers', 'id', id)[0]; if (!d || !d.cambiosPendientes) return;
  const x = d.cambiosPendientes, patch = { cambiosPendientes: null };
  if (x.tel) patch.tel = x.tel;
  if (x.domicilio) patch.domicilio = x.domicilio;
  if (x.email) patch.email = x.email;
  if (await save('drivers', Object.assign({}, d, patch))) { toast('Datos actualizados'); window.driverForm(id); }
}
export async function rechazarCambiosDatos(id) {
  const d = de('drivers', 'id', id)[0]; if (!d) return;
  if (await save('drivers', Object.assign({}, d, { cambiosPendientes: null }))) { toast('Cambios descartados'); window.driverForm(id); }
}

/* ---------- Avisos ---------- */
export function alertasPortal() {
  const out = [];
  const add = (o) => { if (!isSnoozed(o.key)) out.push(o); };
  const hace2 = Date.now() - 48 * 3600 * 1000;
  S.cars.filter(c => !c.vendido).forEach(c => {
    const who = c.patente || 'Auto';
    (c.auxilios || []).filter(a => !a.atendido && Date.parse(a.fecha) >= hace2).forEach(a => add({ who, sub: 'Pedido de auxilio', kind: 'car', id: c.id, key: 'car:' + c.id + ':aux:' + a.id, d: -1, cls: 'bad', t: nombre(a.choferId) + ' · ' + fechaHora(a.fecha), accion: "auxilioView('" + c.id + "','" + a.id + "')" }));
    (c.turnosService || []).filter(t => t.estado === 'pedido').forEach(t => add({ who, sub: 'Turno de service pedido', kind: 'car', id: c.id, key: 'car:' + c.id + ':turno:' + t.id, d: 1, cls: 'warn', t: (t.motivo || 'Service') + (t.fecha ? ' · ' + fdate(t.fecha) : ''), accion: "turnoServiceForm('" + c.id + "','" + t.id + "')" }));
    const tg = (c.testigosPortal || []).slice(-1)[0];
    if (tg && tg.testigos.length && tg.fecha >= iso(new Date(Date.now() - 7 * 864e5))) add({ who, sub: 'Luces encendidas en el tablero', kind: 'car', id: c.id, key: 'car:' + c.id + ':testigos:' + tg.fecha, d: 2, cls: 'warn', t: tg.testigos.join(', ') + ' (' + fdate(tg.fecha) + ')' });
    (c.ordenes || []).filter(o => o.opinionChofer && o.opinionChofer.resultado !== 'bien' && !o.opinionAtendida).forEach(o => add({ who, sub: 'El arreglo sigue fallando', kind: 'car', id: c.id, key: 'car:' + c.id + ':opinion:' + o.id, d: 3, cls: 'warn', t: 'OT ' + o.numero + (o.opinionChofer.comentario ? ': ' + o.opinionChofer.comentario : ''), accion: "otForm('" + c.id + "','" + o.id + "')" }));
  });
  S.mantenimientos.filter(m => m.opinionChofer && m.opinionChofer.resultado !== 'bien').forEach(m => {
    const c = carDe(m.carId); if (!c || c.vendido) return;
    add({ who: c.patente || 'Auto', sub: 'El arreglo sigue fallando', kind: 'car', id: c.id, key: 'mant:' + m.id + ':opinion', d: 3, cls: 'warn', t: (m.label || m.item || 'Arreglo') + (m.opinionChofer.comentario ? ': ' + m.opinionChofer.comentario : '') });
  });
  S.drivers.filter(d => d.cambiosPendientes && !d.inactivo).forEach(d => add({ who: d.nombre, sub: 'Pidió actualizar sus datos', kind: 'driver', id: d.id, key: 'driver:' + d.id + ':cambios:' + d.cambiosPendientes.fecha, d: 5, cls: 'soft', t: 'Desde el portal, el ' + fdate(d.cambiosPendientes.fecha) }));
  return out;
}
