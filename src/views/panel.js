import { S } from '../state.js';
import { money, today, esc, num1 } from '../utils.js';
import { isContract, calc, urgent, driverName, plate, activeCars, cobradoDelMes, financiacionesProximas } from '../calc.js';
import { settings, brandH1 } from '../settings.js';
import { backupCard, alertRow, ajustesCard } from './shared.js';
import { googleCard } from './google-ui.js';

export function viewPanel() {
  const flota = activeCars();
  const act = flota.filter(c => isContract(c) && c.choferId);
  const t0 = today();
  const cobMes = cobradoDelMes(0);
  const cobMesAnt = cobradoDelMes(1);
  const deltaMes = cobMesAnt > 0 ? Math.round((cobMes - cobMesAnt) / cobMesAnt * 100) : (cobMes > 0 ? 100 : null);
  const esperado = act.reduce((a, c) => a + (+c.monto || 0), 0);
  const infos = act.map(c => ({ c, i: calc(c) }));
  const deuda = infos.reduce((a, x) => a + x.i.debt, 0);
  const saldoFin = flota.filter(c => c.tipo === 'financiado').reduce((a, c) => a + (calc(c).saldo || 0), 0);
  const urg = urgent();
  if (!S.cars.length && !S.drivers.length) {
    return brandH1() + '<p class="sub">Autos, choferes, cobros y vencimientos en un solo lugar.</p>' +
    '<div class="card empty"><b>Empecemos por lo básico</b>Cargá tus choferes y tus autos. Después registrás cada cobro semanal y la app te dice quién debe y qué vence.<div style="margin-top:16px" class="row" ><button class="btn grow" onclick="driverForm()">Cargar chofer</button><button class="btn grow" onclick="carForm()">Cargar auto</button></div></div>' + backupCard();
  }
  const morosos = infos.filter(x => x.i.debt > 0).sort((a, b) => b.i.debt - a.i.debt).slice(0, 5);
  let h = brandH1() + '<p class="sub">' + t0.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }) + '</p>';
  h += '<div class="row" style="margin-bottom:12px"><button class="btn grow" onclick="payForm()">Cobro rápido</button><button class="btn sec" onclick="searchView()">Buscar</button></div>';
  h += '<div class="grid">' +
    '<div class="kpi"><div class="n">' + money(cobMes) + '</div><div class="l">Cobrado este mes' + (deltaMes != null ? ' <span style="color:' + (deltaMes >= 0 ? 'var(--ok)' : 'var(--bad)') + '">' + (deltaMes >= 0 ? '▲' : '▼') + Math.abs(deltaMes) + '%</span>' : '') + '</div></div>' +
    '<div class="kpi"><div class="n">' + money(esperado) + '</div><div class="l">Esperado por semana</div></div>' +
    '<div class="kpi ' + (deuda > 0 ? 'bad' : '') + '"><div class="n">' + money(deuda) + '</div><div class="l">Deuda de choferes</div></div>' +
    '<div class="kpi"><div class="n">' + money(saldoFin) + '</div><div class="l">Falta cobrar de financiados</div></div>' +
    '<div class="kpi"><div class="n">' + act.length + ' de ' + flota.length + '</div><div class="l">Autos en la calle</div></div>' +
    '<div class="kpi ' + (urg.length ? 'warn' : '') + ' tap" onclick="go(\'venc\')"><div class="n">' + urg.length + '</div><div class="l">Vencimientos urgentes</div></div>' +
  '</div>';
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
  return h + ajustesCard() + googleCard() + backupCard();
}
