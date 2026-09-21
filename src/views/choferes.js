import { S, ui } from '../state.js';
import { esc, money } from '../utils.js';
import { vs, driverDebt, plate, badge, isContract, driverScore } from '../calc.js';
import { DOCS, RATINGS } from '../constants.js';

export function viewChoferes() {
  const nInactivos = S.drivers.filter(d => d.inactivo && !d.prospecto).length;
  const nProspectos = S.drivers.filter(d => d.prospecto).length;
  const links = [
    nInactivos ? '<span class="tap" style="text-decoration:underline" onclick="ui.showInactivos=!ui.showInactivos;renderList()">' + (ui.showInactivos ? 'ocultar' : 'ver') + ' ' + nInactivos + ' inactivos</span>' : '',
    nProspectos ? '<span class="tap" style="text-decoration:underline" onclick="ui.showProspectos=!ui.showProspectos;renderList()">' + (ui.showProspectos ? 'ocultar' : 'ver') + ' ' + nProspectos + ' prospectos</span>' : ''
  ].filter(Boolean).join(' · ');
  return '<h1>Choferes</h1><p class="sub">' + S.drivers.filter(d => !d.inactivo && !d.prospecto).length + ' en total' + (links ? ' · ' + links : '') + '</p>' +
  '<div class="bar"><input type="search" placeholder="Buscar por nombre o DNI" value="' + esc(ui.qDrivers) + '" oninput="ui.qDrivers=this.value;renderList()"><button class="btn" onclick="driverForm()">Agregar</button></div><div id="list"></div>';
}
export function listChoferes() {
  const q = ui.qDrivers.trim().toLowerCase();
  const L = S.drivers.filter(d => (ui.showInactivos || !d.inactivo) && (ui.showProspectos || !d.prospecto) && (!q || [d.nombre, d.dni, d.tel].join(' ').toLowerCase().includes(q))).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
  if (!L.length) return '<div class="card empty">' + (S.drivers.length ? 'Ningún chofer coincide.' : '<b>Todavía no cargaste choferes</b>Tocá "Agregar" para empezar.') + '</div>';
  return L.map(d => {
    const cars = S.cars.filter(c => c.choferId === d.id);
    const debt = driverDebt(d.id);
    const got = DOCS.filter(x => d.docs && d.docs[x[0]]).length;
    const lic = vs(d.licVenc);
    const ratingLabel = (RATINGS.find(x => x[0] === d.rating) || [])[1];
    let b = d.prospecto ? badge('info', 'Prospecto') : d.inactivo ? badge('mute', 'Inactivo') : (debt > 0 ? badge('bad', 'Debe ' + money(debt)) : (cars.some(isContract) ? badge('ok', 'Al día') : ''));
    if (ratingLabel) b += ' ' + badge(d.rating === 'malo' ? 'bad' : d.rating === 'regular' ? 'soft' : 'ok', ratingLabel);
    b += ' ' + badge(got === DOCS.length ? 'ok' : 'soft', 'Docs ' + got + '/' + DOCS.length);
    if (d.files && d.files.length) b += ' ' + badge('mute', d.files.length + (d.files.length === 1 ? ' archivo' : ' archivos'));
    if (lic && lic.d <= 30) b += ' ' + badge(lic.cls, 'Licencia: ' + lic.t.replace('Vence ', 'vence '));
    const score = driverScore(d.id);
    if (score != null) b += ' ' + badge(score >= 90 ? 'ok' : score >= 70 ? 'soft' : 'bad', score + '% puntual');
    return '<div class="card tap" onclick="driverForm(\'' + d.id + '\')"><div class="row between"><b>' + esc(d.nombre) + '</b><div>' + cars.map(c => plate(c.patente)).join(' ') + '</div></div>' +
    '<div class="small muted">' + esc(d.tel || 'Sin teléfono') + '</div><div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">' + b + '</div></div>';
  }).join('');
}
