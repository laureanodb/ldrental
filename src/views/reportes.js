import { S, ui } from '../state.js';
import { esc, money, moneyUSD, today } from '../utils.js';
import { plate, rentabilidadAuto, driverTotalPagado, activeCars, isContract, calc, cobradoDelMes, cobradoDelMesUSD, diasEnTaller, gastoMantenimientoAuto, gastosPorCategoria, rankingMultasChoferes, resumenAnual, siniestrosDeAuto, rankingSiniestrosChoferes, comparativaChoferes, comparativaAutos, puntoEquilibrio, rankingMensualChoferes, rankingRoiAutos, porcentajePerdidaGanancia, saludChoferes, alertasTendencia, proyeccionRentabilidadTendencia, badge } from '../calc.js';
import { canVerFinanzas } from '../roles.js';
import { GASTO_CATS, CANALES_PROSPECTO } from '../constants.js';

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
  const usdMes = cobradoDelMesUSD(0);
  return '<h2>Evolución de cobros</h2><div class="card"><div class="small muted" style="margin-bottom:6px">En pesos (alquileres)</div><svg viewBox="0 0 ' + w + ' 116" style="width:100%;height:auto" role="img" aria-label="Cobros por mes">' + bars + '</svg>' +
  (usdMes ? '<div class="small muted" style="margin-top:6px">Cobrado en dólares este mes (financiados): ' + moneyUSD(usdMes) + '</div>' : '') + '</div>';
}

function seccionRankingRentabilidad(rows) {
  if (rows.length < 3) return '';
  const mejores = rows.slice(0, 5);
  const peores = rows.slice().sort((a, b) => a.neta - b.neta).slice(0, 5);
  const fila = r => '<div class="card row between"><span>' + plate(r.c.patente) + '</span><b style="color:' + (r.neta >= 0 ? 'var(--ok)' : 'var(--bad)') + '">' + money(r.neta) + '</b></div>';
  return '<h2>Mejores y peores por rentabilidad</h2>' +
  '<div class="sec-t">Mejores</div>' + mejores.map(fila).join('') +
  '<div class="sec-t">Peores</div>' + peores.map(fila).join('');
}
function seccionRentabilidad() {
  if (!canVerFinanzas()) return '';
  const rows = activeCars().filter(c => c.tipo !== 'financiado').map(c => Object.assign({ c }, rentabilidadAuto(c))).sort((a, b) => b.neta - a.neta);
  if (!rows.length) return '';
  let h = seccionRankingRentabilidad(rows);
  h += '<h2>Rentabilidad por auto</h2>';
  h += rows.map(r => {
    const eq = puntoEquilibrio(r.c);
    return '<div class="card"><div class="row between"><div>' + plate(r.c.patente) + '</div><b style="color:' + (r.neta >= 0 ? 'var(--ok)' : 'var(--bad)') + '">' + money(r.neta) + '</b></div>' +
    '<div class="row between small muted" style="margin-top:4px"><span>Cobrado ' + money(r.cobrado) + '</span><span>Gastos ' + money(r.gastos) + '</span></div>' +
    (r.costoCompra ? '<div class="small muted" style="margin-top:2px">Costo de compra: ' + money(r.costoCompra) + (r.cobrado >= r.costoCompra ? ' · ya recuperado' : ' · recuperado ' + Math.round(r.cobrado / r.costoCompra * 100) + '%') + '</div>' : '') +
    (eq && !eq.recuperado && eq.semanas != null ? '<div class="small muted">Punto de equilibrio: faltan ' + eq.semanas + ' semana' + (eq.semanas === 1 ? '' : 's') + '</div>' : '') +
    (diasEnTaller(r.c) ? '<div class="small muted">' + diasEnTaller(r.c) + ' días parado en taller</div>' : '') +
    '</div>';
  }).join('');
  return h;
}

