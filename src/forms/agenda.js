// Agenda del día: en una sola pantalla lo que pasa hoy y mañana (o en los próximos 7 días):
// cobros que vencen, choferes que avisaron que pagan ese día, devoluciones, turnos de taller,
// tareas del equipo, vencimientos de papeles, licencias, multas y patentes, y cumpleaños.
import { S } from '../state.js';
import { esc, iso, today, parse, days, money, moneyUSD } from '../utils.js';
import { openModal } from '../modal.js';
import { VENC } from '../constants.js';
import { isContract, calc, driverName } from '../calc.js';
import { esMensual, fechaMes, montoMensual } from '../financiados.js';
import { esMia } from './recordatorio.js';
import { isAdmin, isSupervisor } from '../roles.js';
import { descargarIcs } from '../ics.js';

const DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const etiquetaDia = (f, hoy) => { const d = days(parse(hoy), parse(f)); return d === 0 ? 'Hoy' : d === 1 ? 'Mañana' : DIA[parse(f).getDay()].replace(/^./, x => x.toUpperCase()) + ' ' + f.slice(8, 10) + '/' + f.slice(5, 7); };

// ¿Le toca pagar a este auto en la fecha f?
export function cobroEnFecha(c, f) {
  if (!isContract(c) || !c.inicio || !c.monto || f < c.inicio) return null;
  if (esMensual(c)) {
    for (let n = 1; n < 600; n++) { const x = iso(fechaMes(c.inicio, n)); if (x === f) return n; if (x > f) return null; }
    return null;
  }
  const d = days(parse(c.inicio), parse(f));
  if (d % 7 !== 0) return null;
  const n = d / 7 + 1;
  if (c.tipo === 'financiado' && +c.cuotas && n > +c.cuotas) return null;
  return n;
}

// Todo lo de una fecha: [{ tipo, texto, sub, accion, cls }]
export function eventosDelDia(f) {
  const out = [];
  const veTodo = isAdmin() || isSupervisor();
  const autos = S.cars.filter(c => !c.vendido);
  autos.forEach(c => {
    const n = cobroEnFecha(c, f);
    if (n) {
      const i = calc(c), mon = c.tipo === 'financiado' ? moneyUSD : money;
      out.push({ tipo: 'Cobro', texto: (driverName(c.choferId) || 'Sin chofer') + ' · ' + c.patente, sub: (c.tipo === 'alquiler' ? 'Semana ' + n : 'Cuota ' + n) + ': ' + mon(esMensual(c) ? montoMensual(c) : c.monto) + (i.debt > 0 ? ' · hoy debe ' + mon(i.debt) : ' · está al día'), accion: "payForm('" + c.id + "')", cls: i.debt > 0 ? 'warn' : 'ok' });
    }
    (c.turnosService || []).filter(t => (t.fechaConfirmada || t.fecha) === f && t.estado !== 'cancelado').forEach(t => {
      out.push({ tipo: 'Taller', texto: c.patente + ' · ' + (t.motivo || 'Service'), sub: [(t.horaConfirmada || t.hora) ? 'a las ' + (t.horaConfirmada || t.hora) : '', t.nota || '', t.estado === 'pedido' ? 'pedido por el chofer, sin confirmar' : ''].filter(Boolean).join(' · '), accion: "carForm('" + c.id + "')", cls: 'info' });
    });
    VENC.forEach(([k, l]) => { if (c[k] === f) out.push({ tipo: 'Vence', texto: l + ' · ' + c.patente, sub: '', accion: "carForm('" + c.id + "')", cls: 'bad' }); });
    const u = c.consultaPatente;
    if (u && u.resultado === 'debe' && u.vencimiento === f) out.push({ tipo: 'Vence', texto: 'Patente · ' + c.patente, sub: 'Debe ' + money(u.monto), accion: 'consultaPatenteView()', cls: 'bad' });
  });
  S.drivers.filter(d => !d.inactivo && !d.prospecto).forEach(d => {
    (d.avisosAtraso || []).filter(a => a.pagaEl === f && a.estado !== 'cerrado').forEach(a => out.push({ tipo: 'Promesa de pago', texto: d.nombre, sub: 'Avisó por el portal que paga este día' + (a.motivo ? ': ' + a.motivo : ''), accion: "driverForm('" + d.id + "')", cls: 'warn' }));
    if (d.devolucion && d.devolucion.estado === 'avisada' && d.devolucion.fechaDevolucion === f) {
      const c = S.cars.find(x => x.id === d.devolucion.carId);
      out.push({ tipo: 'Devolución', texto: d.nombre + (c ? ' devuelve el ' + c.patente : ' devuelve el auto'), sub: d.devolucion.motivo || '', accion: "driverForm('" + d.id + "')", cls: 'warn' });
    }
    if (d.licVenc === f) out.push({ tipo: 'Vence', texto: 'Licencia de ' + d.nombre, sub: '', accion: "driverForm('" + d.id + "')", cls: 'bad' });
    if (d.antecedentesVenc === f) out.push({ tipo: 'Vence', texto: 'Antecedentes de ' + d.nombre, sub: '', accion: "driverForm('" + d.id + "')", cls: 'bad' });
    if (d.fechaNacimiento && d.fechaNacimiento.slice(5) === f.slice(5)) out.push({ tipo: 'Cumpleaños', texto: d.nombre, sub: 'Cumple ' + (+f.slice(0, 4) - +d.fechaNacimiento.slice(0, 4)) + ' años', accion: "driverForm('" + d.id + "')", cls: 'ok' });
  });
  S.multas.filter(m => m.fechaLimitePago === f && m.estado === 'pendiente').forEach(m => {
    const c = S.cars.find(x => x.id === m.carId);
    out.push({ tipo: 'Vence', texto: 'Multa' + (c ? ' · ' + c.patente : ''), sub: money(m.monto) + (m.choferId ? ' · ' + driverName(m.choferId) : ''), accion: "multaForm('" + m.carId + "','" + m.id + "')", cls: 'bad' });
  });
  S.recordatorios.filter(r => !r.hecho && r.fecha === f && (esMia(r) || veTodo)).forEach(r => {
    const c = r.carId ? S.cars.find(x => x.id === r.carId) : null;
    out.push({ tipo: 'Tarea', texto: r.texto, sub: [c ? c.patente : '', r.asignadoA && !esMia(r) ? 'para ' + r.asignadoA.split('@')[0] : ''].filter(Boolean).join(' · '), accion: "toggleHechoRecordatorio('" + r.id + "','agenda')", boton: 'Hecha', cls: 'info' });
  });
  const orden = ['Promesa de pago', 'Devolución', 'Cobro', 'Taller', 'Tarea', 'Vence', 'Cumpleaños'];
  return out.sort((a, b) => orden.indexOf(a.tipo) - orden.indexOf(b.tipo));
}

