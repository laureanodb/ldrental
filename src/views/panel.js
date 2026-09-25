import { S, ui } from '../state.js';
import { money, moneyUSD, today, esc, num1 } from '../utils.js';
import { isContract, calc, urgent, driverName, plate, activeCars, cobradoDelMes, cobradoDelMesUSD, cobradoDelMesPorMetodo, financiacionesProximas, financiacionesCompletadasSinTransferir, resumenEstadoFlota, badge } from '../calc.js';
import { METODOS_PAGO, TIPOS } from '../constants.js';
import { settings } from '../settings.js';
import { alertRow } from './shared.js';
import { isSnoozed, snooze } from '../snooze.js';
import { render } from '../nav.js';
import { toast } from '../modal.js';

export function viewPanel() {
  const flota = activeCars();
  const act = flota.filter(c => isContract(c) && c.choferId);
  const t0 = today();
  const cobMes = cobradoDelMes(0);
  const cobMesUSD = cobradoDelMesUSD(0);
  const cobMesAnt = cobradoDelMes(1);
  const deltaMes = cobMesAnt > 0 ? Math.round((cobMes - cobMesAnt) / cobMesAnt * 100) : (cobMes > 0 ? 100 : null);
  const esperado = act.filter(c => c.tipo !== 'financiado').reduce((a, c) => a + (+c.monto || 0), 0);
  const esperadoUSD = act.filter(c => c.tipo === 'financiado').reduce((a, c) => a + (+c.monto || 0), 0);
  const infos = act.map(c => ({ c, i: calc(c) }));
  const deuda = infos.filter(x => x.c.tipo !== 'financiado').reduce((a, x) => a + x.i.debt, 0);
  const saldoFin = flota.filter(c => c.tipo === 'financiado').reduce((a, c) => a + (calc(c).saldo || 0), 0);
  const disponibles = flota.filter(c => c.tipo === 'disponible').length;
  const urg = urgent();
  if (!S.cars.length && !S.drivers.length) {
    return '<h1>Panel</h1><p class="sub">Autos, choferes, cobros y vencimientos en un solo lugar.</p>' +
    '<div class="card empty"><b>Empecemos por lo básico</b>Cargá tus choferes y tus autos. Después registrás cada cobro semanal y la app te dice quién debe y qué vence.<div style="margin-top:16px" class="row" ><button class="btn grow" onclick="altaRapidaChoferForm()">Cargar chofer</button><button class="btn grow" onclick="altaRapidaAutoForm()">Cargar auto</button></div></div>';
  }
  const morosos = infos.filter(x => x.i.debt > 0 && x.c.tipo !== 'financiado').sort((a, b) => b.i.debt - a.i.debt).slice(0, 5);
  let h = '<h1>Panel</h1><p class="sub">' + saludo(t0, morosos.length, urg.length) + '</p>';
  h += '<div class="row" style="margin-bottom:12px"><button class="btn grow" onclick="payForm()">Cobro rápido</button><button class="btn sec" onclick="gastoGeneralForm()">Gasto rápido</button><button class="btn sec" onclick="searchView()">Buscar</button></div>';
  h += notaInternaCard();
  h += seccionSugerenciasHoy(morosos, urg);
  const ef = resumenEstadoFlota();
  if (ef.total) {
    h += '<div class="card" style="margin-bottom:12px"><div class="small muted" style="margin-bottom:6px">Flota de un vistazo · ' + ef.total + ' auto' + (ef.total === 1 ? '' : 's') + '</div>' +
    '<div class="row" style="flex-wrap:wrap;gap:6px 12px">' + Object.keys(TIPOS).filter(k => ef.porTipo[k]).map(k => '<span class="small">' + ef.porTipo[k] + ' ' + esc(TIPOS[k].toLowerCase()) + '</span>').join('') + '</div>' +
    '<div class="row" style="flex-wrap:wrap;gap:6px 12px;margin-top:6px">' +
    (ef.porEstado.ok + ef.porEstado.soft ? '<span class="small" style="color:var(--ok)">● ' + (ef.porEstado.ok + ef.porEstado.soft) + ' al día</span>' : '') +
    (ef.porEstado.warn ? '<span class="small" style="color:var(--warn)">● ' + ef.porEstado.warn + ' con pendientes</span>' : '') +
    (ef.porEstado.bad ? '<span class="small" style="color:var(--bad)">● ' + ef.porEstado.bad + ' vencidos</span>' : '') +
    '</div></div>';
  }
  const kpis = {
    cobrado: '<div class="kpi tap" onclick="ui.showDesgloseCobrado=!ui.showDesgloseCobrado;render()"><div class="n">' + money(cobMes) + (cobMesUSD ? '<div class="small">+ ' + moneyUSD(cobMesUSD) + '</div>' : '') + '</div><div class="l">Cobrado este mes' + (deltaMes != null ? ' <span style="color:' + (deltaMes >= 0 ? 'var(--ok)' : 'var(--bad)') + '">' + (deltaMes >= 0 ? '▲' : '▼') + Math.abs(deltaMes) + '%</span>' : '') + '</div></div>',
    esperado: '<div class="kpi"><div class="n">' + money(esperado) + (esperadoUSD ? '<div class="small">+ ' + moneyUSD(esperadoUSD) + '</div>' : '') + '</div><div class="l">Esperado por semana</div></div>',
    deuda: '<div class="kpi ' + (deuda > 0 ? 'bad' : '') + '"><div class="n">' + money(deuda) + '</div><div class="l">Deuda de choferes</div></div>',
    saldoFin: '<div class="kpi"><div class="n">' + moneyUSD(saldoFin) + '</div><div class="l">Falta cobrar de financiados</div></div>',
    autosCalle: '<div class="kpi"><div class="n">' + act.length + ' de ' + flota.length + '</div><div class="l">Autos en la calle</div></div>',
    vencUrgentes: '<div class="kpi ' + (urg.length ? 'warn' : '') + ' tap" onclick="go(\'venc\')"><div class="n">' + urg.length + '</div><div class="l">Vencimientos urgentes</div></div>',
    autosDisponibles: '<div class="kpi tap" onclick="ui.filtroAutoTipo=\'disponible\';go(\'autos\')"><div class="n">' + disponibles + '</div><div class="l">Autos disponibles</div></div>',
  };
  const activos = (settings.panelKpis && settings.panelKpis.length) ? settings.panelKpis : Object.keys(kpis);
  h += '<div class="grid">' + activos.filter(k => kpis[k]).map(k => kpis[k]).join('') + '</div>';
  if (ui.showDesgloseCobrado) {
    const porMetodo = cobradoDelMesPorMetodo(0);
    const metodoLabel = m => m === 'sin_especificar' ? 'Sin especificar' : ((METODOS_PAGO.find(x => x[0] === m) || [0, m])[1]);
    h += '<div class="card" style="margin-bottom:12px"><div class="small muted" style="margin-bottom:6px">Cobrado este mes por método de pago</div>' +
    (Object.keys(porMetodo).length ? Object.entries(porMetodo).sort((a, b) => b[1] - a[1]).map(([m, monto]) => '<div class="row between small" style="padding:2px 0"><span>' + esc(metodoLabel(m)) + '</span><b>' + money(monto) + '</b></div>').join('') : '<div class="small muted">Sin cobros este mes.</div>') + '</div>';
  }
  h += '<h2>Choferes con deuda</h2>';
  if (!morosos.length) h += '<div class="card muted">Nadie debe nada. Todo al día.</div>';
  morosos.forEach(x => {
    h += '<div class="card tap row" onclick="payForm(\'' + x.c.id + '\')"><div class="grow"><div>' + esc(driverName(x.c.choferId) || 'Sin chofer') + '</div><div class="small muted">' + plate(x.c.patente) + '</div></div><div class="right"><div style="font-weight:700;color:var(--bad)">' + money(x.i.debt) + '</div><div class="small muted">' + num1(x.i.late) + ' sem. de atraso</div></div></div>';
  });
  h += '<h2>Vencimientos urgentes</h2>';
  if (!urg.length) h += '<div class="card muted">Nada vence en los próximos ' + settings.avisoWarn + ' días.</div>';
  urg.slice(0, 6).forEach(a => { h += alertRow(a); });
  if (urg.length > 6) h += '<button class="btn sec block" onclick="go(\'venc\')">Ver los ' + urg.length + '</button>';
  const finProx = financiacionesProximas(4);
  if (finProx.length) {
    h += '<h2>Financiaciones por terminar</h2>' + finProx.map(x => '<div class="card tap row between" onclick="carForm(\'' + x.c.id + '\')"><div><div>' + plate(x.c.patente) + '</div><div class="small muted">' + esc(driverName(x.c.choferId)) + '</div></div><div class="right"><b>' + x.restantes + '</b><div class="small muted">' + (x.restantes === 1 ? 'cuota' : 'cuotas') + '</div></div></div>').join('');
  }
  const finSinTransferir = financiacionesCompletadasSinTransferir();
  if (finSinTransferir.length) {
    h += '<h2>Pagadas, falta transferir titularidad</h2>' + finSinTransferir.map(c => '<div class="card tap row between" onclick="carForm(\'' + c.id + '\')"><div><div>' + plate(c.patente) + '</div><div class="small muted">' + esc(driverName(c.choferId)) + '</div></div>' + badge('warn', 'Pendiente') + '</div>').join('');
  }
  return h;
}
function saludo(t0, cantMorosos, cantUrg) {
  const hora = t0.getHours();
  const finde = t0.getDay() === 0 || t0.getDay() === 6;
  const momento = hora < 6 ? 'Buenas noches' : hora < 12 ? 'Buen día' : hora < 20 ? 'Buenas tardes' : 'Buenas noches';
  const fecha = t0.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  const pend = [];
  if (cantMorosos) pend.push(cantMorosos + ' cobro' + (cantMorosos === 1 ? '' : 's') + ' pendiente' + (cantMorosos === 1 ? '' : 's'));
  if (cantUrg) pend.push(cantUrg + ' vencimiento' + (cantUrg === 1 ? '' : 's') + ' urgente' + (cantUrg === 1 ? '' : 's'));
  if (!pend.length) return momento + ' · ' + fecha + (finde ? ' · disfrutá, no hay nada urgente' : ' · todo al día');
  return momento + ' · ' + fecha + ' · ' + (finde ? 'para cuando quieras: ' : 'hoy tenés ') + pend.join(' y ');
}
function seccionSugerenciasHoy(morosos, urg) {
  const sugerencias = [];
  if (morosos.length) sugerencias.push({ key: 'sug:cobro:' + morosos[0].c.id, t: 'Llamá a ' + driverName(morosos[0].c.choferId) + ': debe ' + money(morosos[0].i.debt), accion: "payForm('" + morosos[0].c.id + "')", cta: 'Cobrar' });
  const venc = urg.filter(a => a.cls === 'bad').concat(urg.filter(a => a.cls === 'warn'))[0];
  if (venc) sugerencias.push({ key: 'sug:venc:' + venc.kind + ':' + venc.id, t: (venc.sub || 'Vencimiento') + ' de ' + venc.who + ': ' + venc.t, accion: venc.kind === 'car' ? "carForm('" + venc.id + "')" : "driverForm('" + venc.id + "')", cta: 'Ver' });
  if (morosos.length > 1) sugerencias.push({ key: 'sug:cobro:' + morosos[1].c.id, t: 'También debe ' + driverName(morosos[1].c.choferId) + ': ' + money(morosos[1].i.debt), accion: "payForm('" + morosos[1].c.id + "')", cta: 'Cobrar' });
  const vigentes = sugerencias.filter(s => !isSnoozed(s.key));
  if (!vigentes.length) return '';
  return '<div class="card" style="margin-bottom:12px"><div class="small muted" style="margin-bottom:6px">Sugerido para hoy</div>' +
  vigentes.slice(0, 3).map(s => '<div class="row between" style="padding:4px 0"><span class="small">' + esc(s.t) + '</span><span class="row" style="gap:6px"><button class="btn sec sm" onclick="resolverSugerencia(\'' + s.key + '\');' + s.accion + '">' + s.cta + '</button><button class="btn sec sm" onclick="posponerSugerencia(\'' + s.key + '\')" title="Posponer">···</button></span></div>').join('') + '</div>';
}
export function posponerSugerencia(key) {
  snooze(key, 3);
  toast('Pospuesto por 3 días'); render();
}
export function resolverSugerencia(key) {
  snooze(key, 1);
}
function notaInternaCard() {
  if (ui.editandoNota) {
    return '<div class="card" style="margin-bottom:12px;background:#fff8c4;border-color:#e8d47a"><div class="small muted" style="margin-bottom:6px">Nota interna <small>la ve todo el equipo</small></div>' +
    '<textarea id="pn_nota" placeholder="ej: el sábado no hay atención, avisar a los choferes...">' + esc(settings.notaInterna) + '</textarea>' +
    '<div class="row" style="margin-top:8px"><button class="btn sec sm" onclick="guardarNotaInterna()">Guardar</button><button class="btn sec sm" onclick="ui.editandoNota=false;render()">Cancelar</button></div></div>';
  }
  if (!settings.notaInterna) {
    return '<div class="card tap" style="margin-bottom:12px" onclick="ui.editandoNota=true;render()"><span class="small muted">+ Agregar nota interna para el equipo</span></div>';
  }
  return '<div class="card tap" style="margin-bottom:12px;background:#fff8c4;border-color:#e8d47a" onclick="ui.editandoNota=true;render()"><div class="small muted" style="margin-bottom:4px">Nota interna</div><div style="white-space:pre-wrap">' + esc(settings.notaInterna) + '</div></div>';
}