function seccionResumenAnual() {
  if (!canVerFinanzas()) return '';
  const anio = today().getFullYear();
  const rows = [resumenAnual(anio), resumenAnual(anio - 1)].filter(r => r.cobrado || r.cobradoUSD || r.gastos);
  if (!rows.length) return '';
  return '<h2>Resumen anual</h2>' + rows.map(r => '<div class="card"><div class="row between"><b>' + r.year + '</b><b style="color:' + (r.neta >= 0 ? 'var(--ok)' : 'var(--bad)') + '">' + money(r.neta) + '</b></div>' +
    '<div class="row between small muted" style="margin-top:4px"><span>Cobrado ' + money(r.cobrado) + '</span><span>Gastos ' + money(r.gastos) + '</span></div>' +
    (r.cobradoUSD ? '<div class="small muted" style="margin-top:2px">Cobrado de financiados: ' + moneyUSD(r.cobradoUSD) + '</div>' : '') + '</div>').join('');
}

function seccionTablaComparativaChoferes() {
  const rows = comparativaChoferes();
  if (!rows.length) return '';
  const orden = ui.ordenCompChoferes;
  rows.sort((a, b) => orden === 'pagado' ? b.totalPagado - a.totalPagado : orden === 'deuda' ? b.deuda - a.deuda : orden === 'puntualidad' ? (b.score == null ? -1 : b.score) - (a.score == null ? -1 : a.score) : b.antiguedadDias - a.antiguedadDias);
  return '<h2>Comparativa de choferes</h2>' +
  '<label class="f" style="margin-bottom:10px"><span>Ordenar por</span><select onchange="ui.ordenCompChoferes=this.value;render()">' +
  '<option value="antiguedad"' + (orden === 'antiguedad' ? ' selected' : '') + '>Antigüedad (mayor primero)</option>' +
  '<option value="pagado"' + (orden === 'pagado' ? ' selected' : '') + '>Total pagado (mayor primero)</option>' +
  '<option value="deuda"' + (orden === 'deuda' ? ' selected' : '') + '>Deuda (mayor primero)</option>' +
  '<option value="puntualidad"' + (orden === 'puntualidad' ? ' selected' : '') + '>Puntualidad (mejor primero)</option></select></label>' +
  rows.map(x => '<div class="card"><div class="row between"><b>' + esc(x.nombre) + '</b>' + (x.deuda > 0 ? '<span class="badge b-bad">Debe ' + (x.monedaDeuda === 'USD' ? moneyUSD(x.deuda) : money(x.deuda)) + '</span>' : '<span class="badge b-ok">Al día</span>') + '</div>' +
  '<div class="row between small muted" style="margin-top:4px"><span>' + Math.round(x.antiguedadDias / 30) + ' meses</span><span>' + money(x.totalPagado) + ' pagado</span><span>' + (x.score != null ? x.score + '% puntual' : 'sin datos') + '</span></div></div>').join('');
}

function seccionTablaComparativaAutos() {
  if (!canVerFinanzas()) return '';
  const rows = comparativaAutos();
  if (!rows.length) return '';
  const orden = ui.ordenCompAutos;
  rows.sort((a, b) => orden === 'km' ? b.km - a.km : orden === 'taller' ? b.diasTaller - a.diasTaller : b.neta - a.neta);
  return '<h2>Comparativa de autos</h2>' +
  '<label class="f" style="margin-bottom:10px"><span>Ordenar por</span><select onchange="ui.ordenCompAutos=this.value;render()">' +
  '<option value="neta"' + (orden === 'neta' ? ' selected' : '') + '>Rentabilidad (mayor primero)</option>' +
  '<option value="km"' + (orden === 'km' ? ' selected' : '') + '>Kilometraje (mayor primero)</option>' +
  '<option value="taller"' + (orden === 'taller' ? ' selected' : '') + '>Días en taller (mayor primero)</option></select></label>' +
  rows.map(x => '<div class="card"><div class="row between"><b>' + plate(x.c.patente) + '</b><b style="color:' + (x.neta >= 0 ? 'var(--ok)' : 'var(--bad)') + '">' + money(x.neta) + '</b></div>' +
  '<div class="row between small muted" style="margin-top:4px"><span>' + x.km.toLocaleString('es-AR') + ' km</span><span>' + x.diasTaller + ' días en taller</span></div></div>').join('');
}

