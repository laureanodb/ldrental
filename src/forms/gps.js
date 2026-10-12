// GPS conectado: la plataforma del GPS manda los reportes a la función
// gps-webhook y quedan en cada auto. Acá se configura (clave, velocidad máxima,
// batería mínima, zonas permitidas) y se ve el estado y el manejo de cada chofer.
import { S } from '../state.js';
import { esc, val, uid, fdate, parse, days, today } from '../utils.js';
import { openModal, toast } from '../modal.js';
import { de } from '../memo.js';
import { settings, saveSettings } from '../settings.js';
import { SUPABASE_URL } from '../config.js';
import { badge, driverName } from '../calc.js';
import { isSnoozed } from '../snooze.js';

const cfg = () => settings.gpsConfig || {};
const zonas = () => settings.gpsZonas || [];
const urlWebhook = () => SUPABASE_URL + '/functions/v1/gps-webhook?t=' + (cfg().token || '');
const haceTxt = isoStr => {
  if (!isoStr) return 'nunca';
  const min = Math.round((Date.now() - Date.parse(isoStr)) / 60000);
  if (min < 60) return 'hace ' + Math.max(1, min) + ' min';
  const h = Math.round(min / 60); if (h < 48) return 'hace ' + h + ' h';
  return 'hace ' + Math.round(h / 24) + ' días';
};
const ETIQ = { exceso: 'Exceso de velocidad', frenada: 'Frenada brusca', aceleracion: 'Aceleración brusca', zona: 'Salió de la zona', zona_vuelta: 'Volvió a la zona', bateria: 'Batería baja' };

export function eventosGps(dias = 30, filtro) {
  const desde = Date.now() - dias * 864e5;
  const out = [];
  S.cars.forEach(c => (c.gpsEventos || []).forEach(e => { if (Date.parse(e.fecha) >= desde && (!filtro || filtro(e, c))) out.push(Object.assign({ carId: c.id, patente: c.patente }, e)); }));
  return out.sort((a, b) => String(b.fecha).localeCompare(a.fecha));
}
export function manejoPorChofer(dias = 30) {
  const G = {};
  eventosGps(dias).filter(e => e.choferId && ['exceso', 'frenada', 'aceleracion'].includes(e.tipo)).forEach(e => {
    const g = G[e.choferId] = G[e.choferId] || { choferId: e.choferId, exceso: 0, frenada: 0, aceleracion: 0, maxVel: 0 };
    g[e.tipo]++; if (e.tipo === 'exceso' && +e.valor > g.maxVel) g.maxVel = +e.valor;
  });
  return Object.values(G).map(g => Object.assign(g, { total: g.exceso + g.frenada + g.aceleracion })).sort((a, b) => b.total - a.total);
}

