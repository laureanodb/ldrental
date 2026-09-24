import { S, ui } from '../state.js';
import { esc, money, moneyUSD } from '../utils.js';
import { vs, driverDebt, plate, badge, isContract, driverScore, driverEnRiesgo, driverCalificaBono } from '../calc.js';
import { DOCS, RATINGS, ETAPAS_PROSPECTO, ONBOARDING_ITEMS } from '../constants.js';
import { copiarLinkPortal } from '../forms/driver.js';

function linkPostulacion() { return location.origin + location.pathname + '#/postulacion'; }
function tarjetaPostulacion() {
  const url = linkPostulacion();
  return '<div class="card" style="margin-bottom:10px"><div class="small muted" style="margin-bottom:6px">Link público para que alguien interesado se postule solo (sin loguearse). Se crea como prospecto.</div>' +
  '<div class="row"><button class="btn sec sm" onclick="copiarLinkPortal(\'' + esc(url) + '\')">Copiar formulario</button>' +
  '<a class="btn sec sm" target="_blank" href="https://wa.me/?text=' + encodeURIComponent('¿Te interesa manejar con nosotros? Postulate acá: ' + url) + '">WhatsApp</a></div></div>';
}

function embudoResumen() {
  const P = S.drivers.filter(d => d.prospecto);
  if (!P.length) return '';
  return '<div class="card" style="margin-bottom:10px"><div class="small muted" style="margin-bottom:6px">Embudo de prospectos</div>' +
  ETAPAS_PROSPECTO.map(([k, l]) => { const n = P.filter(d => (d.etapaProspecto || 'contacto') === k).length; return n ? '<div class="row between small" style="padding:2px 0"><span>' + l + '</span><b>' + n + '</b></div>' : ''; }).join('') + '</div>';
}
export function viewChoferes() {
  const nInactivos = S.drivers.filter(d => d.inactivo && !d.prospecto).length;
  const nProspectos = S.drivers.filter(d => d.prospecto).length;
  const links = [
    nInactivos ? '<span class="tap" style="text-decoration:underline" onclick="ui.showInactivos=!ui.showInactivos;renderList()">' + (ui.showInactivos ? 'ocultar' : 'ver') + ' ' + nInactivos + ' inactivos</span>' : '',
    nProspectos ? '<span class="tap" style="text-decoration:underline" onclick="ui.showProspectos=!ui.showProspectos;renderList()">' + (ui.showProspectos ? 'ocultar' : 'ver') + ' ' + nProspectos + ' prospectos</span>' : ''
  ].filter(Boolean).join(' · ');
  return '<h1>Choferes</h1><p class="sub">' + S.drivers.filter(d => !d.inactivo && !d.prospecto).length + ' en total' + (links ? ' · ' + links : '') + '</p>' +
  tarjetaPostulacion() +
  (ui.showProspectos ? embudoResumen() : '') +
  '<div class="bar"><input type="search" placeholder="Buscar por nombre o DNI" value="' + esc(ui.qDrivers) + '" oninput="ui.qDrivers=this.value;renderList()"><button class="btn" onclick="altaRapidaChoferForm()">Agregar</button></div>' +
  '<label class="f" style="margin-bottom:10px"><span>Ordenar por</span><select onchange="ui.ordenChoferes=this.value;renderList()">' +
  '<option value="nombre"' + (ui.ordenChoferes === 'nombre' ? ' selected' : '') + '>Nombre (A-Z)</option>' +
  '<option value="deuda"' + (ui.ordenChoferes === 'deuda' ? ' selected' : '') + '>Deuda (mayor primero)</option>' +
  '<option value="puntualidad"' + (ui.ordenChoferes === 'puntualidad' ? ' selected' : '') + '>Puntualidad (peor primero)</option></select></label>' +
  '<div id="list"></div>';
}
export function listChoferes() {
  const q = ui.qDrivers.trim().toLowerCase();
  const L = S.drivers.filter(d => (ui.showInactivos || !d.inactivo) && (ui.showProspectos || !d.prospecto) && (!q || [d.nombre, d.dni, d.tel].join(' ').toLowerCase().includes(q)))
    .sort((a, b) => {
      const fav = Boolean(b.favorito) - Boolean(a.favorito); if (fav) return fav;
      if (ui.ordenChoferes === 'deuda') return driverDebt(b.id) - driverDebt(a.id);
      if (ui.ordenChoferes === 'puntualidad') return (driverScore(a.id) == null ? 101 : driverScore(a.id)) - (driverScore(b.id) == null ? 101 : driverScore(b.id));
      return String(a.nombre).localeCompare(String(b.nombre));
    });
  if (!L.length) return '<div class="card empty">' + (S.drivers.length ? 'Ningún chofer coincide.' : '<b>Todavía no cargaste choferes</b>Tocá "Agregar" para empezar.') + '</div>';
  return L.map(d => {
    const cars = S.cars.filter(c => c.choferId === d.id);
    const debt = driverDebt(d.id);
    const mon = cars.some(c => isContract(c) && c.tipo === 'financiado') ? moneyUSD : money;
    const got = DOCS.filter(x => d.docs && d.docs[x[0]]).length;
    const lic = vs(d.licVenc);
    const ratingLabel = (RATINGS.find(x => x[0] === d.rating) || [])[1];
    const etapaLabel = (ETAPAS_PROSPECTO.find(x => x[0] === d.etapaProspecto) || [0, 'Contacto inicial'])[1];
    let b = d.prospecto ? badge(d.etapaProspecto === 'rechazado' ? 'bad' : d.etapaProspecto === 'aprobado' ? 'ok' : 'info', etapaLabel) : d.inactivo ? badge('mute', 'Inactivo') : (debt > 0 ? badge('bad', 'Debe ' + mon(debt)) : (cars.some(isContract) ? badge('ok', 'Al día') : ''));
    if (ratingLabel) b += ' ' + badge(d.rating === 'malo' ? 'bad' : d.rating === 'regular' ? 'soft' : 'ok', ratingLabel);
    b += ' ' + badge(got === DOCS.length ? 'ok' : 'soft', 'Docs ' + got + '/' + DOCS.length);
    if (!d.prospecto && !d.inactivo) {
      const gotOb = ONBOARDING_ITEMS.filter(x => d.onboarding && d.onboarding[x[0]]).length;
      if (gotOb < ONBOARDING_ITEMS.length) b += ' ' + badge('soft', 'Onboarding ' + gotOb + '/' + ONBOARDING_ITEMS.length);
    }
    if (d.files && d.files.length) b += ' ' + badge('mute', d.files.length + (d.files.length === 1 ? ' archivo' : ' archivos'));
    if (lic && lic.d <= 30) b += ' ' + badge(lic.cls, 'Licencia: ' + lic.t.replace('Vence ', 'vence '));
    const score = driverScore(d.id);
    if (score != null) b += ' ' + badge(score >= 90 ? 'ok' : score >= 70 ? 'soft' : 'bad', score + '% puntual');
    if (!d.prospecto && driverEnRiesgo(d.id)) b += ' ' + badge('bad', 'En riesgo');
    else if (!d.prospecto && driverCalificaBono(d.id)) b += ' ' + badge('ok', 'Bono puntualidad');
    const avatar = d.fotoPerfil ? '<img src="' + d.fotoPerfil + '" alt="" style="width:28px;height:28px;border-radius:50%;object-fit:cover;margin-right:8px;vertical-align:-8px">' : '';
    return '<div class="card tap" onclick="driverForm(\'' + d.id + '\')"><div class="row between"><b><span class="tap" style="margin-right:4px" onclick="event.stopPropagation();toggleFavoritoChofer(\'' + d.id + '\')">' + (d.favorito ? '★' : '☆') + '</span>' + avatar + esc(d.nombre) + '</b><div>' + cars.map(c => plate(c.patente)).join(' ') + '</div></div>' +
    '<div class="small muted">' + esc(d.tel || 'Sin teléfono') + '</div><div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">' + b + '</div></div>';
  }).join('');
}
