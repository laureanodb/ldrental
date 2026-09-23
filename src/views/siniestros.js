import { S, ui } from '../state.js';
import { esc, money, fdate } from '../utils.js';
import { carById, driverName, badge } from '../calc.js';
import { TIPOS_SINIESTRO, SINIESTRO_ESTADOS } from '../constants.js';

export function siniestrosFiltrados() {
  let L = S.siniestros.slice();
  if (ui.siAuto) L = L.filter(s => s.carId === ui.siAuto);
  if (ui.siEstado) L = L.filter(s => s.estado === ui.siEstado);
  L.sort((a, b) => ui.siOrden === 'costo' ? (+b.costoTaller || 0) - (+a.costoTaller || 0) : b.fecha.localeCompare(a.fecha));
  return L;
}
function seccionResumen(L) {
  const total = L.reduce((a, s) => a + (+s.costoTaller || 0), 0);
  const abiertos = L.filter(s => s.estado !== 'cerrado').length;
  return '<div class="grid" style="margin-bottom:14px">' +
    '<div class="kpi ' + (abiertos ? 'warn' : '') + '"><div class="n">' + abiertos + '</div><div class="l">Abiertos</div></div>' +
    '<div class="kpi"><div class="n">' + money(total) + '</div><div class="l">Costo de reparación total</div></div>' +
  '</div>';
}
export function viewSiniestros() {
  if (!S.siniestros.length) {
    return '<h1>Siniestros</h1><p class="sub">Todos los siniestros de la flota</p>' +
    '<div class="row" style="margin-bottom:14px"><button class="btn grow" onclick="siniestroForm()">+ Registrar siniestro</button></div>' +
    '<div class="card empty">Todavía no hay siniestros registrados.</div>';
  }
  const L = siniestrosFiltrados();
  const cars = S.cars.filter(c => !c.vendido).slice().sort((a, b) => String(a.patente).localeCompare(String(b.patente)));
  let h = '<h1>Siniestros</h1><p class="sub">Todos los siniestros de la flota</p>' +
  '<div class="row" style="margin-bottom:14px"><button class="btn grow" onclick="siniestroForm()">+ Registrar siniestro</button></div>';
  h += seccionResumen(L);
  h += '<div class="two" style="margin:10px 0"><label class="f"><span>Auto</span><select onchange="ui.siAuto=this.value;render()"><option value="">Todos los autos</option>' + cars.map(c => '<option value="' + c.id + '"' + (ui.siAuto === c.id ? ' selected' : '') + '>' + esc(c.patente) + '</option>').join('') + '</select></label>' +
  '<label class="f"><span>Estado</span><select onchange="ui.siEstado=this.value;render()"><option value="">Todos</option>' + SINIESTRO_ESTADOS.map(x => '<option value="' + x[0] + '"' + (ui.siEstado === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select></label></div>';
  h += '<label class="f" style="margin-bottom:10px"><span>Ordenar por</span><select onchange="ui.siOrden=this.value;render()"><option value="fecha"' + (ui.siOrden === 'fecha' ? ' selected' : '') + '>Fecha (más reciente primero)</option><option value="costo"' + (ui.siOrden === 'costo' ? ' selected' : '') + '>Costo (mayor primero)</option></select></label>';
  h += '<div id="list"></div>';
  return h;
}
export function listSiniestros() {
  const L = siniestrosFiltrados();
  if (!L.length) return '<div class="card empty">Ningún siniestro coincide con el filtro.</div>';
  const tipoLabel = t => (TIPOS_SINIESTRO.find(x => x[0] === t) || [0, t])[1];
  const estLabel = e => (SINIESTRO_ESTADOS.find(x => x[0] === e) || [0, e])[1];
  return L.map(s => {
    const c = carById(s.carId);
    return '<div class="card tap" onclick="siniestroForm(\'' + s.carId + '\',\'' + s.id + '\')"><div class="row between"><div>' + esc(tipoLabel(s.tipo)) + ' <span class="small muted">' + fdate(s.fecha) + '</span></div>' + badge(s.estado === 'cerrado' ? 'mute' : s.estado === 'tramite' ? 'warn' : 'bad', estLabel(s.estado)) + '</div>' +
    '<div class="small muted" style="margin-top:4px">' + esc(c ? c.patente : 'Auto eliminado') + (s.choferId ? ' · ' + esc(driverName(s.choferId)) : '') + (s.costoTaller ? ' · ' + money(s.costoTaller) : '') + '</div></div>';
  }).join('');
}