/* ---------- Pantalla principal ---------- */
export function gpsView() {
  const c = cfg();
  const autos = S.cars.filter(x => !x.vendido).sort((a, b) => String(a.patente).localeCompare(String(b.patente)));
  const conGps = autos.filter(x => x.gpsId);
  const manejo = manejoPorChofer(30);
  let h = '<h3>GPS de la flota</h3>';
  if (!c.token) {
    h += '<div class="card"><b>Conectá tus GPS</b><div class="small muted" style="margin:6px 0 10px">La plataforma de tu GPS (Traccar, Wialon, la de tu proveedor) tiene que poder mandar los reportes a una dirección web. Generá la dirección y pasásela a tu proveedor.</div>' +
      '<button class="btn block" onclick="generarClaveGps()">Generar la dirección para el GPS</button></div>';
  } else {
    h += '<div class="card"><div class="small muted">Dirección para la plataforma del GPS (método POST):</div><input readonly value="' + esc(urlWebhook()) + '" onclick="this.select()" style="margin:6px 0">' +
      '<div class="row"><button class="btn sec sm grow" onclick="copiarUrlGps()">Copiar</button><button class="btn sec sm" onclick="confirmDel(this,()=>generarClaveGps())">Cambiar la clave</button></div>' +
      '<div class="small muted" style="margin-top:6px">Acepta el formato de Traccar o uno simple con imei/patente, lat, lng, velocidad, odómetro y batería. En cada auto cargá el ID del equipo (IMEI) en Datos → Ubicación y GPS, o usá la patente como nombre del equipo.</div></div>';
  }
  h += '<div class="sec-t">Avisos</div><div class="card"><div class="two"><label class="f"><span>Velocidad máxima (km/h)</span><input id="gps_vel" inputmode="numeric" value="' + esc(c.velocidadMax || 120) + '"></label>' +
    '<label class="f"><span>Batería mínima (voltios)</span><input id="gps_bat" inputmode="decimal" value="' + esc(c.bateriaMinV || 11.8) + '"></label></div>' +
    '<button class="btn sec block" onclick="guardarConfigGps()">Guardar</button></div>';
  h += '<div class="sec-t row between">Zonas permitidas<button class="btn sec sm" onclick="zonaGpsForm()">+ Agregar zona</button></div>' +
    (zonas().length ? zonas().map(z => '<div class="card row between"><div><b>' + esc(z.nombre || 'Zona') + '</b><div class="small muted">Radio ' + z.radioKm + ' km · ' + (z.carIds && z.carIds.length ? z.carIds.length + ' autos' : 'todos los autos') + '</div></div><div class="row"><a class="btn sec sm" target="_blank" rel="noopener" href="https://maps.google.com/?q=' + z.lat + ',' + z.lng + '">Ver</a><button class="btn danger sm" onclick="confirmDel(this,()=>borrarZonaGps(\'' + z.id + '\'))">Quitar</button></div></div>').join('')
      : '<div class="small muted" style="margin-bottom:10px">Sin zonas: no se avisa por salir de zona. Ej: un círculo de 60 km alrededor de la cochera.</div>');
  h += '<div class="sec-t">Autos (' + conGps.length + ' con GPS conectado)</div>' + autos.map(x => {
    const g = x.gps || {};
    const viejo = g.fecha && Date.now() - Date.parse(g.fecha) > 48 * 3600e3;
    return '<div class="card"><div class="row between"><b class="tap" onclick="carForm(\'' + x.id + '\')">' + esc(x.patente) + '</b>' +
      (!x.gpsId && !g.fecha ? badge('mute', 'Sin GPS conectado') : g.fueraDeZona ? badge('bad', 'Fuera de zona') : viejo ? badge('warn', 'No reporta') : g.fecha ? badge('ok', 'Reportando') : badge('soft', 'Esperando reportes')) + '</div>' +
      (g.fecha ? '<div class="small muted">' + haceTxt(g.fecha) + (g.velocidad != null ? ' · ' + g.velocidad + ' km/h' : '') + (g.bateria != null ? ' · batería ' + g.bateria + ' V' : '') + (x.km ? ' · ' + Number(x.km).toLocaleString('es-AR') + ' km' : '') +
        (g.lat != null ? ' · <a class="tap" style="text-decoration:underline" target="_blank" rel="noopener" href="https://maps.google.com/?q=' + g.lat + ',' + g.lng + '">ver en el mapa</a>' : '') + '</div>' : '') + '</div>';
  }).join('');
  h += '<div class="sec-t">Manejo por chofer (30 días)</div>' + (manejo.length ? manejo.map(m => '<div class="card row between tap" onclick="driverForm(\'' + m.choferId + '\')"><span>' + esc(driverName(m.choferId) || 'Chofer') + '</span><span class="small">' +
    [m.exceso ? m.exceso + ' excesos' + (m.maxVel ? ' (máx ' + m.maxVel + ' km/h)' : '') : '', m.frenada ? m.frenada + ' frenadas' : '', m.aceleracion ? m.aceleracion + ' aceleraciones' : ''].filter(Boolean).join(' · ') + '</span></div>').join('') : '<div class="small muted">Sin excesos ni maniobras bruscas registradas.</div>');
  h += '<button class="btn sec block" style="margin-top:10px" onclick="closeModal()">Cerrar</button>';
  openModal(h);
}
export function generarClaveGps() {
  saveSettings({ gpsConfig: Object.assign({}, cfg(), { token: uid() + uid() + uid() }) });
  toast('Dirección generada: pasásela a tu proveedor de GPS'); gpsView();
}
export async function copiarUrlGps() {
  try { await navigator.clipboard.writeText(urlWebhook()); toast('Copiada'); } catch (e) { toast('Seleccioná el texto y copialo a mano'); }
}
export function guardarConfigGps() {
  const vel = Math.round(+val('gps_vel') || 120), bat = +String(val('gps_bat')).replace(',', '.') || 11.8;
  saveSettings({ gpsConfig: Object.assign({}, cfg(), { velocidadMax: vel, bateriaMinV: bat }) });
  toast('Guardado'); gpsView();
}
export function zonaGpsForm() {
  const autos = S.cars.filter(x => !x.vendido);
  openModal('<h3>Zona permitida</h3><div class="small muted" style="margin-bottom:10px">Un círculo: si el auto sale, te llega un aviso. Podés usar tu ubicación actual (por ejemplo, parado en la cochera) o pegar las coordenadas de Google Maps.</div>' +
    '<label class="f"><span>Nombre</span><input id="zg_nombre" placeholder="ej: AMBA"></label>' +
    '<div class="two"><label class="f"><span>Latitud</span><input id="zg_lat" inputmode="decimal"></label><label class="f"><span>Longitud</span><input id="zg_lng" inputmode="decimal"></label></div>' +
    '<button class="btn sec sm block" style="margin-bottom:10px" onclick="ubicacionZonaGps()">Usar mi ubicación actual</button>' +
    '<label class="f"><span>Radio (km)</span><input id="zg_radio" inputmode="decimal" value="60"></label>' +
    '<div class="small muted" style="margin-bottom:4px">Para qué autos <small>(ninguno marcado = todos)</small></div>' +
    autos.map(x => '<label class="chk"><input type="checkbox" class="zg_car" value="' + x.id + '"><span>' + esc(x.patente) + '</span></label>').join('') +
    '<div class="row" style="margin-top:10px"><button class="btn grow" onclick="guardarZonaGps()">Guardar zona</button><button class="btn sec" onclick="gpsView()">Volver</button></div>');
}
export function ubicacionZonaGps() {
  if (!navigator.geolocation) { toast('Este celular no da la ubicación'); return; }
  toast('Buscando tu ubicación…');
  navigator.geolocation.getCurrentPosition(p => { document.getElementById('zg_lat').value = p.coords.latitude.toFixed(6); document.getElementById('zg_lng').value = p.coords.longitude.toFixed(6); toast('Listo'); }, () => toast('No se pudo tomar la ubicación'), { enableHighAccuracy: true, timeout: 12000 });
}
export function guardarZonaGps() {
  const lat = +String(val('zg_lat')).replace(',', '.'), lng = +String(val('zg_lng')).replace(',', '.'), radioKm = +String(val('zg_radio')).replace(',', '.');
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !lat || !lng || Math.abs(lat) > 90 || Math.abs(lng) > 180) { toast('Revisá la latitud y la longitud'); return; }
  if (!(radioKm > 0)) { toast('Poné el radio en km'); return; }
  const carIds = [...document.querySelectorAll('.zg_car:checked')].map(x => x.value);
  saveSettings({ gpsZonas: zonas().concat([{ id: uid(), nombre: val('zg_nombre') || 'Zona', lat, lng, radioKm, carIds }]) });
  toast('Zona guardada'); gpsView();
}
export function borrarZonaGps(id) { saveSettings({ gpsZonas: zonas().filter(z => z.id !== id) }); toast('Zona quitada'); gpsView(); }