function seccionComparativaChoferes() {
  const rows = S.drivers.filter(d => !d.inactivo && !d.prospecto).map(d => ({ d, total: driverTotalPagado(d.id) })).filter(x => x.total > 0).sort((a, b) => b.total - a.total).slice(0, 10);
  if (!rows.length) return '';
  return '<h2>Choferes por total pagado</h2>' + rows.map((x, i) => '<div class="card row between"><span>' + (i + 1) + '. ' + esc(x.d.nombre) + '</span><b>' + money(x.total) + '</b></div>').join('');
}

function seccionGastosPorCategoria() {
  if (!canVerFinanzas()) return '';
  const cat = gastosPorCategoria();
  const rows = GASTO_CATS.map(x => ({ l: x[1], total: cat[x[0]] || 0 })).filter(x => x.total > 0).sort((a, b) => b.total - a.total);
  if (!rows.length) return '';
  const max = Math.max(...rows.map(x => x.total));
  return '<h2>Gastos por categoría</h2>' + rows.map(x => '<div class="card"><div class="row between small" style="margin-bottom:4px"><span>' + esc(x.l) + '</span><b>' + money(x.total) + '</b></div>' +
  '<div style="background:var(--soft);border-radius:6px;height:8px;overflow:hidden"><div style="width:' + Math.round(x.total / max * 100) + '%;height:100%;background:var(--info)"></div></div></div>').join('');
}

function seccionProspectosPorCanal() {
  const P = S.drivers.filter(d => d.prospecto);
  if (!P.length) return '';
  const rows = CANALES_PROSPECTO.map(x => ({ l: x[1], n: P.filter(d => d.canalOrigen === x[0]).length })).filter(x => x.n);
  const sinDato = P.filter(d => !d.canalOrigen).length;
  if (!rows.length && !sinDato) return '';
  return '<h2>Prospectos por canal de origen</h2>' + rows.map(x => '<div class="card row between"><span>' + esc(x.l) + '</span><b>' + x.n + '</b></div>').join('') +
  (sinDato ? '<div class="card row between small muted"><span>Sin especificar</span><b>' + sinDato + '</b></div>' : '');
}

function seccionMantenimiento() {
  const rows = activeCars().map(c => ({ c, total: gastoMantenimientoAuto(c) })).filter(x => x.total > 0).sort((a, b) => b.total - a.total);
  if (!rows.length) return '';
  return '<h2>Gasto de mantenimiento por auto</h2>' + rows.map(x => '<div class="card row between"><span>' + plate(x.c.patente) + '</span><b>' + money(x.total) + '</b></div>').join('');
}

function seccionSiniestros() {
  const rows = activeCars().map(c => ({ c, S: siniestrosDeAuto(c) })).filter(x => x.S.length)
    .map(x => ({ c: x.c, cantidad: x.S.length, total: x.S.reduce((a, s) => a + (+s.costoTaller || 0), 0), abiertos: x.S.filter(s => s.estado !== 'cerrado').length }))
    .sort((a, b) => b.total - a.total);
  if (!rows.length) return '';
  return '<h2>Siniestros por auto</h2>' + rows.map(x => '<div class="card row between"><span>' + plate(x.c.patente) + ' <span class="small muted">(' + x.cantidad + (x.cantidad === 1 ? ' siniestro' : ' siniestros') + (x.abiertos ? ' · ' + x.abiertos + ' abierto' + (x.abiertos === 1 ? '' : 's') : '') + ')</span></span><b>' + money(x.total) + '</b></div>').join('');
}