let rango = 2;
export function agendaView(r) {
  if (r) rango = r;
  const hoy = iso(today());
  // Lo atrasado que sigue abierto: tareas vencidas mías.
  const atrasadas = S.recordatorios.filter(x => !x.hecho && x.fecha && x.fecha < hoy && esMia(x));
  const tab = (n, t) => '<button class="btn ' + (rango === n ? '' : 'sec ') + 'sm grow" onclick="agendaView(' + n + ')">' + t + '</button>';
  let h = '<h3>Agenda</h3><div class="row" style="margin-bottom:10px">' + tab(2, 'Hoy y mañana') + tab(7, 'Próximos 7 días') + '</div>';
  if (atrasadas.length) h += '<div class="card" style="border-color:var(--bad)"><b>Tareas atrasadas</b>' + atrasadas.map(r2 => '<div class="row between small" style="padding:4px 0;gap:8px"><span>' + esc(r2.texto) + '</span><button class="btn sec sm" onclick="toggleHechoRecordatorio(\'' + r2.id + '\',\'agenda\')">Hecha</button></div>').join('') + '</div>';
  for (let i = 0; i < rango; i++) {
    const d = today(); d.setDate(d.getDate() + i);
    const f = iso(d), E = eventosDelDia(f);
    h += '<div class="sec-t">' + etiquetaDia(f, hoy) + (i < 2 ? ' <span class="small muted" style="font-weight:400">' + DIA[d.getDay()] + ' ' + f.slice(8, 10) + '/' + f.slice(5, 7) + '</span>' : '') + '</div>';
    h += E.length ? E.map(e => '<div class="card row" style="gap:10px"><div class="grow tap" style="min-width:0" onclick="' + (e.boton ? '' : e.accion) + '"><span class="badge b-' + e.cls + '">' + esc(e.tipo) + '</span> <b>' + esc(e.texto) + '</b>' + (e.sub ? '<div class="small muted">' + esc(e.sub) + '</div>' : '') + '</div>' +
      (e.boton ? '<button class="btn sec sm" onclick="' + e.accion + '">' + e.boton + '</button>' : '') + '</div>').join('') : '<div class="small muted" style="margin-bottom:8px">Nada agendado.</div>';
  }
  h += '<button class="btn sec block" style="margin-top:10px" onclick="agendaAlCalendario()">Pasar ' + (rango === 2 ? 'hoy y mañana' : 'estos 7 días') + ' al calendario del celular</button>' +
    '<div class="row" style="margin-top:8px"><button class="btn sec grow" onclick="recordatoriosView()">+ Nueva tarea</button><button class="btn sec" onclick="closeModal()">Cerrar</button></div>';
  openModal(h);
}

// Todo lo de la agenda visible, al calendario del celular (cumpleaños y cobros incluidos).
export function agendaAlCalendario() {
  const E = [];
  for (let i = 0; i < rango; i++) {
    const d = today(); d.setDate(d.getDate() + i);
    const f = iso(d);
    eventosDelDia(f).forEach((e, k) => E.push({ id: 'agenda-' + f + '-' + k + '-' + e.tipo, titulo: e.tipo + ': ' + e.texto, fecha: f, descripcion: e.sub }));
  }
  descargarIcs(E, 'agenda-ldrental');
}
