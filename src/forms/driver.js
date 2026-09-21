import { $, esc, val, uid, money, fdate } from '../utils.js';
import { S } from '../state.js';
import { DOCS, RATINGS } from '../constants.js';
import { plate, driverDebt, carHistoryForDriver, driverScore } from '../calc.js';
import { openModal, closeModal, toast } from '../modal.js';
import { save, remove } from '../data.js';
import { renderFiles, purgeFiles } from '../files.js';
import { isAdmin } from '../roles.js';

function telRow(t) {
  t = t || {};
  return '<div class="two d-tel"><input class="d-tel-etq" placeholder="Etiqueta (familiar, taller...)" value="' + esc(t.etiqueta) + '">' +
  '<div class="row"><input class="d-tel-num grow" type="tel" placeholder="Teléfono" value="' + esc(t.tel) + '"><button class="btn danger sm" onclick="this.closest(\'.d-tel\').remove()">✕</button></div></div>';
}
export function addTelRow() { $('#d_tels').insertAdjacentHTML('beforeend', telRow()); }

export function driverForm(id) {
  const ex = S.drivers.find(x => x.id === id);
  const d = ex || { docs: {} };
  let h = '<h3>' + (ex ? esc(d.nombre) : 'Nuevo chofer') + '</h3>';
  if (ex && d.inactivo) h += '<div class="card" style="margin-bottom:10px"><span class="badge b-mute">Inactivo</span></div>';
  if (ex && d.prospecto) h += '<div class="card" style="margin-bottom:10px"><span class="badge b-info">Prospecto</span></div>';
  if (ex) {
    const cars = S.cars.filter(c => c.choferId === d.id); const debt = driverDebt(d.id); const score = driverScore(d.id);
    h += '<div class="card"><div class="row between"><span class="muted">Autos</span><span>' + (cars.length ? cars.map(c => plate(c.patente)).join(' ') : 'Ninguno') + '</span></div>' +
    '<div class="row between"><span class="muted">Deuda</span><b style="color:' + (debt > 0 ? 'var(--bad)' : 'var(--ok)') + '">' + money(debt) + '</b></div>' +
    (score != null ? '<div class="row between"><span class="muted">Puntualidad</span><b>' + score + '%</b></div>' : '') + '</div>';
  }
  h += '<label class="f"><span>Nombre y apellido</span><input id="d_nombre" value="' + esc(d.nombre) + '"></label>' +
  '<label class="chk"><input type="checkbox" id="d_prospecto"' + (d.prospecto ? ' checked' : '') + '><span>Es un prospecto (todavía no firmó contrato)</span></label>' +
  '<div class="two"><label class="f"><span>DNI</span><input id="d_dni" inputmode="numeric" value="' + esc(d.dni) + '"></label>' +
  '<label class="f"><span>Vence la licencia</span><input id="d_lic" type="date" value="' + esc(d.licVenc) + '"></label></div>' +
  '<label class="f"><span>Teléfono <small>con código de país, ej: +5491155551234</small></span><input id="d_tel" type="tel" value="' + esc(d.tel) + '"></label>' +
  '<div class="two"><label class="f"><span>Fecha de nacimiento</span><input id="d_nac" type="date" value="' + esc(d.fechaNacimiento) + '"></label>' +
  '<label class="f"><span>Calificación</span><select id="d_rating"><option value="">Sin calificar</option>' + RATINGS.map(x => '<option value="' + x[0] + '"' + (d.rating === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select></label></div>' +
  '<label class="f"><span>Domicilio</span><input id="d_dom" value="' + esc(d.domicilio) + '"></label>' +
  '<div class="sec-t">Contacto de emergencia</div><div class="two"><label class="f"><span>Nombre</span><input id="d_emerg_nombre" value="' + esc((d.contactoEmergencia || {}).nombre) + '"></label>' +
  '<label class="f"><span>Teléfono</span><input id="d_emerg_tel" type="tel" value="' + esc((d.contactoEmergencia || {}).tel) + '"></label></div>' +
  '<div class="sec-t">Teléfonos adicionales</div><div id="d_tels">' + (d.otrosTelefonos || []).map(telRow).join('') + '</div>' +
  '<button class="btn sec sm" style="margin-bottom:14px" onclick="addTelRow()">+ Agregar teléfono</button>' +
  '<div class="sec-t">Documentación entregada</div>' + DOCS.map(x => '<label class="chk"><input type="checkbox" id="dc_' + x[0] + '"' + (d.docs && d.docs[x[0]] ? ' checked' : '') + '><span>' + x[1] + '</span></label>').join('') +
  '<div class="sec-t">Archivos</div><div id="files"></div><div id="fstatus" class="small" style="margin:-4px 0 12px;overflow-wrap:anywhere"></div>' +
  '<label class="f" style="margin-top:14px"><span>Notas</span><textarea id="d_notas">' + esc(d.notas) + '</textarea></label>' +
  '<div class="row"><button class="btn grow" onclick="saveDriver(' + (ex ? "'" + d.id + "'" : 'null') + ')">Guardar</button><button class="btn sec" onclick="closeModal()">Cancelar</button></div>';
  if (ex) {
    const San = S.sanciones.filter(s => s.driverId === d.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
    h += '<div class="sec-t">Sanciones</div>';
    if (San.length) h += San.map(s => '<div class="card row"><div class="grow"><div class="small muted">' + fdate(s.fecha) + '</div><div>' + esc(s.motivo) + '</div></div>' + (isAdmin() ? '<button class="btn danger sm" onclick="confirmDel(this,()=>delSancion(\'' + s.id + '\'))">Borrar</button>' : '') + '</div>').join('');
    else h += '<div class="small muted" style="margin-bottom:8px">Sin sanciones registradas.</div>';
    h += '<button class="btn sec block" style="margin:8px 0 20px" onclick="sancionForm(\'' + d.id + '\')">+ Agregar sanción</button>';
    const H = carHistoryForDriver(d.id);
    if (H.length) h += '<div class="sec-t">Historial de autos</div>' + H.map(x => '<div class="row between small" style="padding:4px 0"><span>' + esc(x.patente || 'Auto eliminado') + '</span><span class="muted">' + fdate(x.desde) + ' – ' + (x.hasta ? fdate(x.hasta) : 'actual') + '</span></div>').join('');
    h += '<div class="row" style="margin-top:20px"><button class="btn sec grow" onclick="toggleInactivo(\'' + d.id + '\')">' + (d.inactivo ? 'Reactivar' : 'Marcar como inactivo') + '</button></div>' +
    (isAdmin() ? '<div style="margin-top:8px"><button class="btn danger block" onclick="confirmDel(this,()=>delDriver(\'' + d.id + '\'))">Eliminar chofer</button></div>' : '');
  }
  openModal(h); renderFiles('drivers', ex ? ex.id : null);
}
export async function saveDriver(id) {
  const nombre = val('d_nombre');
  if (!nombre) { toast('Falta el nombre'); return; }
  const docs = {}; DOCS.forEach(x => { docs[x[0]] = document.getElementById('dc_' + x[0]).checked; });
  const otrosTelefonos = [...document.querySelectorAll('.d-tel')].map(row => ({
    etiqueta: row.querySelector('.d-tel-etq').value.trim(), tel: row.querySelector('.d-tel-num').value.trim()
  })).filter(t => t.tel);
  const ex = S.drivers.find(x => x.id === id);
  const o = {
    id: id || uid(), nombre, dni: val('d_dni'), licVenc: val('d_lic'), tel: val('d_tel'), domicilio: val('d_dom'), notas: val('d_notas'), docs,
    fechaNacimiento: val('d_nac'), rating: val('d_rating'),
    contactoEmergencia: { nombre: val('d_emerg_nombre'), tel: val('d_emerg_tel') },
    otrosTelefonos, inactivo: (ex || {}).inactivo || false, prospecto: document.getElementById('d_prospecto').checked,
    files: (ex || {}).files || []
  };
  if (await save('drivers', o)) { closeModal(); toast('Chofer guardado'); }
}
export async function toggleInactivo(id) {
  const d = S.drivers.find(x => x.id === id); if (!d) return;
  if (await save('drivers', Object.assign({}, d, { inactivo: !d.inactivo }))) { closeModal(); toast(d.inactivo ? 'Chofer reactivado' : 'Chofer marcado como inactivo'); }
}
export async function delDriver(id) {
  await purgeFiles(S.drivers.find(x => x.id === id));
  for (const c of S.cars.filter(c => c.choferId === id)) await save('cars', Object.assign({}, c, { choferId: '', tipo: 'disponible' }));
  if (await remove('drivers', id)) { closeModal(); toast('Chofer eliminado'); }
}
