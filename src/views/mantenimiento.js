import { S, ui } from '../state.js';
import { esc, money, fdate, today, iso } from '../utils.js';
import { carById, activeCars, garantiasPorVencer, rankingTalleresMantenimiento, rankingItemsMantenimiento, proporcionMantenimiento, gastoMantenimientoDelMes, badge, textoRestante, agendaMantenimiento, autosConGastoExcesivo } from '../calc.js';
import { render } from '../nav.js';

export function mantenimientosFiltrados() {
  const q = (ui.qMant || '').trim().toLowerCase();
  let L = S.mantenimientos.slice();
  if (q) L = L.filter(m => { const c = carById(m.carId); return [(c && c.patente) || '', m.label, m.item, m.notas].join(' ').toLowerCase().includes(q); });
  if (ui.mantAuto) L = L.filter(m => m.carId === ui.mantAuto);
  if (ui.mantProveedor) L = L.filter(m => m.proveedorId === ui.mantProveedor);
  if (ui.mantItem) L = L.filter(m => m.item === ui.mantItem);
  if (ui.mantTipo) L = L.filter(m => (m.tipo || 'preventivo') === ui.mantTipo);
  if (ui.mantDesde) L = L.filter(m => m.fecha >= ui.mantDesde);
  if (ui.mantHasta) L = L.filter(m => m.fecha <= ui.mantHasta);
  L.sort((a, b) => ui.mantOrden === 'monto' ? (+b.costo || 0) - (+a.costo || 0) : b.fecha.localeCompare(a.fecha));
  return L;
}

export function mantAtajoFecha(rango) {
  const t = today();
  let desde = null;
  if (rango === 'mes') desde = new Date(t.getFullYear(), t.getMonth(), 1);
  else if (rango === 'trimestre') desde = new Date(t.getFullYear(), t.getMonth() - 2, 1);
  else if (rango === 'anio') desde = new Date(t.getFullYear(), 0, 1);
  ui.mantDesde = desde ? iso(desde) : '';
  ui.mantHasta = '';
  render();
}

function seccionResumen(L) {
  const total = L.reduce((a, m) => a + (+m.costo || 0), 0);
  const nAutos = activeCars().length || 1;
  return '<div class="grid" style="margin-bottom:14px">' +
    '<div class="kpi"><div class="n">' + money(total) + '</div><div class="l">Gastado en el período</div></div>' +
    '<div class="kpi"><div class="n">' + L.length + '</div><div class="l">Mantenimientos</div></div>' +
    '<div class="kpi"><div class="n">' + money(Math.round(total / nAutos)) + '</div><div class="l">Promedio por auto</div></div>' +
  '</div>';
}

function seccionAgendaSemana() {
  const rows = agendaMantenimiento();
  if (!rows.length) return '';
  const vencidos = rows.filter(x => x.e.cls === 'bad');
  const proximos = rows.filter(x => x.e.cls === 'warn');
  const fila = x => '<div class="card row tap" onclick="mantenimientoForm(\'' + x.c.id + '\',null,\'' + esc(x.p.item) + '\')"><div class="grow"><div>' + esc(x.c.patente) + ' <span class="small muted">' + esc(x.p.label || x.p.item) + '</span></div></div>' + badge(x.e.cls, textoRestante(x.e)) + '</div>';
  let h = '<h2>Agenda de mantenimiento</h2><div class="small muted" style="margin-bottom:8px">Todo lo vencido o por vencer pronto en toda la flota, para coordinar con los talleres de una vez.</div>';
  if (vencidos.length) h += '<div class="sec-t">Vencido</div>' + vencidos.map(fila).join('');
  if (proximos.length) h += '<div class="sec-t">Por vencer pronto</div>' + proximos.map(fila).join('');
  return h;
}
function seccionGastoExcesivo() {
  const rows = autosConGastoExcesivo();
  if (!rows.length) return '';
  return '<h2>Posible reemplazo por gasto excesivo</h2><div class="small muted" style="margin-bottom:8px">Gastaron más del doble del promedio de la flota en mantenimiento.</div>' +
  rows.map(x => '<div class="card row tap" onclick="carForm(\'' + x.c.id + '\')"><div class="grow"><div>' + esc(x.c.patente) + '</div><div class="small muted">Promedio de la flota: ' + money(Math.round(x.promedio)) + '</div></div><b style="color:var(--bad)">' + money(x.gasto) + '</b></div>').join('');
}

