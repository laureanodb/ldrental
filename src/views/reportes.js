import { S, ui } from '../state.js';
import { esc, money, moneyUSD, today, fdate, iso } from '../utils.js';
import { plate, rentabilidadAuto, driverTotalPagado, driverName, activeCars, isContract, calc, cobradoDelMes, cobradoDelMesUSD, diasEnTaller, gastoMantenimientoAuto, costoTotalAuto, gastosPorCategoria, rankingMultasChoferes, resumenAnual, siniestrosDeAuto, rankingSiniestrosChoferes, comparativaChoferes, comparativaAutos, puntoEquilibrio, rankingMensualChoferes, rankingRoiAutos, porcentajePerdidaGanancia, saludChoferes, alertasTendencia, proyeccionRentabilidadTendencia, rentabilidadPorChofer, mapaCalorGastos, planRenovacionFlota, badge, tendenciaNps, flujoCajaSemanal, flujoCajaSemanalUSD, utilizacionFlota, mejorPeorMesAuto, indiceSaludFlota, segmentoMasRentable, gastosFijosMensuales, gastosFijosFlotaMensual, totalDepositosFlota, totalSemanaAdelantadaFlota, flujoCajaReal } from '../calc.js';
import { canVerFinanzas } from '../roles.js';
import { GASTO_CATS, CANALES_PROSPECTO, MOTIVOS_REEMPLAZO } from '../constants.js';
import { saldoAutoseguro } from '../autoseguro.js';
import { settings, saveSettings } from '../settings.js';
import { modoConsultaActivo } from '../consulta.js';

function cobrosPorMes(n) {
  const t = today();
  const meses = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(t.getFullYear(), t.getMonth() - i, 1);
    meses.push({ label: d.toLocaleDateString('es-AR', { month: 'short' }), total: cobradoDelMes(i) });
  }
  return meses;
}

function flotaActivaPorMes(n) {
  const t = today();
  const meses = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(t.getFullYear(), t.getMonth() - i, 1);
    const finMesIso = iso(new Date(t.getFullYear(), t.getMonth() - i + 1, 0));
    const n2 = S.cars.filter(c => {
      if (c.fechaCompra && c.fechaCompra > finMesIso) return false;
      if (c.vendido && c.fechaVenta && c.fechaVenta <= finMesIso) return false;
      return true;
    }).length;
    meses.push({ label: d.toLocaleDateString('es-AR', { month: 'short' }), n: n2 });
  }
  return meses;
}
function seccionFlotaHistorica() {
  const meses = flotaActivaPorMes(6);
  if (!meses.some(m => m.n)) return '';
  const max = Math.max(1, ...meses.map(m => m.n));
  const w = 300, bw = w / meses.length;
  const bars = meses.map((m, i) => {
    const bh = Math.round((m.n / max) * 85);
    const x = i * bw + bw * 0.15, y = 95 - bh, bw2 = bw * 0.7;
    return '<rect x="' + x + '" y="' + y + '" width="' + bw2 + '" height="' + bh + '" rx="3" fill="var(--ok)"/>' +
      '<text x="' + (x + bw2 / 2) + '" y="' + (y - 3) + '" font-size="9" text-anchor="middle" fill="var(--muted)">' + m.n + '</text>' +
      '<text x="' + (x + bw2 / 2) + '" y="108" font-size="9" text-anchor="middle" fill="var(--muted)">' + esc(m.label) + '</text>';
  }).join('');
  return '<h2>Flota activa histórica</h2><div class="card"><svg viewBox="0 0 ' + w + ' 116" style="width:100%;height:auto" role="img" aria-label="Autos activos por mes">' + bars + '</svg></div>';
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
    (r.gastosFijos ? '<div class="row between small muted"><span>Sin gastos fijos (seguro/patente)</span><span>' + money(r.netaSinFijos) + '</span></div>' : '') +
    (r.costoCompra ? '<div class="small muted" style="margin-top:2px">Costo de compra: ' + money(r.costoCompra) + (r.cobrado >= r.costoCompra ? ' · ya recuperado' : ' · recuperado ' + Math.round(r.cobrado / r.costoCompra * 100) + '%') + '</div>' : '') +
    (eq && !eq.recuperado && eq.semanas != null ? '<div class="small muted">Punto de equilibrio: faltan ' + eq.semanas + ' semana' + (eq.semanas === 1 ? '' : 's') + '</div>' : '') +
    (diasEnTaller(r.c) ? '<div class="small muted">' + diasEnTaller(r.c) + ' días parado en taller</div>' : '') +
    '</div>';
  }).join('');
  return h;
}

