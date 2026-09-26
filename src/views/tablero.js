import { ui } from '../state.js';
import { esc, money, moneyUSD } from '../utils.js';
import { tableroSemanal, driverName, plate, badge } from '../calc.js';

export function tableroFiltrado() {
  const orden = ui.tableroOrden || 'neto';
  return tableroSemanal().sort((a, b) => {
    if (orden === 'deuda') return b.deuda - a.deuda;
    if (orden === 'cobrado') return b.cobrado - a.cobrado;
    return a.neto - b.neto;
  });
}
export function viewTablero() {
  const L = tableroSemanal();
  if (!L.length) return '<h1>Tablero semanal</h1><p class="sub">Cobrado, gastos y ganancia de los últimos 7 días, por auto</p><div class="card empty">No hay autos con chofer asignado todavía.</div>';
  const totalNeto = L.reduce((a, x) => a + (x.c.tipo === 'financiado' ? 0 : x.neto), 0);
  let h = '<h1>Tablero semanal</h1><p class="sub">Cobrado, gastos y ganancia de los últimos 7 días, por auto</p>';
  h += '<div class="card row between" style="margin-bottom:12px"><span class="muted">Ganancia neta (últimos 7 días)</span><b style="color:' + (totalNeto >= 0 ? 'var(--ok)' : 'var(--bad)') + '">' + money(totalNeto) + '</b></div>';
  h += '<label class="f" style="margin-bottom:10px"><span>Ordenar por</span><select onchange="ui.tableroOrden=this.value;renderList()">' +
  '<option value="neto"' + ((!ui.tableroOrden || ui.tableroOrden === 'neto') ? ' selected' : '') + '>Ganancia (peor primero)</option>' +
  '<option value="cobrado"' + (ui.tableroOrden === 'cobrado' ? ' selected' : '') + '>Cobrado (mayor primero)</option>' +
  '<option value="deuda"' + (ui.tableroOrden === 'deuda' ? ' selected' : '') + '>Deuda (mayor primero)</option></select></label>';
  h += '<div id="list"></div>';
  return h;
}
export function listTablero() {
  const L = tableroFiltrado();
  return L.map(x => {
    const mon = x.c.tipo === 'financiado' ? moneyUSD : money;
    return '<div class="card tap" onclick="carForm(\'' + x.c.id + '\')"><div class="row between"><div>' + plate(x.c.patente) + '<div class="small muted">' + esc(driverName(x.c.choferId)) + '</div></div>' +
    (x.deuda > 0 ? badge('bad', 'Debe ' + mon(x.deuda)) : badge('ok', 'Al día')) + '</div>' +
    '<div class="row between" style="margin-top:8px;flex-wrap:wrap;gap:6px 14px">' +
    '<div class="small"><span class="muted">Cobrado 7d</span><br>' + mon(x.cobrado) + '</div>' +
    '<div class="small"><span class="muted">Gasto 7d</span><br>' + mon(x.gasto) + '</div>' +
    '<div class="small"><span class="muted">Neto 7d</span><br><b style="color:' + (x.neto >= 0 ? 'var(--ok)' : 'var(--bad)') + '">' + mon(x.neto) + '</b></div></div>' +
    (x.deuda > 0 ? '<button class="btn sec sm block" style="margin-top:8px" onclick="event.stopPropagation();payForm(\'' + x.c.id + '\')">Cobrar</button>' : '') +
    '</div>';
  }).join('');
}