function seccionGarantias() {
  const rows = garantiasPorVencer();
  if (!rows.length) return '';
  return '<h2>Garantías por vencer</h2>' + rows.map(x => '<div class="card row tap" onclick="mantenimientoForm(\'' + x.c.id + '\',\'' + x.m.id + '\')"><div class="grow"><div>' + esc(x.c.patente) + ' <span class="small muted">' + esc(x.m.label || x.m.item) + '</span></div></div>' + badge(x.cls, textoRestante(x)) + '</div>').join('');
}

function seccionGrafico() {
  const meses = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today().getFullYear(), today().getMonth() - i, 1);
    meses.push({ label: d.toLocaleDateString('es-AR', { month: 'short' }), total: gastoMantenimientoDelMes(i) });
  }
  const max = Math.max(1, ...meses.map(m => m.total));
  const w = 300, bw = w / meses.length;
  const bars = meses.map((m, i) => {
    const bh = Math.round((m.total / max) * 85);
    const x = i * bw + bw * 0.15, y = 95 - bh, bw2 = bw * 0.7;
    return '<rect x="' + x + '" y="' + y + '" width="' + bw2 + '" height="' + bh + '" rx="3" fill="var(--info)"/>' +
      '<text x="' + (x + bw2 / 2) + '" y="108" font-size="9" text-anchor="middle" fill="var(--muted)">' + esc(m.label) + '</text>';
  }).join('');
  return '<h2>Gasto mensual</h2><div class="card"><svg viewBox="0 0 ' + w + ' 116" style="width:100%;height:auto" role="img" aria-label="Gasto de mantenimiento por mes">' + bars + '</svg></div>';
}

function seccionRankingTalleres() {
  const rows = rankingTalleresMantenimiento().slice(0, 10);
  if (!rows.length) return '';
  return '<h2>Talleres</h2>' + rows.map(x => '<div class="card row between"><span>' + esc(x.nombre) + ' <span class="small muted">(' + x.cantidad + (x.cantidad === 1 ? ' trabajo' : ' trabajos') + ')</span></span><b>' + money(x.total) + '</b></div>').join('');
}

function seccionRankingItems() {
  const rows = rankingItemsMantenimiento().slice(0, 10);
  if (!rows.length) return '';
  return '<h2>En qué se va la plata</h2>' + rows.map(x => '<div class="card row between"><span>' + esc(x.label) + ' <span class="small muted">(' + x.cantidad + ')</span></span><b>' + money(x.total) + '</b></div>').join('');
}

function seccionProporcion() {
  const p = proporcionMantenimiento();
  if (!p.total) return '';
  const pctCorrectivo = Math.round((p.correctivo / p.total) * 100);
  return '<h2>Preventivo vs. correctivo</h2><div class="card">' +
    '<div class="row between small muted"><span>Preventivo</span><span>Correctivo</span></div>' +
    '<div style="display:flex;height:10px;border-radius:5px;overflow:hidden;margin:6px 0"><div style="width:' + (100 - pctCorrectivo) + '%;background:var(--ok)"></div><div style="width:' + pctCorrectivo + '%;background:var(--bad)"></div></div>' +
    '<div class="row between small muted"><span>' + p.preventivo + '</span><span>' + p.correctivo + '</span></div></div>';
}

