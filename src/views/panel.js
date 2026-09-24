import { S, ui } from '../state.js';
import { money, moneyUSD, today, esc, num1 } from '../utils.js';
import { isContract, calc, urgent, driverName, plate, activeCars, cobradoDelMes, cobradoDelMesUSD, cobradoDelMesPorMetodo, financiacionesProximas, financiacionesCompletadasSinTransferir, badge } from '../calc.js';
import { METODOS_PAGO } from '../constants.js';
import { settings } from '../settings.js';
import { alertRow } from './shared.js';

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
    '<div class="card empty"><b>Empecemos por lo básico</b>Cargá tus choferes y tus autos. Después registrás cada cobro semanal y la app te dice quién debe y qué vence.<div style="margin-top:16px" class="row" ><button class="btn grow" onclick="driverForm()">Cargar chofer</button><button class="btn grow" onclick="carForm()">Cargar auto</button></div></div>';
  }
  const morosos = infos.filter(x => x.i.debt > 0 && x.c.tipo !== 'financiado').sort((a, b) => b.i.debt - a.i.debt).slice(0, 5);
  let h = '<h1>Panel</h1><p class="sub">' + t0.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }) + '</p>';
  h += '<div class="row" style="margin-bottom:12px"><button class="btn grow" onclick="payForm()">Cobro rápido</button><button class="btn sec" onclick="gastoGeneralForm()">Gasto rápido</button><button class="btn sec" onclick="searchView()">Buscar</button></div>';
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
