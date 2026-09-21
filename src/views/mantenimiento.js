import { S, ui } from '../state.js';
import { esc, money, fdate } from '../utils.js';
import { carById } from '../calc.js';

export function viewMantenimiento() {
  if (!S.cars.length) return '<h1>Mantenimiento</h1><p class="sub">Bitácora de todos los mantenimientos de la flota</p><div class="card empty">Cargá autos para empezar a registrar mantenimientos.</div>';
  const proveedores = S.proveedores.slice().sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
  return '<h1>Mantenimiento</h1><p class="sub">Bitácora de todos los mantenimientos de la flota</p>' +
  '<div class="bar"><input type="search" placeholder="Buscar patente, ítem o notas" value="' + esc(ui.qMant) + '" oninput="ui.qMant=this.value;renderList()"></div>' +
  '<div class="two" style="margin:10px 0"><label class="f"><span>Desde</span><input type="date" value="' + esc(ui.mantDesde) + '" oninput="ui.mantDesde=this.value;renderList()"></label>' +
  '<label class="f"><span>Hasta</span><input type="date" value="' + esc(ui.mantHasta) + '" oninput="ui.mantHasta=this.value;renderList()"></label></div>' +
  (proveedores.length ? '<label class="f" style="margin-bottom:10px"><span>Taller</span><select onchange="ui.mantProveedor=this.value;renderList()"><option value="">Todos los talleres</option>' + proveedores.map(p => '<option value="' + p.id + '"' + (ui.mantProveedor === p.id ? ' selected' : '') + '>' + esc(p.nombre) + '</option>').join('') + '</select></label>' : '') +
  '<div id="list"></div>';
}
export function listMantenimiento() {
  const q = (ui.qMant || '').trim().toLowerCase();
  let L = S.mantenimientos.slice();
  if (q) L = L.filter(m => { const c = carById(m.carId); return [(c && c.patente) || '', m.label, m.item, m.notas].join(' ').toLowerCase().includes(q); });
  if (ui.mantProveedor) L = L.filter(m => m.proveedorId === ui.mantProveedor);
  if (ui.mantDesde) L = L.filter(m => m.fecha >= ui.mantDesde);
  if (ui.mantHasta) L = L.filter(m => m.fecha <= ui.mantHasta);
  L.sort((a, b) => b.fecha.localeCompare(a.fecha));
  if (!L.length) return '<div class="card empty">' + (S.mantenimientos.length ? 'Ningún mantenimiento coincide con el filtro.' : 'Todavía no hay mantenimientos registrados. Se cargan desde "+ Registrar mantenimiento" en la ficha de cada auto.') + '</div>';
  const provName = id => { const p = S.proveedores.find(x => x.id === id); return p ? p.nombre : ''; };
  return L.map(m => {
    const c = carById(m.carId);
    return '<div class="card tap" onclick="mantenimientoForm(\'' + m.carId + '\',\'' + m.id + '\')"><div class="row between"><div>' + money(m.costo) + ' <span class="small muted">' + esc(m.label || m.item) + (m.tipo === 'correctivo' ? ' · correctivo' : '') + '</span></div><div class="small muted">' + fdate(m.fecha) + '</div></div>' +
    '<div class="small muted" style="margin-top:4px">' + esc(c ? c.patente : 'Auto eliminado') + (m.proveedorId ? ' · ' + esc(provName(m.proveedorId)) : '') + (m.km ? ' · ' + (+m.km).toLocaleString('es-AR') + ' km' : '') + '</div></div>';
  }).join('');
}