function seccionMultasChoferes() {
  const rows = rankingMultasChoferes().slice(0, 10);
  if (!rows.length) return '';
  return '<h2>Choferes por multas</h2>' + rows.map(x => '<div class="card row between"><span>' + esc(x.nombre || 'Chofer eliminado') + ' <span class="small muted">(' + x.cantidad + (x.cantidad === 1 ? ' multa' : ' multas') + ')</span></span><b>' + money(x.total) + '</b></div>').join('');
}

function seccionSiniestrosChoferes() {
  const rows = rankingSiniestrosChoferes().slice(0, 10);
  if (!rows.length) return '';
  return '<h2>Choferes por siniestros</h2>' + rows.map(x => '<div class="card row between"><span>' + esc(x.nombre || 'Chofer eliminado') + '</span><b>' + x.cantidad + (x.cantidad === 1 ? ' siniestro' : ' siniestros') + '</b></div>').join('');
}

function seccionRankingMensual() {
  const rows = rankingMensualChoferes();
  if (!rows.length) return '';
  return '<h2>Mejores choferes del mes</h2>' + rows.map((x, i) => '<div class="card row between"><span>' + (i + 1) + '. ' + esc(x.nombre) + '</span><b>' + x.score + '% puntual</b></div>').join('');
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
  let total = 0, totalUSD = 0;
  activeCars().filter(c => isContract(c) && c.choferId).forEach(c => {
    const i = calc(c);
    let sem = semanasVentana;
    if (c.tipo === 'financiado' && c.cuotas) sem = Math.min(semanasVentana, Math.max(0, (+c.cuotas) - i.weeks));
    if (c.tipo === 'financiado') totalUSD += sem * (+c.monto || 0);
    else total += sem * (+c.monto || 0);
  });
  return { total, totalUSD };
}
function seccionProyeccion() {
  const p = proyeccionIngresos(13);
  return '<h2>Proyección próximos 3 meses</h2><div class="card"><div class="small muted" style="margin-bottom:4px">Según los contratos activos y las cuotas que les quedan.</div><b style="font-size:20px">' + money(p.total) + '</b>' +
  (p.totalUSD ? '<div class="small muted" style="margin-top:4px">+ ' + moneyUSD(p.totalUSD) + ' de financiados</div>' : '') + '</div>';
}