/* ---------- En la ficha del auto y del chofer ---------- */
export function campoGpsId(c) {
  const g = c.gps || {};
  return '<label class="f"><span>ID del equipo GPS <small>IMEI, para recibir los reportes (Más → GPS de la flota)</small></span><input id="c_gpsId" value="' + esc(c.gpsId || '') + '"></label>' +
    (g.fecha ? '<div class="small muted" style="margin:-6px 0 10px">Último reporte ' + haceTxt(g.fecha) + (g.lat != null ? ' · <a class="tap" style="text-decoration:underline" target="_blank" rel="noopener" href="https://maps.google.com/?q=' + g.lat + ',' + g.lng + '">ver en el mapa</a>' : '') + (g.fueraDeZona ? ' · <b style="color:var(--bad)">fuera de zona</b>' : '') + '</div>' : '');
}
export function seccionManejoChofer(driverId) {
  const E = eventosGps(30, e => e.choferId === driverId && ['exceso', 'frenada', 'aceleracion'].includes(e.tipo));
  if (!E.length) return '';
  return '<div class="sec-t">Manejo según el GPS (30 días)</div>' + E.slice(0, 15).map(e => '<div class="row between small" style="padding:3px 0"><span>' + esc(ETIQ[e.tipo] || e.tipo) + (e.tipo === 'exceso' && e.valor ? ' · ' + e.valor + ' km/h' : '') + ' · ' + esc(e.patente || '') + '</span><span class="muted">' + fdate(String(e.fecha).slice(0, 10)) + '</span></div>').join('') +
    (E.length > 15 ? '<div class="small muted">y ' + (E.length - 15) + ' más</div>' : '');
}

