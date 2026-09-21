import { S } from '../state.js';
import { esc, money, today } from '../utils.js';
import { plate, rentabilidadAuto, driverTotalPagado, activeCars, isContract, calc, cobradoDelMes, diasEnTaller, gastoMantenimientoAuto, rankingMultasChoferes } from '../calc.js';
import { isAdmin } from '../roles.js';

function cobrosPorMes(n) {
  const t = today();
  const meses = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(t.getFullYear(), t.getMonth() - i, 1);
    meses.push({ label: d.toLocaleDateString('es-AR', { month: 'short' }), total: cobradoDelMes(i) });
  }
  return meses;
}

function seccionGrafico() {
  const meses = cobrosPorMes(6);
  const max = Math.max(1, ...meses.map(m => m.total));
  const w = 300, bw = w / meses.length;
  const bars = meses.map((m, i) => {
    const bh = Math.round((m.total / max) * 85);
    const x = i * bw + bw * 0.15, y = 95 - bh, bw2 = bw * 0.7;
    return '<rect x="' + x + '" y="' + y + '" width="' + bw2 + '" height="' + bh + '" rx="3" fill="var(--info)"/>' +
      '<text x="' + (x + bw2 / 2) + '" y="108" font-size="9" text-anchor="middle" fill="var(--muted)">' + esc(m.label) + '</text>';
  }).join('');
  return '<h2>Evolución de cobros</h2><div class="card"><svg viewBox="0 0 ' + w + ' 116" style="width:100%;height:auto" role="img" aria-label="Cobros por mes">' + bars + '</svg></div>';
}

function seccionRentabilidad() {
  if (!isAdmin()) return '';
  const rows = activeCars().map(c => Object.assign({ c }, rentabilidadAuto(c))).sort((a, b) => b.neta - a.neta);
  if (!rows.length) return '';
  let h = '<h2>Rentabilidad por auto</h2>';
  h += rows.map(r => '<div class="card"><div class="row between"><div>' + plate(r.c.patente) + '</div><b style="color:' + (r.neta >= 0 ? 'var(--ok)' : 'var(--bad)') + '">' + money(r.neta) + '</b></div>' +
    '<div class="row between small muted" style="margin-top:4px"><span>Cobrado ' + money(r.cobrado) + '</span><span>Gastos ' + money(r.gastos) + '</span></div>' +
    (r.costoCompra ? '<div class="small muted" style="margin-top:2px">Costo de compra: ' + money(r.costoCompra) + (r.cobrado >= r.costoCompra ? ' · ya recuperado' : ' · recuperado ' + Math.round(r.cobrado / r.costoCompra * 100) + '%') + '</div>' : '') +
    (diasEnTaller(r.c) ? '<div class="small muted">' + diasEnTaller(r.c) + ' días parado en taller</div>' : '') +
    '</div>').join('');
  return h;
}

function seccionComparativaChoferes() {
  const rows = S.drivers.filter(d => !d.inactivo && !d.prospecto).map(d => ({ d, total: driverTotalPagado(d.id) })).filter(x => x.total > 0).sort((a, b) => b.total - a.total).slice(0, 10);
  if (!rows.length) return '';
  return '<h2>Choferes por total pagado</h2>' + rows.map((x, i) => '<div class="card row between"><span>' + (i + 1) + '. ' + esc(x.d.nombre) + '</span><b>' + money(x.total) + '</b></div>').join('');
}

function seccionMantenimiento() {
  const rows = activeCars().map(c => ({ c, total: gastoMantenimientoAuto(c) })).filter(x => x.total > 0).sort((a, b) => b.total - a.total);
  if (!rows.length) return '';
  return '<h2>Gasto de mantenimiento por auto</h2>' + rows.map(x => '<div class="card row between"><span>' + plate(x.c.patente) + '</span><b>' + money(x.total) + '</b></div>').join('');
}

function seccionMultasChoferes() {
  const rows = rankingMultasChoferes().slice(0, 10);
  if (!rows.length) return '';
  return '<h2>Choferes por multas</h2>' + rows.map(x => '<div class="card row between"><span>' + esc(x.nombre || 'Chofer eliminado') + ' <span class="small muted">(' + x.cantidad + (x.cantidad === 1 ? ' multa' : ' multas') + ')</span></span><b>' + money(x.total) + '</b></div>').join('');
}

function seccionComparacionMensual() {
  const [ant, act] = cobrosPorMes(2);
  const delta = ant.total > 0 ? Math.round((act.total - ant.total) / ant.total * 100) : (act.total > 0 ? 100 : 0);
  const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '—';
  const color = delta > 0 ? 'var(--ok)' : delta < 0 ? 'var(--bad)' : 'var(--muted)';
  return '<h2>Este mes vs. el anterior</h2><div class="card row between">' +
    '<div><div class="small muted">Mes anterior</div><b>' + money(ant.total) + '</b></div>' +
    '<div style="color:' + color + ';font-weight:700;text-align:center">' + arrow + ' ' + Math.abs(delta) + '%</div>' +
    '<div style="text-align:right"><div class="small muted">Este mes</div><b>' + money(act.total) + '</b></div></div>';
}

function proyeccionIngresos(semanasVentana) {
  let total = 0;
  activeCars().filter(c => isContract(c) && c.choferId).forEach(c => {
    const i = calc(c);
    let sem = semanasVentana;
    if (c.tipo === 'financiado' && c.cuotas) sem = Math.min(semanasVentana, Math.max(0, (+c.cuotas) - i.weeks));
    total += sem * (+c.monto || 0);
  });
  return total;
}
function seccionProyeccion() {
  const p = proyeccionIngresos(13);
  return '<h2>Proyección próximos 3 meses</h2><div class="card"><div class="small muted" style="margin-bottom:4px">Según los contratos activos y las cuotas que les quedan.</div><b style="font-size:20px">' + money(p) + '</b></div>';
}

export function viewReportes() {
  if (!S.cars.length) return '<h1>Reportes</h1><p class="sub">Rentabilidad, comparativas y proyecciones</p><div class="card empty">Cargá autos y cobros para ver reportes acá.</div>';
  let h = '<h1>Reportes</h1><p class="sub">Rentabilidad, comparativas y proyecciones</p>';
  h += seccionComparacionMensual();
  h += seccionGrafico();
  h += seccionProyeccion();
  h += seccionRentabilidad();
  h += seccionComparativaChoferes();
  h += seccionMantenimiento();
  h += seccionMultasChoferes();
  return h;
}