function seccionAlertasTendencia() {
  const A = alertasTendencia();
  if (!A.length) return '';
  return '<h2>Alertas de tendencia</h2>' + A.map(a => '<div class="card row between"><span>' + esc(a.t) + '</span>' + badge(a.cls, a.cls === 'bad' ? '▲' : '▼') + '</div>').join('');
}
function seccionComparacionAnual() {
  if (!canVerFinanzas()) return '';
  const anio = today().getFullYear();
  const act = resumenAnual(anio), ant = resumenAnual(anio - 1);
  if (!act.cobrado && !ant.cobrado) return '';
  const delta = ant.neta !== 0 ? Math.round((act.neta - ant.neta) / Math.abs(ant.neta) * 100) : (act.neta > 0 ? 100 : 0);
  const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '—';
  const color = delta > 0 ? 'var(--ok)' : delta < 0 ? 'var(--bad)' : 'var(--muted)';
  return '<h2>Este año vs. el anterior</h2><div class="card row between">' +
    '<div><div class="small muted">' + (anio - 1) + '</div><b>' + money(ant.neta) + '</b></div>' +
    '<div style="color:' + color + ';font-weight:700;text-align:center">' + arrow + ' ' + Math.abs(delta) + '%</div>' +
    '<div style="text-align:right"><div class="small muted">' + anio + '</div><b>' + money(act.neta) + '</b></div></div>';
}
function seccionProyeccionRentabilidad() {
  if (!canVerFinanzas()) return '';
  const p = proyeccionRentabilidadTendencia();
  if (!p.promedioMensual) return '';
  return '<h2>Proyección de rentabilidad según tendencia</h2><div class="card"><div class="small muted" style="margin-bottom:4px">Según el promedio neto (cobrado − gastos) de los últimos 3 meses.</div>' +
  '<div class="row between"><span class="muted">A 6 meses</span><b style="color:' + (p.proyeccion6 >= 0 ? 'var(--ok)' : 'var(--bad)') + '">' + money(p.proyeccion6) + '</b></div>' +
  '<div class="row between"><span class="muted">A 12 meses</span><b style="color:' + (p.proyeccion12 >= 0 ? 'var(--ok)' : 'var(--bad)') + '">' + money(p.proyeccion12) + '</b></div></div>';
}
function seccionRoiAutos() {
  if (!canVerFinanzas()) return '';
  const rows = rankingRoiAutos();
  if (!rows.length) return '';
  return '<h2>Autos por retorno de inversión</h2>' + rows.map(x => '<div class="card row between"><span>' + plate(x.c.patente) + '</span><b style="color:' + (x.roi >= 0 ? 'var(--ok)' : 'var(--bad)') + '">' + x.roi + '%</b></div>').join('');
}
function seccionPerdidaGanancia() {
  if (!canVerFinanzas()) return '';
  const p = porcentajePerdidaGanancia();
  if (!p) return '';
  return '<h2>Flota en ganancia vs. pérdida</h2><div class="card"><div class="row between"><span class="muted">Generando ganancia</span><b style="color:var(--ok)">' + p.ganancia + ' de ' + p.total + ' (' + p.pctGanancia + '%)</b></div>' +
  (p.perdida ? '<div class="row between"><span class="muted">Generando pérdida</span><b style="color:var(--bad)">' + p.perdida + ' de ' + p.total + '</b></div>' : '') + '</div>';
}
function seccionSaludChoferes() {
  const rows = saludChoferes().filter(x => x.deuda > 0 || x.multas || x.siniestros || x.score != null);
  if (!rows.length) return '';
  return '<h2>Salud de choferes</h2>' + rows.map(x => '<div class="card"><div class="row between"><b>' + esc(x.nombre) + '</b>' + (x.deuda > 0 ? badge('bad', 'Debe ' + money(x.deuda)) : badge('ok', 'Al día')) + '</div>' +
  '<div class="row between small muted" style="margin-top:4px"><span>' + (x.score != null ? x.score + '% puntual' : 'sin datos') + '</span><span>' + x.multas + (x.multas === 1 ? ' multa' : ' multas') + '</span><span>' + x.siniestros + (x.siniestros === 1 ? ' siniestro' : ' siniestros') + '</span></div></div>').join('');
}

export function viewReportes() {
  if (!S.cars.length) return '<h1>Reportes</h1><p class="sub">Rentabilidad, comparativas y proyecciones</p><div class="card empty">Cargá autos y cobros para ver reportes acá.</div>';
  let h = '<h1>Reportes</h1><p class="sub">Rentabilidad, comparativas y proyecciones</p>';
  if (canVerFinanzas()) h += '<div class="row" style="margin-bottom:14px"><button class="btn sec grow" onclick="descargarReporteEjecutivo()">Descargar reporte ejecutivo (PDF)</button></div>';
  h += seccionAlertasTendencia();
  h += seccionComparacionMensual();
  h += seccionGrafico();
  h += seccionProyeccion();
  h += seccionProyeccionRentabilidad();
  h += seccionRentabilidad();
  h += seccionPerdidaGanancia();
  h += seccionRoiAutos();
  h += seccionTablaComparativaAutos();
  h += seccionResumenAnual();
  h += seccionComparacionAnual();
  h += seccionSaludChoferes();
  h += seccionComparativaChoferes();
  h += seccionTablaComparativaChoferes();
  h += seccionGastosPorCategoria();
  h += seccionMantenimiento();
  h += seccionSiniestros();
  h += seccionMultasChoferes();
  h += seccionSiniestrosChoferes();
  h += seccionRankingMensual();
  h += seccionProspectosPorCanal();
  return h;
}