/* ---------- Avisos ---------- */
export function alertasGps() {
  const out = [];
  const add = o => { if (!isSnoozed(o.key)) out.push(o); };
  const c0 = cfg();
  S.cars.filter(c => !c.vendido && (c.gpsId || c.gps)).forEach(c => {
    const g = c.gps || {};
    if (g.fueraDeZona && g.fecha && Date.now() - Date.parse(g.fecha) < 72 * 3600e3) add({ who: c.patente, sub: 'GPS: fuera de la zona permitida', kind: 'car', id: c.id, key: 'car:' + c.id + ':gpszona:' + String(g.fecha).slice(0, 10), d: -1, cls: 'bad', t: haceTxt(g.fecha), accion: 'gpsView()' });
    if (g.bateria != null && g.bateria > 5 && g.bateria < (+c0.bateriaMinV || 11.8) && Date.now() - Date.parse(g.fecha) < 48 * 3600e3) add({ who: c.patente, sub: 'GPS: batería baja', kind: 'car', id: c.id, key: 'car:' + c.id + ':gpsbat:' + String(g.fecha).slice(0, 10), d: 0, cls: 'warn', t: g.bateria + ' V' });
    if (c.gpsId && c0.token && (!g.fecha || Date.now() - Date.parse(g.fecha) > 48 * 3600e3)) add({ who: c.patente, sub: 'GPS: no reporta', kind: 'car', id: c.id, key: 'car:' + c.id + ':gpsmudo:' + String(g.fecha || 'nunca').slice(0, 10), d: 2, cls: 'soft', t: g.fecha ? 'Último reporte ' + haceTxt(g.fecha) : 'Nunca reportó', accion: 'gpsView()' });
  });
  manejoPorChofer(7).filter(m => m.exceso >= 5 || m.frenada + m.aceleracion >= 8).forEach(m => {
    const d = de('drivers', 'id', m.choferId)[0]; if (!d || d.inactivo) return;
    add({ who: d.nombre, sub: 'Manejo riesgoso según el GPS (7 días)', kind: 'driver', id: d.id, key: 'driver:' + d.id + ':gpsmanejo:' + Math.floor(days(parse('2026-01-05'), today()) / 7), d: 3, cls: 'warn', t: [m.exceso ? m.exceso + ' excesos' : '', m.frenada ? m.frenada + ' frenadas' : '', m.aceleracion ? m.aceleracion + ' aceleraciones' : ''].filter(Boolean).join(', ') });
  });
  return out;
}