export function viewMantenimiento() {
  if (!S.cars.length) return '<h1>Mantenimiento</h1><p class="sub">Bitácora de todos los mantenimientos de la flota</p><div class="card empty">Cargá autos para empezar a registrar mantenimientos.</div>';
  const L = mantenimientosFiltrados();
  const cars = activeCars().slice().sort((a, b) => String(a.patente).localeCompare(String(b.patente)));
  const proveedores = S.proveedores.slice().sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
  const items = {};
  S.cars.forEach(c => (c.mantenimientoPlan || []).forEach(p => { items[p.item] = p.label || p.item; }));
  let h = '<h1>Mantenimiento</h1><p class="sub">Bitácora de todos los mantenimientos de la flota</p>' +
  '<div class="row" style="margin-bottom:14px"><button class="btn grow" onclick="mantenimientoForm()">+ Registrar mantenimiento</button>' +
  '<button class="btn sec" onclick="syncMantenimientoSheetsUI()">Exportar</button></div>';
  h += seccionResumen(L);
  h += seccionAgendaSemana();
  h += seccionGastoExcesivo();
  h += seccionGarantias();
  h += seccionGrafico();
  h += seccionRankingTalleres();
  h += seccionRankingItems();
  h += seccionProporcion();
  h += '<h2>Filtrar bitácora</h2>';
  h += '<div class="bar"><input type="search" placeholder="Buscar patente, ítem o notas" value="' + esc(ui.qMant) + '" oninput="ui.qMant=this.value;renderList()"></div>';
  h += '<div class="row" style="margin:8px 0;flex-wrap:wrap;gap:6px">' +
    '<button class="btn sec sm" onclick="mantAtajoFecha(\'mes\')">Este mes</button>' +
    '<button class="btn sec sm" onclick="mantAtajoFecha(\'trimestre\')">Últimos 3 meses</button>' +
    '<button class="btn sec sm" onclick="mantAtajoFecha(\'anio\')">Este año</button></div>';
  h += '<div class="two" style="margin:10px 0"><label class="f"><span>Desde</span><input type="date" value="' + esc(ui.mantDesde) + '" oninput="ui.mantDesde=this.value;renderList()"></label>' +
  '<label class="f"><span>Hasta</span><input type="date" value="' + esc(ui.mantHasta) + '" oninput="ui.mantHasta=this.value;renderList()"></label></div>';
  h += '<div class="two"><label class="f"><span>Auto</span><select onchange="ui.mantAuto=this.value;render()"><option value="">Todos los autos</option>' + cars.map(c => '<option value="' + c.id + '"' + (ui.mantAuto === c.id ? ' selected' : '') + '>' + esc(c.patente) + '</option>').join('') + '</select></label>' +
  '<label class="f"><span>Ítem</span><select onchange="ui.mantItem=this.value;render()"><option value="">Todos los ítems</option>' + Object.keys(items).sort((a, b) => items[a].localeCompare(items[b])).map(k => '<option value="' + esc(k) + '"' + (ui.mantItem === k ? ' selected' : '') + '>' + esc(items[k]) + '</option>').join('') + '</select></label></div>';
  h += '<div class="two">' +
  (proveedores.length ? '<label class="f"><span>Taller</span><select onchange="ui.mantProveedor=this.value;render()"><option value="">Todos los talleres</option>' + proveedores.map(p => '<option value="' + p.id + '"' + (ui.mantProveedor === p.id ? ' selected' : '') + '>' + esc(p.nombre) + '</option>').join('') + '</select></label>' : '<span></span>') +
  '<label class="f"><span>Tipo</span><select onchange="ui.mantTipo=this.value;render()"><option value="">Todos</option><option value="preventivo"' + (ui.mantTipo === 'preventivo' ? ' selected' : '') + '>Preventivo</option><option value="correctivo"' + (ui.mantTipo === 'correctivo' ? ' selected' : '') + '>Correctivo</option></select></label></div>';
  h += '<label class="f" style="margin-bottom:10px"><span>Ordenar por</span><select onchange="ui.mantOrden=this.value;render()"><option value="fecha"' + (ui.mantOrden === 'fecha' ? ' selected' : '') + '>Fecha (más reciente primero)</option><option value="monto"' + (ui.mantOrden === 'monto' ? ' selected' : '') + '>Monto (mayor primero)</option></select></label>';
  h += '<div id="list"></div>';
  return h;
}
export function listMantenimiento() {
  const L = mantenimientosFiltrados();
  if (!L.length) return '<div class="card empty">' + (S.mantenimientos.length ? 'Ningún mantenimiento coincide con el filtro.' : 'Todavía no hay mantenimientos registrados.') + '</div>';
  const provName = id => { const p = S.proveedores.find(x => x.id === id); return p ? p.nombre : ''; };
  return L.map(m => {
    const c = carById(m.carId);
    return '<div class="card tap" onclick="mantenimientoForm(\'' + m.carId + '\',\'' + m.id + '\')"><div class="row between"><div>' + money(m.costo) + ' <span class="small muted">' + esc(m.label || m.item) + (m.tipo === 'correctivo' ? ' · correctivo' : '') + '</span></div><div class="small muted">' + fdate(m.fecha) + '</div></div>' +
    '<div class="small muted" style="margin-top:4px">' + esc(c ? c.patente : 'Auto eliminado') + (m.proveedorId ? ' · ' + esc(provName(m.proveedorId)) : '') + (m.km ? ' · ' + (+m.km).toLocaleString('es-AR') + ' km' : '') + '</div></div>';
  }).join('');
}
