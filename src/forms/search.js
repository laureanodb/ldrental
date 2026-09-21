import { $, esc, money, fdate } from '../utils.js';
import { S } from '../state.js';
import { openModal } from '../modal.js';
import { plate, driverName, carById } from '../calc.js';
import { TIPOS_INFRACCION } from '../constants.js';

export function searchView() {
  const h = '<h3>Buscar</h3><input id="sr_q" type="search" placeholder="Patente, marca, chofer, DNI..." oninput="doSearch()"><div id="sr_results" style="margin-top:12px"></div>';
  openModal(h);
  setTimeout(() => { const el = $('#sr_q'); if (el) el.focus(); }, 50);
}
export function doSearch() {
  const input = $('#sr_q'), el = $('#sr_results');
  if (!input || !el) return;
  const q = input.value.trim().toLowerCase();
  if (!q) { el.innerHTML = ''; return; }
  const autos = S.cars.filter(c => [c.patente, c.marca, c.modelo, driverName(c.choferId)].join(' ').toLowerCase().includes(q)).slice(0, 8);
  const choferes = S.drivers.filter(d => [d.nombre, d.dni, d.tel].join(' ').toLowerCase().includes(q)).slice(0, 8);
  const cobros = S.payments.filter(p => { const c = carById(p.carId); return c && [c.patente, driverName(p.choferId), p.nota].join(' ').toLowerCase().includes(q); }).slice(0, 8);
  const tipoLabel = k => (TIPOS_INFRACCION.find(x => x[0] === k) || [0, ''])[1];
  const multas = S.multas.filter(m => { const c = carById(m.carId); return [c && c.patente, driverName(m.choferId), m.numeroActa, tipoLabel(m.tipoInfraccion), m.organismo].join(' ').toLowerCase().includes(q); }).slice(0, 8);
  let h = '';
  if (autos.length) h += '<div class="sec-t">Autos</div>' + autos.map(c => '<div class="card tap" onclick="carForm(\'' + c.id + '\')">' + plate(c.patente) + ' <span class="small muted">' + esc([c.marca, c.modelo].filter(Boolean).join(' ')) + '</span></div>').join('');
  if (choferes.length) h += '<div class="sec-t">Choferes</div>' + choferes.map(d => '<div class="card tap" onclick="driverForm(\'' + d.id + '\')">' + esc(d.nombre) + '</div>').join('');
  if (cobros.length) h += '<div class="sec-t">Cobros</div>' + cobros.map(p => { const c = carById(p.carId); return '<div class="card tap" onclick="carForm(\'' + c.id + '\')">' + money(p.monto) + ' <span class="small muted">' + fdate(p.fecha) + ' · ' + esc(c.patente) + '</span></div>'; }).join('');
  if (multas.length) h += '<div class="sec-t">Multas</div>' + multas.map(m => { const c = carById(m.carId); return '<div class="card tap" onclick="multaForm(\'' + m.carId + '\',\'' + m.id + '\')">' + money(m.monto) + ' <span class="small muted">' + fdate(m.fecha) + ' · ' + esc(c ? c.patente : '') + '</span></div>'; }).join('');
  el.innerHTML = h || '<div class="small muted">Sin resultados.</div>';
}
