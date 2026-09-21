import { S } from '../state.js';
import { money, iso, today, esc, num1 } from '../utils.js';
import { isContract, calc, urgent, driverName, plate } from '../calc.js';
import { backupCard, alertRow } from './shared.js';

export function viewPanel() {
  const act = S.cars.filter(c => isContract(c) && c.choferId);
  const t0 = today();
  const mes = iso(new Date(t0.getFullYear(), t0.getMonth(), 1));
  const cobMes = S.payments.filter(p => p.fecha >= mes).reduce((a, p) => a + (+p.monto || 0), 0);
  const esperado = act.reduce((a, c) => a + (+c.monto || 0), 0);
  const infos = act.map(c => ({ c, i: calc(c) }));
  const deuda = infos.reduce((a, x) => a + x.i.debt, 0);
  const saldoFin = S.cars.filter(c => c.tipo === 'financiado').reduce((a, c) => a + (calc(c).saldo || 0), 0);
  const urg = urgent();
  if (!S.cars.length && !S.drivers.length) {
    return '<h1>Mi Flota v5</h1><p class="sub">Autos, choferes, cobros y vencimientos en un solo lugar.</p>' +
    '<div class="card empty"><b>Empecemos por lo básico</b>Cargá tus choferes y tus autos. Después registrás cada cobro semanal y la app te dice quién debe y qué vence.<div style="margin-top:16px" class="row" ><button class="btn grow" onclick="driverForm()">Cargar chofer</button><button class="btn grow" onclick="carForm()">Cargar auto</button></div></div>' + backupCard();
  }
  const morosos = infos.filter(x => x.i.debt > 0).sort((a, b) => b.i.debt - a.i.debt).slice(0, 5);
  let h = '<h1>Mi Flota v5</h1><p class="sub">' + t0.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }) + '</p>';
  h += '<div class="grid">' +
    '<div class="kpi"><div class="n">' + money(cobMes) + '</div><div class="l">Cobrado este mes</div></div>' +
    '<div class="kpi"><div class="n">' + money(esperado) + '</div><div class="l">Esperado por semana</div></div>' +
    '<div class="kpi ' + (deuda > 0 ? 'bad' : '') + '"><div class="n">' + money(deuda) + '</div><div class="l">Deuda de choferes</div></div>' +
    '<div class="kpi"><div class="n">' + money(saldoFin) + '</div><div class="l">Falta cobrar de financiados</div></div>' +
    '<div class="kpi"><div class="n">' + act.length + ' de ' + S.cars.length + '</div><div class="l">Autos en la calle</div></div>' +
    '<div class="kpi ' + (urg.length ? 'warn' : '') + ' tap" onclick="go(\'venc\')"><div class="n">' + urg.length + '</div><div class="l">Vencimientos urgentes</div></div>' +
  '</div>';
  h += '<h2>Choferes con deuda</h2>';
  if (!morosos.length) h += '<div class="card muted">Nadie debe nada. Todo al día.</div>';
  morosos.forEach(x => {
    h += '<div class="card tap row" onclick="payForm(\'' + x.c.id + '\')"><div class="grow"><div>' + esc(driverName(x.c.choferId) || 'Sin chofer') + '</div><div class="small muted">' + plate(x.c.patente) + '</div></div><div class="right"><div style="font-weight:700;color:var(--bad)">' + money(x.i.debt) + '</div><div class="small muted">' + num1(x.i.late) + ' sem. de atraso</div></div></div>';
  });
  h += '<h2>Vencimientos urgentes</h2>';
  if (!urg.length) h += '<div class="card muted">Nada vence en los próximos 15 días.</div>';
  urg.slice(0, 6).forEach(a => { h += alertRow(a); });
  if (urg.length > 6) h += '<button class="btn sec block" onclick="go(\'venc\')">Ver los ' + urg.length + '</button>';
  return h + backupCard();
}
