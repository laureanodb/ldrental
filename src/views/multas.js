import { S, ui } from '../state.js';
import { esc, money, fdate } from '../utils.js';
import { carById, driverName, estadoMultaCls, badge } from '../calc.js';
import { MULTA_ESTADOS } from '../constants.js';

export function multasFiltradas() {
  let L = S.multas.slice();
  if (ui.muAuto) L = L.filter(m => m.carId === ui.muAuto);
  if (ui.muEstado) L = L.filter(m => m.estado === ui.muEstado);
  L.sort((a, b) => ui.muOrden === 'monto' ? (+b.monto || 0) - (+a.monto || 0) : b.fecha.localeCompare(a.fecha));
  return L;
}
function seccionResumen(L) {
  const total = L.reduce((a, m) => a + (+m.monto || 0), 0);
  const pend = L.filter(m => m.estado === 'pendiente' || m.estado === 'vencida').length;
  return '<div class="grid" style="margin-bottom:14px">' +
    '<div class="kpi ' + (pend ? 'warn' : '') + '"><div class="n">' + pend + '</div><div class="l">Pendientes</div></div>' +
    '<div class="kpi"><div class="n">' + money(total) + '</div><div class="l">Total del período</div></div>' +
  '</div>';
}
export function viewMultas() {
  if (!S.multas.length) {
    return '<h1>Multas</h1><p class="sub">Todas las infracciones de la flota</p>' +
    '<div class="row" style="margin-bottom:14px"><button class="btn grow" onclick="multaForm()">+ Registrar multa</button></div>' +
    '<div class="card empty">Todavía no hay multas registradas.</div>';
  }
  const L = multasFiltradas();
  const cars = S.cars.filter(c => !c.vendido).slice().sort((a, b) => String(a.patente).localeCompare(String(b.patente)));
  let h = '<h1>Multas</h1><p class="sub">Todas las infracciones de la flota</p>' +
  '<div class="row" style="margin-bottom:14px"><button class="btn grow" onclick="multaForm()">+ Registrar multa</button></div>';
  h += seccionResumen(L);
  h += '<div class="two" style="margin:10px 0"><label class="f"><span>Auto</span><select onchange="ui.muAuto=this.value;render()"><option value="">Todos los autos</option>' + cars.map(c => '<option value="' + c.id + '"' + (ui.muAuto === c.id ? ' selected' : '') + '>' + esc(c.patente) + '</option>').join('') + '</select></label>' +
  '<label class="f"><span>Estado</span><select onchange="ui.muEstado=this.value;render()"><option value="">Todos</option>' + MULTA_ESTADOS.map(x => '<option value="' + x[0] + '"' + (ui.muEstado === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select></label></div>';
  h += '<label class="f" style="margin-bottom:10px"><span>Ordenar por</span><select onchange="ui.muOrden=this.value;render()"><option value="fecha"' + (ui.muOrden === 'fecha' ? ' selected' : '') + '>Fecha (más reciente primero)</option><option value="monto"' + (ui.muOrden === 'monto' ? ' selected' : '') + '>Monto (mayor primero)</option></select></label>';
  h += '<div id="list"></div>';
  return h;
}
export function listMultas() {
  const L = multasFiltradas();
  if (!L.length) return '<div class="card empty">Ninguna multa coincide con el filtro.</div>';
  const estLabel = e => (MULTA_ESTADOS.find(x => x[0] === e) || [0, e])[1];
  return L.map(m => {
    const c = carById(m.carId);
    return '<div class="card tap" onclick="multaForm(\'' + m.carId + '\',\'' + m.id + '\')"><div class="row between"><div>' + money(m.monto) + ' <span class="small muted">' + fdate(m.fecha) + '</span></div>' + badge(estadoMultaCls(m.estado), estLabel(m.estado)) + '</div>' +
    '<div class="small muted" style="margin-top:4px">' + esc(c ? c.patente : 'Auto eliminado') + (m.choferId ? ' · ' + esc(driverName(m.choferId)) : '') + '</div></div>';
  }).join('');
}