function seccionGastosFijos() {
  if (!canVerFinanzas()) return '';
  const rows = activeCars().map(c => Object.assign({ c }, gastosFijosMensuales(c))).filter(x => x.total > 0).sort((a, b) => b.total - a.total);
  if (!rows.length) return '';
  const totalFlota = gastosFijosFlotaMensual();
  return '<h2>Gastos fijos mensuales (seguro y patente)</h2>' +
  '<div class="card row between" style="margin-bottom:10px"><span class="muted">Total de la flota</span><b>' + money(totalFlota) + '/mes</b></div>' +
  rows.map(r => '<div class="card row between small"><span>' + plate(r.c.patente) + '</span><span>' + money(r.total) + '/mes</span></div>').join('');
}
function seccionPasivosChofer() {
  if (!canVerFinanzas()) return '';
  const deposito = totalDepositosFlota();
  const adelanto = totalSemanaAdelantadaFlota();
  if (!deposito && !adelanto) return '';
  const max = Math.max(deposito, adelanto, 1);
  return '<h2>Depósitos y semana adelantada</h2><div class="small muted" style="margin:0 2px 8px">Plata que la empresa tiene en su poder o ya cobró por adelantado.</div>' +
  '<div class="card">' +
  '<div class="row between small"><span class="muted">Depósitos de garantía (pasivo)</span><b>' + money(deposito) + '</b></div>' +
  '<div style="height:8px;background:var(--track,#e6e1d6);border-radius:99px;overflow:hidden;margin:4px 0 10px"><div style="height:100%;width:' + Math.round(deposito / max * 100) + '%;background:var(--teal)"></div></div>' +
  '<div class="row between small"><span class="muted">Semana adelantada disponible</span><b>' + money(adelanto) + '</b></div>' +
  '<div style="height:8px;background:var(--track,#e6e1d6);border-radius:99px;overflow:hidden;margin:4px 0 0"><div style="height:100%;width:' + Math.round(adelanto / max * 100) + '%;background:var(--ok)"></div></div>' +
  '</div>';
}
function seccionComparacionTipos() {
  if (!canVerFinanzas()) return '';
  const alquiler = activeCars().filter(c => c.tipo === 'alquiler').map(c => rentabilidadAuto(c));
  const financiado = activeCars().filter(c => c.tipo === 'financiado').map(c => rentabilidadAuto(c));
  if (!alquiler.length && !financiado.length) return '';
  const promAlquiler = alquiler.length ? alquiler.reduce((a, r) => a + r.neta, 0) / alquiler.length : null;
  const promFinanciadoUSD = financiado.length ? financiado.reduce((a, r) => a + r.cobrado, 0) / financiado.length : null;
  return '<h2>Alquiler vs. financiado</h2><div class="card">' +
  (promAlquiler != null ? '<div class="row between"><span class="muted">Alquiler · rentabilidad neta promedio (' + alquiler.length + ' auto' + (alquiler.length === 1 ? '' : 's') + ')</span><b style="color:' + (promAlquiler >= 0 ? 'var(--ok)' : 'var(--bad)') + '">' + money(promAlquiler) + '</b></div>' : '') +
  (promFinanciadoUSD != null ? '<div class="row between" style="margin-top:4px"><span class="muted">Financiado · cobrado promedio (' + financiado.length + ' auto' + (financiado.length === 1 ? '' : 's') + ')</span><b>' + moneyUSD(promFinanciadoUSD) + '</b></div>' : '') +
  '<div class="small muted" style="margin-top:8px">No son directamente comparables (distinta moneda y estructura), pero sirve para ver el peso de cada segmento en la flota.</div></div>';
}
function seccionRentabilidadChofer() {
  if (!canVerFinanzas()) return '';
  const rows = rentabilidadPorChofer();
  if (rows.length < 2) return '';
  return '<h2>Rentabilidad por chofer</h2>' + rows.map(r => '<div class="card row between"><div><div>' + esc(driverName(r.driverId)) + '</div><div class="small muted">' + plate(r.c.patente) + '</div></div><b style="color:' + (r.neta >= 0 ? 'var(--ok)' : 'var(--bad)') + '">' + money(r.neta) + '</b></div>').join('');
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

function seccionGastosPorCategoriaReciente() {
  if (!canVerFinanzas()) return '';
  const cat = gastosPorCategoria(3);
  const rows = GASTO_CATS.map(x => ({ l: x[1], total: cat[x[0]] || 0 })).filter(x => x.total > 0).sort((a, b) => b.total - a.total);
  if (!rows.length) return '';
  const max = Math.max(...rows.map(x => x.total));
  return '<h2>Gastos por categoría (últimos 3 meses)</h2>' + rows.map(x => '<div class="card"><div class="row between small" style="margin-bottom:4px"><span>' + esc(x.l) + '</span><b>' + money(x.total) + '</b></div>' +
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

function seccionReclamosSeguro() {
  if (!canVerFinanzas()) return '';
  const G = S.gastos.filter(g => g.reclamoSeguro && g.reclamoEstado !== 'aprobado' && g.reclamoEstado !== 'rechazado');
  if (!G.length) return '';
  const cls = e => e === 'presentado' ? 'info' : 'warn';
  return '<h2>Reclamos al seguro pendientes</h2>' + G.map(g => {
    const c = S.cars.find(x => x.id === g.carId);
    return '<div class="card row tap" onclick="reclamoSeguroForm(\'' + g.id + '\')"><div class="grow"><div>' + money(g.costo) + ' <span class="small muted">' + (c ? plate(c.patente) : '') + '</span></div><div class="small muted">' + fdate(g.fecha) + (g.descripcion ? ' · ' + esc(g.descripcion) : '') + '</div></div>' + badge(cls(g.reclamoEstado), g.reclamoEstado === 'presentado' ? 'Presentado' : 'Pendiente') + '</div>';
  }).join('');
}
function seccionMapaCalorGastos() {
  if (!canVerFinanzas()) return '';
  const { meses, filas, max } = mapaCalorGastos(6);
  if (!filas.length) return '';
  const gridRows = filas.slice(0, 15).map(f => {
    const celdas = f.valores.map(v => {
      const op = v > 0 ? Math.max(0.12, Math.min(1, v / max)) : 0;
      return '<div style="flex:1;aspect-ratio:1;border-radius:4px;background:rgba(200,60,50,' + op + ')" title="' + money(v) + '"></div>';
    }).join('');
    return '<div class="row" style="align-items:center;gap:4px;margin-bottom:4px"><div class="small" style="width:70px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + plate(f.c.patente) + '</div><div style="display:flex;gap:4px;flex:1">' + celdas + '</div></div>';
  }).join('');
  const meselabels = '<div class="row" style="gap:4px;margin-left:74px;margin-bottom:4px">' + meses.map(m => '<div class="small muted" style="flex:1;text-align:center">' + esc(m.label) + '</div>').join('') + '</div>';
  return '<h2>Mapa de calor de gastos por auto</h2><div class="card">' + meselabels + gridRows + '</div>';
}
function seccionPlanRenovacion() {
  const rows = planRenovacionFlota();
  if (!rows.length) return '';
  const motivoLabel = m => (MOTIVOS_REEMPLAZO.find(x => x[0] === m) || [0, 'Sin motivo'])[1];
  return '<h2>Plan de renovación de flota</h2>' + rows.map(x => '<div class="card"><div class="row between"><span>' + plate(x.c.patente) + '</span>' +
  (x.diasPlan != null ? badge(x.diasPlan < 0 ? 'bad' : x.diasPlan <= 60 ? 'warn' : 'mute', x.diasPlan < 0 ? 'Vencido hace ' + (-x.diasPlan) + ' d' : 'En ' + x.diasPlan + ' d') : badge('mute', 'Sin fecha')) + '</div>' +
  (x.motivo ? '<div class="small muted" style="margin-top:4px">' + esc(motivoLabel(x.motivo)) + '</div>' : '') + '</div>').join('');
}
function seccionCostoTotalAuto() {
  if (!canVerFinanzas()) return '';
  const rows = activeCars().map(c => Object.assign({ c }, costoTotalAuto(c))).filter(x => x.total > 0).sort((a, b) => b.total - a.total);
  if (!rows.length) return '';
  return '<h2>Costo total por auto</h2>' + rows.map(x => '<div class="card"><div class="row between"><span>' + plate(x.c.patente) + '</span><b>' + money(x.total) + '</b></div>' +
  '<div class="small muted" style="margin-top:4px">' + [x.costoCompra ? 'Compra ' + money(x.costoCompra) : '', x.gastos ? 'Gastos ' + money(x.gastos) : '', x.mant ? 'Mantenimiento ' + money(x.mant) : '', x.siniestros ? 'Siniestros ' + money(x.siniestros) : ''].filter(Boolean).join(' · ') + '</div></div>').join('');
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

function seccionUtilizacion() {
  const U = utilizacionFlota(90);
  if (!U.length) return '';
  const prom = Math.round(U.reduce((a, x) => a + x.pct, 0) / U.length);
  const peores = U.filter(x => x.pct < 80).slice(0, 5);
  return '<h2>Utilización de la flota (últimos 90 días)</h2><div class="card">' +
  '<div class="row between"><span class="muted">Promedio con chofer asignado</span><b style="color:' + (prom >= 80 ? 'var(--ok)' : prom >= 50 ? 'var(--warn)' : 'var(--bad)') + '">' + prom + '%</b></div></div>' +
  (peores.length ? '<div class="small muted" style="margin:8px 2px">Con más días libres, ordenados de peor a mejor:</div>' +
  peores.map(x => '<div class="card row between tap" onclick="carForm(\'' + x.c.id + '\')"><span>' + plate(x.c.patente) + '</span><b style="color:' + (x.pct < 50 ? 'var(--bad)' : 'var(--warn)') + '">' + x.pct + '%</b></div>').join('') : '');
}
function seccionVentaOptima() {
  if (!canVerFinanzas()) return '';
  const candidatos = activeCars().filter(c => c.tipo !== 'disponible' && !c.vendido).map(c => ({ c, mp: mejorPeorMesAuto(c) }))
    .filter(x => x.mp && x.mp.peor[1] < 0 && x.mp.mejor[1] <= x.mp.peor[1] * -0.3);
  if (!candidatos.length) return '';
  return '<h2>Candidatos a vender según tendencia</h2><div class="small muted" style="margin:0 2px 8px">Autos cuyo peor mes reciente dio pérdida y el mejor no la compensa. Vale la pena revisarlos.</div>' +
  candidatos.map(x => '<div class="card row between tap" onclick="carForm(\'' + x.c.id + '\')"><span>' + plate(x.c.patente) + '</span><span class="small" style="color:var(--bad)">peor mes: ' + money(x.mp.peor[1]) + '</span></div>').join('');
}
function barritas(rows, key, neto) {
  const max = Math.max(...rows.map(x => Math.max(x[key], 1)));
  return '<div class="row" style="align-items:flex-end;gap:6px;height:70px">' + rows.map(x => {
    const h = Math.max(4, Math.round(x[key] / max * 60));
    const color = neto ? (x.neto >= 0 ? 'var(--ok)' : 'var(--bad)') : 'var(--teal)';
    return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px"><div style="width:100%;height:' + h + 'px;background:' + color + ';border-radius:4px 4px 0 0"></div><div class="small muted">S' + x.semana + '</div></div>';
  }).join('') + '</div>';
}
function seccionFlujoCajaReal() {
  if (!canVerFinanzas()) return '';
  const F = flujoCajaReal(6);
  if (!F.some(x => x.cobrado || x.gastos)) return '';
  const max = Math.max(...F.map(x => Math.max(x.cobrado, x.gastos, 1)));
  const totalNeto = F.reduce((a, x) => a + x.neto, 0);
  return '<h2>Flujo de caja real (últimos 6 meses)</h2><div class="small muted" style="margin:0 2px 8px">Lo que efectivamente entró (cobros) y salió (gastos), mes a mes, según lo cargado en la app.</div><div class="card">' +
  '<div class="row" style="align-items:flex-end;gap:6px;height:70px">' + F.map(x => {
    const hc = Math.max(2, Math.round(x.cobrado / max * 60)), hg = Math.max(2, Math.round(x.gastos / max * 60));
    return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px"><div class="row" style="gap:2px;align-items:flex-end;height:60px"><div style="width:8px;height:' + hc + 'px;background:var(--ok);border-radius:3px 3px 0 0"></div><div style="width:8px;height:' + hg + 'px;background:var(--bad);border-radius:3px 3px 0 0"></div></div><div class="small muted">' + x.label + '</div></div>';
  }).join('') + '</div>' +
  '<div class="row between small" style="margin-top:8px"><span class="muted">Verde: cobrado · Rojo: gastos</span></div>' +
  '<div class="row between" style="margin-top:6px"><span class="muted">Neto acumulado</span><b style="color:' + (totalNeto >= 0 ? 'var(--ok)' : 'var(--bad)') + '">' + money(totalNeto) + '</b></div></div>';
}
function seccionFlujoCaja() {
  if (!canVerFinanzas()) return '';
  const carId = ui.flujoCajaAutoId || '';
  const F = flujoCajaSemanal(8, carId || undefined);
  if (!F.some(x => x.ingreso || x.egreso)) return '';
  const acumulado = F.reduce((a, x) => a + x.neto, 0);
  const puntualTotal = F.reduce((a, x) => a + (x.egresoPuntual || 0), 0);
  const autos = activeCars().filter(c => isContract(c) && c.choferId && c.tipo !== 'financiado');
  const FUSD = flujoCajaSemanalUSD(8);
  const totalUSD = FUSD.reduce((a, x) => a + x.ingreso, 0);
  return '<h2>Flujo de caja: próximas 8 semanas</h2><div class="card">' +
  '<div class="small muted" style="margin-bottom:8px">Según el alquiler semanal esperado de los contratos activos (en pesos) menos los gastos recurrentes activos y los gastos puntuales ya cargados con fecha futura' + (puntualTotal ? ' (' + money(puntualTotal) + ' en total)' : '') + '.</div>' +
  (autos.length > 1 ? '<label class="f" style="margin-bottom:8px"><span>Ver por auto <small>opcional</small></span><select onchange="ui.flujoCajaAutoId=this.value;render()"><option value="">Toda la flota</option>' + autos.map(c => '<option value="' + c.id + '"' + (carId === c.id ? ' selected' : '') + '>' + esc(c.patente) + '</option>').join('') + '</select></label>' : '') +
  barritas(F, 'ingreso', true) +
  '<div class="row between small" style="margin-top:8px"><span class="muted">Neto acumulado en 8 semanas</span><b style="color:' + (acumulado >= 0 ? 'var(--ok)' : 'var(--bad)') + '">' + money(acumulado) + '</b></div>' +
  '<div class="row between small" style="margin-top:2px"><span class="muted">Reserva disponible en el fondo de autoseguro</span><b>' + money(saldoAutoseguro()) + '</b></div></div>' +
  (totalUSD && !carId ? '<div class="card" style="margin-top:10px"><div class="small muted" style="margin-bottom:8px">Financiados, en dólares (cuotas esperadas, sin gastos)</div>' +
  barritas(FUSD, 'ingreso', false) +
  '<div class="row between small" style="margin-top:8px"><span class="muted">Total esperado en 8 semanas</span><b>' + moneyUSD(totalUSD) + '</b></div></div>' : '');
}

function seccionIndiceSalud() {
  const idx = indiceSaludFlota();
  if (!idx) return '';
  const color = idx.score >= 80 ? 'var(--ok)' : idx.score >= 55 ? 'var(--warn)' : 'var(--bad)';
  const mesActual = iso(today()).slice(0, 7);
  const hist = settings.indiceSaludHistorial || [];
  if (!modoConsultaActivo() && !hist.some(x => x.mes === mesActual)) {
    saveSettings({ indiceSaludHistorial: hist.concat([{ mes: mesActual, score: idx.score }]).slice(-12) });
  }
  const ultimos = (settings.indiceSaludHistorial || []).slice(-6);
  return '<h2>Índice de salud de la flota</h2><div class="card">' +
  '<div class="row between" style="align-items:center"><span class="muted">Puntaje del mes</span><b style="font-size:26px;color:' + color + '">' + idx.score + '</b></div>' +
  '<div class="row between small" style="margin-top:6px"><span class="muted">Choferes al día</span><span>' + idx.pctAlDia + '%</span></div>' +
  '<div class="row between small"><span class="muted">Utilización de flota (90 días)</span><span>' + idx.pctUtilizacion + '%</span></div>' +
  '<div class="row between small"><span class="muted">Vencimientos urgentes</span><span>' + idx.urg + '</span></div>' +
  (ultimos.length > 1 ? '<div class="small muted" style="margin-top:10px;margin-bottom:4px">Evolución (últimos ' + ultimos.length + ' meses)</div>' +
  '<div class="row" style="align-items:flex-end;gap:6px;height:60px">' + ultimos.map(x => {
    const h = Math.max(4, Math.round(x.score / 100 * 50));
    const c = x.score >= 80 ? 'var(--ok)' : x.score >= 55 ? 'var(--warn)' : 'var(--bad)';
    return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px"><div style="width:100%;height:' + h + 'px;background:' + c + ';border-radius:4px 4px 0 0"></div><div class="small muted">' + x.mes.slice(5) + '</div></div>';
  }).join('') + '</div>' : '') +
  '</div>';
}
function filaSegmento(s) {
  return '<div class="row between"><b>' + esc(s.key) + '</b><b style="color:' + (s.promedio >= 0 ? 'var(--ok)' : 'var(--bad)') + '">' + money(s.promedio) + '</b></div>' +
  '<div class="small muted" style="margin-top:2px;margin-bottom:8px">Promedio sobre ' + s.n + ' auto' + (s.n === 1 ? '' : 's') + ' de ese modelo.</div>';
}
function seccionSegmentoRentable() {
  if (!canVerFinanzas()) return '';
  const r = segmentoMasRentable();
  if (!r || !r.mejor || r.mejor.n < 2) return '';
  return '<h2>Tu segmento más y menos rentable</h2><div class="card">' +
  '<div class="small muted" style="margin-bottom:6px">Mejor</div>' + filaSegmento(r.mejor) +
  (r.peor && r.peor.key !== r.mejor.key ? '<div class="small muted" style="margin-bottom:6px">Peor</div>' + filaSegmento(r.peor) : '') +
  '<div class="small muted">Rentabilidad neta promedio acumulada. Si vas a comprar otro auto, mirá qué te rindió mejor y qué evitar.</div></div>';
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
  '<div class="row between"><span class="muted">A 3 meses</span><b style="color:' + (p.proyeccion3 >= 0 ? 'var(--ok)' : 'var(--bad)') + '">' + money(p.proyeccion3) + '</b></div>' +
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

function seccionNps() {
  const rows = tendenciaNps(6);
  if (!rows.length) return '';
  const max = 5;
  return '<h2>Satisfacción de choferes (encuestas del portal)</h2><div class="card">' +
  '<div class="row" style="align-items:flex-end;gap:6px;height:80px">' + rows.map(r => {
    const h = Math.max(4, Math.round(r.promedio / max * 70));
    const color = r.promedio >= 4 ? 'var(--ok)' : r.promedio >= 3 ? 'var(--warn)' : 'var(--bad)';
    return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px"><div style="width:100%;height:' + h + 'px;background:' + color + ';border-radius:4px 4px 0 0"></div><div class="small muted">' + r.mes.slice(5) + '</div></div>';
  }).join('') + '</div>' +
  '<div class="row between small" style="margin-top:8px"><span class="muted">Promedio del último mes con datos</span><b>' + rows[rows.length - 1].promedio.toFixed(1) + '/5</b></div>' +
  '<div class="small muted" style="margin-top:2px">' + rows.reduce((a, r) => a + r.n, 0) + ' respuesta' + (rows.reduce((a, r) => a + r.n, 0) === 1 ? '' : 's') + ' en total.</div></div>';
}

function seccionRangoPersonalizado() {
  if (!canVerFinanzas()) return '';
  const desde = ui.repDesde, hasta = ui.repHasta;
  let resultado = '';
  if (desde && hasta) {
    const pagos = S.payments.filter(p => p.fecha >= desde && p.fecha <= hasta);
    const cobradoARS = pagos.filter(p => p.tipo !== 'cuota').reduce((a, p) => a + (+p.monto || 0), 0);
    const cobradoUSD = pagos.filter(p => p.tipo === 'cuota').reduce((a, p) => a + (+p.monto || 0), 0);
    const gastos = S.gastos.filter(g => g.fecha >= desde && g.fecha <= hasta).reduce((a, g) => a + (+g.costo || 0), 0) +
      S.mantenimientos.filter(m => m.fecha >= desde && m.fecha <= hasta).reduce((a, m) => a + (+m.costo || 0), 0);
    resultado = '<div class="card"><div class="row between"><span class="muted">Cobrado</span><b>' + money(cobradoARS) + (cobradoUSD ? ' + ' + moneyUSD(cobradoUSD) : '') + '</b></div>' +
    '<div class="row between"><span class="muted">Gastos</span><b>' + money(gastos) + '</b></div>' +
    '<div class="row between"><span class="muted">Neto</span><b style="color:' + (cobradoARS - gastos >= 0 ? 'var(--ok)' : 'var(--bad)') + '">' + money(cobradoARS - gastos) + '</b></div></div>';
  }
  return '<h2>Rango de fechas personalizado</h2><div class="two" style="margin-bottom:10px">' +
  '<label class="f"><span>Desde</span><input type="date" value="' + esc(desde) + '" onchange="ui.repDesde=this.value;render()"></label>' +
  '<label class="f"><span>Hasta</span><input type="date" value="' + esc(hasta) + '" onchange="ui.repHasta=this.value;render()"></label></div>' +
  (resultado || '<div class="small muted">Elegí las dos fechas para ver el total cobrado y gastado en ese rango.</div>');
}

export function viewReportes() {
  if (!S.cars.length) return '<h1>Reportes</h1><p class="sub">Rentabilidad, comparativas y proyecciones</p><div class="card empty">Cargá autos y cobros para ver reportes acá.</div>';
  let h = '<h1>Reportes</h1><p class="sub">Rentabilidad, comparativas y proyecciones</p>';
  if (canVerFinanzas()) h += '<div class="row" style="margin-bottom:14px"><button class="btn sec grow" onclick="descargarReporteEjecutivo()">Descargar reporte ejecutivo (PDF)</button></div>';
  h += seccionIndiceSalud();
  h += seccionAlertasTendencia();
  h += seccionFlujoCajaReal();
  h += seccionFlujoCaja();
  h += seccionRangoPersonalizado();
  h += seccionComparacionMensual();
  h += seccionGrafico();
  h += seccionFlotaHistorica();
  h += seccionProyeccion();
  h += seccionProyeccionRentabilidad();
  h += seccionRentabilidad();
  h += seccionGastosFijos();
  h += seccionPasivosChofer();
  h += seccionComparacionTipos();
  h += seccionRentabilidadChofer();
  h += seccionPerdidaGanancia();
  h += seccionRoiAutos();
  h += seccionTablaComparativaAutos();
  h += seccionResumenAnual();
  h += seccionComparacionAnual();
  h += seccionSaludChoferes();
  h += seccionComparativaChoferes();
  h += seccionTablaComparativaChoferes();
  h += seccionGastosPorCategoria();
  h += seccionGastosPorCategoriaReciente();
  h += seccionReclamosSeguro();
  h += seccionMapaCalorGastos();
  h += seccionCostoTotalAuto();
  h += seccionPlanRenovacion();
  h += seccionMantenimiento();
  h += seccionSiniestros();
  h += seccionMultasChoferes();
  h += seccionSiniestrosChoferes();
  h += seccionRankingMensual();
  h += seccionProspectosPorCanal();
  h += seccionNps();
  h += seccionUtilizacion();
  h += seccionVentaOptima();
  h += seccionSegmentoRentable();
  return h;
}
