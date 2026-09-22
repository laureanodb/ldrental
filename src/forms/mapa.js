import { S } from '../state.js';
import { esc } from '../utils.js';
import { activeCars, driverName, plate } from '../calc.js';
import { openModal } from '../modal.js';

function mapsLink(c) {
  return c.dondeDuermeMaps || ('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(c.dondeDuerme));
}
function embedSrc(c) {
  return 'https://www.google.com/maps?q=' + encodeURIComponent(c.dondeDuerme) + '&output=embed';
}
function tarjeta(c) {
  return '<div class="card"><div class="row between"><div>' + plate(c.patente) + '</div>' +
  '<div class="small muted">' + (c.choferId ? esc(driverName(c.choferId)) : 'Sin chofer') + '</div></div>' +
  '<div class="small muted" style="margin-top:6px">' + esc(c.dondeDuerme) + '</div>' +
  '<div style="border-radius:10px;overflow:hidden;margin-top:8px"><iframe src="' + embedSrc(c) + '" width="100%" height="160" style="display:block;border:0" loading="lazy"></iframe></div>' +
  '<a class="btn sec block" style="margin-top:8px" href="' + esc(mapsLink(c)) + '" target="_blank" rel="noopener">Abrir en Maps</a></div>';
}
function sinUbicacion(cars) {
  if (!cars.length) return '';
  return '<div class="sec-t">Sin ubicación cargada</div>' + cars.map(c => '<div class="card tap row between" onclick="carForm(\'' + c.id + '\')"><div>' + plate(c.patente) + ' <span class="small muted">' + (c.choferId ? esc(driverName(c.choferId)) : 'Sin chofer') + '</span></div><span class="small muted">Cargar</span></div>').join('');
}
export function mapaFlotaView() {
  const flota = activeCars();
  const conUbicacion = flota.filter(c => c.dondeDuerme);
  const sinUbi = flota.filter(c => !c.dondeDuerme);
  const cuerpo = (conUbicacion.length ? conUbicacion.map(tarjeta).join('') : '<div class="card muted">Ningún auto tiene cargada la ubicación de dónde duerme.</div>') + sinUbicacion(sinUbi);
  openModal('<h3>Mapa de flota</h3><div class="small muted" style="margin-bottom:12px">Dónde duerme cada auto de noche.</div>' + cuerpo);
}
